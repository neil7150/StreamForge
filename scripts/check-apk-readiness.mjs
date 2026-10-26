// Inspects configuration and existing artifacts only. Never invokes a build.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const mobile = resolve(root,'apps/mobile')
const read = path => readFileSync(resolve(mobile,path),'utf8')
const config = JSON.parse(read('app.json')).expo
assert.equal(config.android.package,'com.streamforge.app')
assert.equal(config.android.allowBackup,false)
const blocked = ['READ_EXTERNAL_STORAGE','WRITE_EXTERNAL_STORAGE','SYSTEM_ALERT_WINDOW']
for (const name of blocked) assert.ok(config.android.blockedPermissions.includes(`android.permission.${name}`))
for (const asset of [config.icon,config.splash.image,config.android.adaptiveIcon.foregroundImage]) assert.ok(statSync(resolve(mobile,asset)).size > 0)
const props = read('android/gradle.properties')
for (const line of ['reactNativeArchitectures=arm64-v8a','hermesEnabled=true','android.enableMinifyInReleaseBuilds=true','android.enableShrinkResourcesInReleaseBuilds=true']) assert.ok(props.includes(line),`Missing ${line}`)
const manifest = read('android/app/src/main/AndroidManifest.xml')
assert.match(manifest,/android:allowBackup="false"/)
for (const name of blocked) {
  const declaration = manifest.match(new RegExp(`<uses-permission[^>]*android:name="android.permission.${name}"[^>]*>`))?.[0]
  if (declaration) assert.match(declaration,/tools:node="remove"/)
}
const network = read('android/app/src/main/res/xml/network_security_config.xml')
assert.match(network,/<base-config cleartextTrafficPermitted="false"/)
assert.match(network,/>127\.0\.0\.1<\/domain>/)
assert.doesNotMatch(network,/10\.0\.2\.2|includeSubdomains="true"/)
assert.match(read('android/app/build.gradle'),/signingConfig signingConfigs.streamforgeRelease/)
assert.match(read('android/app/build.gradle'),/StreamForge release identity guard/)
const aar = resolve(mobile,'modules/streamforge-torrent-daemon/android/libs/streamforge.aar')
assert.ok(existsSync(aar),'Run the separate native-library validation first.')
const exported = resolve(mobile,'.expo/device-local-export')
const files = directory => readdirSync(directory,{withFileTypes:true}).flatMap(item => item.isDirectory() ? files(resolve(directory,item.name)) : [resolve(directory,item.name)])
assert.ok(existsSync(exported),'Run the production JS/assets export first.')
const output = files(exported)
const maps = output.filter(path=>path.endsWith('.map'))
assert.ok(maps.length,'Export source maps are required to inspect bundled modules.')
const tooling = ['node-forge','zod','uuid','braces']
const bundledTooling = new Set()
for (const path of maps) for (const source of JSON.parse(readFileSync(path,'utf8')).sources || []) {
  assert.ok(!source.replaceAll('\\','/').endsWith('/apps/mobile/src/screens/LoginScreen.tsx'),'Login UI must not enter the device-local export.')
  for (const name of tooling) if (source.replaceAll('\\','/').includes(`/node_modules/${name}/`)) bundledTooling.add(name)
}
assert.deepEqual([...bundledTooling],[],'Review advisory-bearing packages that enter the app export.')
assert.equal(config.extra?.runtimeMode,'device-local','Review prerequisites before enabling account/backend mode.')
const backendRequired = false
const signingKeys = ['STREAMFORGE_KEYSTORE_PATH','STREAMFORGE_KEYSTORE_PASSWORD','STREAMFORGE_KEY_ALIAS','STREAMFORGE_KEY_PASSWORD']
const signingConfigured = signingKeys.every(key=>Boolean(process.env[key]?.trim())) && existsSync(process.env.STREAMFORGE_KEYSTORE_PATH || '')
const report = {
  sourceConfiguration:'passed', version:config.version, versionCode:config.android.versionCode,
  architecture:'arm64-v8a', backup:false, blockedPermissions:blocked,
  nativeLibrary:{bytes:statSync(aar).size,sha256:createHash('sha256').update(readFileSync(aar)).digest('hex')},
  exportedAssets:output.filter(path=>!path.endsWith('.map')).map(path=>({path:relative(exported,path),bytes:statSync(path).size})),
  advisoryToolingBundled:[...bundledTooling], runtimeMode:'device-local', backendRequired, signingConfigured,
  pending:['direct metadata/source connectivity on Android','physical Android tests','APK build permission'],
  apkGenerated:false
}
mkdirSync(resolve(root,'.cache'),{recursive:true})
writeFileSync(resolve(root,'.cache/android-apk-readiness.json'),JSON.stringify(report,null,2)+'\n')
console.log('PASS generated configuration, ARM64/Hermes/shrinking settings, permission restrictions, native-library presence and export module inventory.')
console.log(`Device-local mode; backend required: ${backendRequired}; release signing configured: ${signingConfigured}. Physical-device checks remain separate.`)
if (process.argv.includes('--require-backend')) throw new Error('--require-backend does not apply to this device-local app.')
if (process.argv.includes('--release')) {
  assert.ok(signingConfigured,'Private release signing inputs are required.')
  assert.notEqual(process.env.STREAMFORGE_KEY_ALIAS,'androiddebugkey','Delivery must not use a debug signing identity.')
}
console.log('Pre-APK source preparation passed. This is not build permission or device certification.')
