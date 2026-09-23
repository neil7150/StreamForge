const fs = require('fs')
const path = require('path')
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod
} = require('expo/config-plugins')

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
  </domain-config>
</network-security-config>
`

// Android's emulator reaches the host Metro server through this virtual-router
// address. Keep the extra cleartext exception out of release builds.
const DEBUG_NETWORK_SECURITY_CONFIG = NETWORK_SECURITY_CONFIG.replace(
  '  </domain-config>',
  '    <domain includeSubdomains="false">10.0.2.2</domain>\n  </domain-config>'
)

module.exports = function withLocalhostCleartext(config) {
  config = withAndroidManifest(config, (androidConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      androidConfig.modResults
    )
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config'
    androidConfig.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools'
    application.$['tools:replace'] = 'android:networkSecurityConfig'
    return androidConfig
  })

  return withDangerousMod(config, [
    'android',
    async (androidConfig) => {
      for (const [sourceSet, contents] of [
        ['main', NETWORK_SECURITY_CONFIG],
        ['debug', DEBUG_NETWORK_SECURITY_CONFIG]
      ]) {
        const xmlDirectory = path.join(
          androidConfig.modRequest.platformProjectRoot,
          'app',
          'src',
          sourceSet,
          'res',
          'xml'
        )
        fs.mkdirSync(xmlDirectory, { recursive: true })
        fs.writeFileSync(
          path.join(xmlDirectory, 'network_security_config.xml'),
          contents
        )
      }
      return androidConfig
    }
  ])
}
