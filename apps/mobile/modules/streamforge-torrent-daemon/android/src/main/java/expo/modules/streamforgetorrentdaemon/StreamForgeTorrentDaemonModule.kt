package expo.modules.streamforgetorrentdaemon

import android.os.Handler
import android.os.Looper
import android.os.StatFs
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mobile.Mobile
import java.util.concurrent.atomic.AtomicReference

class StreamForgeTorrentDaemonModule : Module() {
  companion object {
    private val coordinator = DaemonLifecycleCoordinator(
      startNative = { path, port ->
        val result = Mobile.startDaemon(path, port)
        check(!result.startsWith("ERROR:")) { result.removePrefix("ERROR:").trim() }
        result
      },
      stopNative = { Mobile.stopDaemon() }
    )
  }

  private val lifecycle = coordinator.Owner()
  private val handler = Handler(Looper.getMainLooper())
  private val pendingBackgroundStop = AtomicReference<Runnable?>(null)

  private fun removeBackgroundStop() {
    pendingBackgroundStop.getAndSet(null)?.let { handler.removeCallbacks(it) }
  }

  private fun cachePath(): String = appContext.reactContext?.cacheDir?.absolutePath
    ?: throw IllegalStateException("React context is unavailable")

  private fun checked(result: String): String {
    if (result.startsWith("ERROR:")) throw IllegalStateException(result.removePrefix("ERROR:").trim())
    return result
  }

  override fun definition() = ModuleDefinition {
    Name("TorrentDaemon")
    Function("getProtocolVersion") { 2 }

    AsyncFunction("startDaemon") Coroutine { port: Long ->
      withContext(Dispatchers.IO) {
        val path = cachePath()
        if (StatFs(path).availableBytes < 1024L * 1024 * 1024) {
          throw IllegalStateException("At least 1 GB of free storage is required to start streaming")
        }
        lifecycle.start(path, port)
      }
    }
    AsyncFunction("stopDaemon") Coroutine { ->
      withContext(Dispatchers.IO) { lifecycle.stop() }
    }
    AsyncFunction("prepareSession") Coroutine { id: String, magnet: String, file: Long, season: Long, episode: Long ->
      withContext(Dispatchers.IO) { checked(Mobile.prepareSession(id, magnet, file, season, episode)) }
    }
    AsyncFunction("selectFile") Coroutine { id: String, file: Long ->
      withContext(Dispatchers.IO) { checked(Mobile.selectFile(id, file)) }
    }
    AsyncFunction("cancelSession") Coroutine { id: String ->
      withContext(Dispatchers.IO) { Mobile.cancelSession(id) }
    }
    AsyncFunction("getStats") Coroutine { id: String ->
      withContext(Dispatchers.IO) {
        if (StatFs(cachePath()).availableBytes < 256L * 1024 * 1024) {
          Mobile.cancelSession(id)
          throw IllegalStateException("Streaming stopped because device storage is low")
        }
        checked(Mobile.getStats(id))
      }
    }
    AsyncFunction("getCacheSize") Coroutine { ->
      withContext(Dispatchers.IO) { checked(Mobile.getCacheSize(cachePath())).toDouble() }
    }
    AsyncFunction("clearCache") Coroutine { ->
      withContext(Dispatchers.IO) { checked(Mobile.clearCache(cachePath())); Unit }
    }
    OnActivityEntersBackground {
      val epoch = lifecycle.background()
      removeBackgroundStop()
      val stop = Runnable { Thread({ lifecycle.stopIfBackground(epoch) }, "StreamForge-background-stop").start() }
      pendingBackgroundStop.set(stop)
      handler.postDelayed(stop, 5_000)
    }
    OnActivityEntersForeground {
      lifecycle.foreground()
      removeBackgroundStop()
    }
    OnDestroy {
      lifecycle.destroy()
      removeBackgroundStop()
      Thread({ lifecycle.stop() }, "StreamForge-destroy-stop").start()
    }
  }
}
