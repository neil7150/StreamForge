const fs = require('fs')
const path = require('path')
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins')

// Debug installs have their own identity and QR scheme; delivery/test variants
// retain the strict main manifest and network policy.
module.exports = function withAndroidDevelopment(config) {
  config = withAppBuildGradle(config, result => {
    const marker = '// StreamForge Wi-Fi development identity'
    if (result.modResults.language !== 'groovy') throw new Error('Development configuration expects Groovy Gradle')
    if (!result.modResults.contents.includes(marker)) result.modResults.contents += `
${marker}
android {
    buildTypes {
        debug {
            applicationIdSuffix '.dev'
            versionNameSuffix '-dev'
        }
    }
}
`
    return result
  })
  return withDangerousMod(config, ['android', async result => {
    const manifestPath = path.join(result.modRequest.platformProjectRoot, 'app/src/debug/AndroidManifest.xml')
    // This is a debug-only overlay. Never put the Metro scheme/cleartext policy
    // in the main manifest or standalone-test/release resource source sets.
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
    fs.writeFileSync(manifestPath, `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <application android:usesCleartextTraffic="true" tools:replace="android:usesCleartextTraffic">
    <activity android:name=".MainActivity">
      <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="streamforge-dev" />
      </intent-filter>
    </activity>
  </application>
</manifest>
`)
    const values = path.join(result.modRequest.platformProjectRoot, 'app/src/debug/res/values')
    fs.mkdirSync(values, { recursive: true })
    fs.writeFileSync(path.join(values, 'strings.xml'), '<?xml version="1.0" encoding="utf-8"?><resources><string name="app_name">StreamForge Dev</string></resources>\n')
    return result
  }])
}
