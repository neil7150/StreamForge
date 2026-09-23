package expo.modules.streamforgetorrentdaemon

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.HttpURLConnection
import java.net.URL
import mobile.Mobile

class StreamForgeTorrentDaemonModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TorrentDaemon")

    AsyncFunction("startDaemon") { port: Long ->
      val cacheDirectory = appContext.reactContext?.cacheDir
        ?: throw IllegalStateException("React context is unavailable")
      val result = Mobile.startDaemon(cacheDirectory.absolutePath, port)
      ensureGoCallSucceeded(result)

      val baseUrl = result.replace("127.0.0.1", "localhost")
      if (!waitUntilHealthy(baseUrl)) {
        Mobile.stopDaemon()
        throw IllegalStateException("Torrent daemon did not become ready")
      }
      baseUrl
    }

    AsyncFunction("stopDaemon") {
      Mobile.stopDaemon()
    }

    AsyncFunction("addMagnet") { magnetURI: String, fileIndex: Long ->
      val result = Mobile.addMagnet(magnetURI, fileIndex)
      ensureGoCallSucceeded(result)
      result.replace("127.0.0.1", "localhost")
    }

    AsyncFunction("cleanupStream") { infoHash: String ->
      Mobile.cleanupStream(infoHash)
    }

    AsyncFunction("getStats") { infoHash: String ->
      Mobile.getStats(infoHash)
    }

    OnDestroy {
      Thread { Mobile.stopDaemon() }.start()
    }
  }

  private fun ensureGoCallSucceeded(result: String) {
    if (result.startsWith("ERROR:")) {
      throw IllegalStateException(result.removePrefix("ERROR:").trim())
    }
  }

  private fun waitUntilHealthy(baseUrl: String): Boolean {
    val deadline = System.currentTimeMillis() + 5_000
    while (System.currentTimeMillis() < deadline) {
      val connection = try {
        URL("$baseUrl/health").openConnection() as HttpURLConnection
      } catch (_: Exception) {
        null
      }

      try {
        if (connection != null) {
          connection.connectTimeout = 300
          connection.readTimeout = 300
          if (connection.responseCode in 200..299) {
            return true
          }
        }
      } catch (_: Exception) {
        // The server goroutine may still be binding. Retry until the deadline.
      } finally {
        connection?.disconnect()
      }

      Thread.sleep(75)
    }
    return false
  }
}
