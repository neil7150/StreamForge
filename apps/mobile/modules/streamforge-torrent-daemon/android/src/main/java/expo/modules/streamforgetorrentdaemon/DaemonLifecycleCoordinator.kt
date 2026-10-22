package expo.modules.streamforgetorrentdaemon

import java.util.concurrent.atomic.AtomicReference

// Shared by module instances because Go owns one process-wide daemon. Lifecycle
// callbacks only update atomics; blocking native calls run on worker threads.
internal class DaemonLifecycleCoordinator(
  private val startNative: (String, Long) -> String,
  private val stopNative: () -> Unit
) {
  private val lock = Any()
  private var activeOwner: Owner? = null
  private data class State(val foreground: Boolean = true, val destroyed: Boolean = false, val epoch: Long = 0)

  inner class Owner {
    private val state = AtomicReference(State())

    fun background(): Long = state.updateAndGet { it.copy(foreground = false, epoch = it.epoch + 1) }.epoch
    fun foreground() { state.updateAndGet { it.copy(foreground = true, epoch = it.epoch + 1) } }
    fun destroy() { state.updateAndGet { it.copy(destroyed = true, epoch = it.epoch + 1) } }

    fun start(path: String, port: Long): String {
      val request = state.get()
      check(request.foreground && !request.destroyed) { "Streaming requires the app to be in the foreground" }
      return synchronized(lock) {
        check(state.get() === request) { "App lifecycle changed before streaming started" }
        if (activeOwner != null && activeOwner !== this) {
          stopNative()
          activeOwner = null
        }
        val result = startNative(path, port)
        activeOwner = this
        if (state.get() !== request) {
          stopNative()
          activeOwner = null
          error("App lifecycle changed while streaming started")
        }
        result
      }
    }

    fun stop() = synchronized(lock) { stopOwned() }

    fun stopIfBackground(epoch: Long) = synchronized(lock) {
      val current = state.get()
      if (!current.foreground && !current.destroyed && current.epoch == epoch) stopOwned()
    }

    private fun stopOwned() {
      if (activeOwner !== this) return
      stopNative()
      activeOwner = null
    }
  }
}
