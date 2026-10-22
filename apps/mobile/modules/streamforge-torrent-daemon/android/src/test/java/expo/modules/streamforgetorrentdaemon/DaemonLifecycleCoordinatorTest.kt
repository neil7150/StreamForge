package expo.modules.streamforgetorrentdaemon

import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class DaemonLifecycleCoordinatorTest {
  @Test fun returningToForegroundInvalidatesQueuedBackgroundStops() {
    val stops = AtomicInteger()
    val coordinator = DaemonLifecycleCoordinator({ _, _ -> "ready" }, { stops.incrementAndGet() })
    val owner = coordinator.Owner()
    owner.start("cache", 8888)
    val first = owner.background()
    owner.foreground()
    owner.start("cache", 8888)
    owner.stopIfBackground(first)
    assertEquals(0, stops.get())
    val second = owner.background()
    owner.stopIfBackground(first)
    assertEquals(0, stops.get())
    owner.stopIfBackground(second)
    owner.stopIfBackground(second)
    assertEquals(1, stops.get())
  }

  @Test fun destroyedModuleCannotStopItsReplacement() {
    val stops = AtomicInteger()
    val coordinator = DaemonLifecycleCoordinator({ _, _ -> "ready" }, { stops.incrementAndGet() })
    val old = coordinator.Owner()
    old.start("cache", 8888)
    old.destroy()
    val replacement = coordinator.Owner()
    replacement.start("cache", 8888)
    assertEquals(1, stops.get())
    old.stop()
    assertEquals(1, stops.get())
    replacement.stop()
    replacement.stop()
    assertEquals(2, stops.get())
    assertThrows(IllegalStateException::class.java) { old.start("cache", 8888) }
  }

  @Test fun backgroundStartupIsRejectedAndFailedStartupCanBeRetried() {
    val starts = AtomicInteger()
    val stops = AtomicInteger()
    val coordinator = DaemonLifecycleCoordinator({ _, _ ->
      if (starts.incrementAndGet() == 1) error("bind failed")
      "ready"
    }, { stops.incrementAndGet() })
    val owner = coordinator.Owner()
    owner.background()
    assertThrows(IllegalStateException::class.java) { owner.start("cache", 8888) }
    assertEquals(0, starts.get())
    owner.foreground()
    assertThrows(IllegalStateException::class.java) { owner.start("cache", 8888) }
    assertEquals("ready", owner.start("cache", 8888))
    owner.stop()
    assertEquals(1, stops.get())
  }

  @Test fun lifecycleChangeDuringStartupDisposesTheNewDaemon() {
    val started = CountDownLatch(1)
    val finish = CountDownLatch(1)
    val stops = AtomicInteger()
    val coordinator = DaemonLifecycleCoordinator({ _, _ ->
      started.countDown()
      check(finish.await(5, TimeUnit.SECONDS))
      "ready"
    }, { stops.incrementAndGet() })
    val owner = coordinator.Owner()
    val executor = Executors.newSingleThreadExecutor()
    try {
      val result = executor.submit<Boolean> {
        try { owner.start("cache", 8888); false } catch (_: IllegalStateException) { true }
      }
      assertTrue(started.await(5, TimeUnit.SECONDS))
      owner.destroy()
      finish.countDown()
      assertTrue(result.get(5, TimeUnit.SECONDS))
      assertEquals(1, stops.get())
      owner.stop()
      assertEquals(1, stops.get())
    } finally { finish.countDown(); executor.shutdownNow() }
  }

  @Test fun foregroundCallbackDoesNotWaitForNativeStopAndRestartWaitsForIt() {
    val stopping = CountDownLatch(1)
    val finish = CountDownLatch(1)
    val starts = AtomicInteger()
    val coordinator = DaemonLifecycleCoordinator({ _, _ -> starts.incrementAndGet(); "ready" }, {
      stopping.countDown()
      check(finish.await(5, TimeUnit.SECONDS))
    })
    val owner = coordinator.Owner()
    owner.start("cache", 8888)
    val epoch = owner.background()
    val executor = Executors.newFixedThreadPool(2)
    try {
      val stop = executor.submit { owner.stopIfBackground(epoch) }
      assertTrue(stopping.await(5, TimeUnit.SECONDS))
      owner.foreground()
      val restart = executor.submit<String> { owner.start("cache", 8888) }
      assertEquals(1, starts.get())
      finish.countDown()
      stop.get(5, TimeUnit.SECONDS)
      assertEquals("ready", restart.get(5, TimeUnit.SECONDS))
      assertEquals(2, starts.get())
    } finally { finish.countDown(); executor.shutdownNow() }
  }
}
