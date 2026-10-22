const { withGradleProperties, withAppBuildGradle, withProjectBuildGradle } = require('expo/config-plugins')

// Tracked configuration survives Expo regeneration. Never execute a build here.
module.exports = function withAndroidRelease(config) {
  config = withGradleProperties(config, result => {
    const properties = {
      reactNativeArchitectures: 'arm64-v8a',
      'android.enableMinifyInReleaseBuilds': 'true',
      'android.enableShrinkResourcesInReleaseBuilds': 'true',
      'expo.webp.animated': 'false'
    }
    for (const [key, value] of Object.entries(properties)) {
      result.modResults = result.modResults.filter(item => item.type !== 'property' || item.key !== key)
      result.modResults.push({ type: 'property', key, value })
    }
    return result
  })
  config = withProjectBuildGradle(config, result => {
    if (result.modResults.language !== 'groovy') throw new Error('Android configuration expects Groovy Gradle')
    const marker = '// StreamForge AsyncStorage toolchain'
    if (!result.modResults.contents.includes(marker)) {
      result.modResults.contents += `\n${marker}\n// AsyncStorage 2.x otherwise falls back to an older KSP compiler plugin.\next.AsyncStorage_next_kspVersion = ext.kspVersion\n`
    }
    return result
  })
  return withAppBuildGradle(config, result => {
    if (result.modResults.language !== 'groovy') throw new Error('Android release plugin expects Groovy Gradle')
    const marker = '// StreamForge release signing'
    if (result.modResults.contents.includes(marker)) return result
    result.modResults.contents += `
${marker}
def streamforgeKeyPath = System.getenv('STREAMFORGE_KEYSTORE_PATH')
def streamforgeKeyPassword = System.getenv('STREAMFORGE_KEYSTORE_PASSWORD')
def streamforgeKeyAlias = System.getenv('STREAMFORGE_KEY_ALIAS')
def streamforgeAliasPassword = System.getenv('STREAMFORGE_KEY_PASSWORD')
def streamforgeHasSigning = [streamforgeKeyPath, streamforgeKeyPassword, streamforgeKeyAlias, streamforgeAliasPassword].every { it }
android {
    signingConfigs {
        streamforgeRelease {
            if (streamforgeHasSigning) {
                storeFile file(streamforgeKeyPath)
                storePassword streamforgeKeyPassword
                keyAlias streamforgeKeyAlias
                keyPassword streamforgeAliasPassword
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.streamforgeRelease
        }
    }
}
gradle.taskGraph.whenReady { graph ->
    def packagingRelease = graph.allTasks.any { task -> task.name ==~ /(?i)(assemble|bundle|package|install|validateSigning).*Release.*/ }
    if (packagingRelease && !streamforgeHasSigning) {
        throw new GradleException('Release signing variables are missing. Debug signing is not allowed for delivery.')
    }
}
`
    return result
  })
}
