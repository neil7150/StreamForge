import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const mobileRoot = join(repositoryRoot, 'apps/mobile')
export const buildRecordPath = join(mobileRoot, '.expo/dev-native-build.json')

export function nativeFingerprint(root = repositoryRoot) {
  const files = ['apps/mobile/app.json', 'services/torrent-daemon/go.mod', 'services/torrent-daemon/go.sum', 'services/torrent-daemon/build-android-aar.ps1']
  const walk = (directory, accept) => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`
      if (entry.isDirectory()) walk(path, accept)
      else if (accept(path)) files.push(path)
    }
  }
  for (const directory of ['engine', 'mobile', 'server']) walk(`services/torrent-daemon/${directory}`, path => path.endsWith('.go') && !path.endsWith('_test.go'))
  walk('apps/mobile/plugins', path => path.endsWith('.js'))
  walk('apps/mobile/modules/streamforge-torrent-daemon/android/src/main', () => true)
  files.push('apps/mobile/modules/streamforge-torrent-daemon/android/build.gradle', 'apps/mobile/modules/streamforge-torrent-daemon/expo-module.config.json')
  const hash = createHash('sha256')
  for (const file of files.sort()) hash.update(file).update('\0').update(readFileSync(join(root, file))).update('\0')
  const pkg = JSON.parse(readFileSync(join(root, 'apps/mobile/package.json'), 'utf8'))
  hash.update(JSON.stringify({ dependencies: pkg.dependencies, expo: pkg.expo }))
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  const nativePackages = [...Object.keys(pkg.dependencies || {}), 'expo-dev-launcher', 'expo-dev-menu', 'expo-dev-menu-interface', 'expo-manifests', 'expo-updates-interface']
  const versions = Object.entries(lock.packages || {}).filter(([path]) => nativePackages.some(name => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`)))
    .sort(([left], [right]) => left.localeCompare(right)).map(([path, value]) => ({ path, version: value.version, integrity: value.integrity }))
  hash.update(JSON.stringify(versions))
  return { sha256: hash.digest('hex'), files: files.length }
}

export function requireCurrentDevelopmentBuild() {
  if (!existsSync(buildRecordPath)) throw new Error('Install the initial StreamForge Dev APK first. Building it requires explicit permission; this launcher never builds APKs.')
  const record = JSON.parse(readFileSync(buildRecordPath, 'utf8'))
  if (record.nativeFingerprint !== nativeFingerprint().sha256) throw new Error('Native code, native configuration or dependencies changed since the development APK was built. A new authorized development APK is required; JavaScript-only edits do not trigger this check.')
  return record
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fingerprint = nativeFingerprint()
  if (process.argv.includes('--record')) {
    const apk = join(mobileRoot, 'android/app/build/outputs/apk/debug/app-debug.apk')
    if (!existsSync(apk)) throw new Error('Development APK is missing; refusing to record a successful native build.')
    mkdirSync(dirname(buildRecordPath), { recursive: true })
    writeFileSync(buildRecordPath, JSON.stringify({ nativeFingerprint: fingerprint.sha256, applicationId: 'com.streamforge.app.dev', apk: relative(repositoryRoot, apk), builtAt: new Date().toISOString() }, null, 2) + '\n')
    console.log('Recorded development native build fingerprint. JS-only editing does not require another APK.')
  } else console.log(JSON.stringify(fingerprint))
}
