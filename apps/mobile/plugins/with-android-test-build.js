const { withAppBuildGradle } = require('expo/config-plugins')

// A production-JS, non-debuggable install for phone testing without Metro.
// The separate application ID and debug signing identify it as an internal test.
module.exports = function withAndroidTestBuild(config) {
  return withAppBuildGradle(config, result => {
    if (result.modResults.language !== 'groovy') throw new Error('Android test build expects Groovy Gradle')
    const marker = '// StreamForge standalone phone test'
    if (!result.modResults.contents.includes(marker)) {
      result.modResults.contents += `
${marker}
android {
    buildTypes {
        standaloneTest {
            initWith release
            matchingFallbacks = ['release']
            applicationIdSuffix '.test'
            versionNameSuffix '-test'
            debuggable false
            signingConfig signingConfigs.debug
        }
    }
}
`
    }
    return result
  })
}
