import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { networkInterfaces } from 'node:os'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mobileRoot, repositoryRoot, requireCurrentDevelopmentBuild } from './native-fingerprint.mjs'

const require = createRequire(import.meta.url)
const { toQR } = require('toqr') // Already supplied by the installed Expo CLI.
const { PNG } = require('pngjs') // Already supplied by Expo's image tooling.

const candidates = Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
  (addresses || []).filter(address => address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.')).map(address => ({ name, address: address.address })))
const host = process.env.STREAMFORGE_DEV_HOST || candidates.find(item => /wi-?fi|wireless/i.test(item.name))?.address || candidates[0]?.address
if (!host || !candidates.some(item => item.address === host)) throw new Error('Connect this PC to Wi-Fi first. STREAMFORGE_DEV_HOST can select another local IPv4 address.')
const port = 8081
const metroURL = `http://${host}:${port}`
const developmentURL = `streamforge-dev://expo-development-client/?url=${encodeURIComponent(metroURL)}`

if (!process.argv.includes('--connection-only')) requireCurrentDevelopmentBuild()
const cache = join(mobileRoot, '.expo')
const artifacts = join(repositoryRoot, '.cache/artifacts')
mkdirSync(cache, { recursive: true }); mkdirSync(artifacts, { recursive: true })
writeFileSync(join(cache, 'dev-connection.json'), JSON.stringify({ metroURL, developmentURL, qr: join(artifacts, 'StreamForge-Dev-WiFi-QR.png') }, null, 2) + '\n')
const matrix = toQR(developmentURL)
const extent = Math.sqrt(matrix.length)
const scale = 8, quiet = 4
const png = new PNG({ width: (extent + quiet * 2) * scale, height: (extent + quiet * 2) * scale })
for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
  const row = Math.floor(y / scale) - quiet, col = Math.floor(x / scale) - quiet
  const dark = row >= 0 && row < extent && col >= 0 && col < extent && matrix[row * extent + col]
  const offset = (y * png.width + x) * 4
  png.data[offset] = png.data[offset + 1] = png.data[offset + 2] = dark ? 0 : 255; png.data[offset + 3] = 255
}
writeFileSync(join(artifacts, 'StreamForge-Dev-WiFi-QR.png'), PNG.sync.write(png))
console.log(`StreamForge Dev — Wi-Fi live testing\n\nPhone and PC must use the same Wi-Fi.\nInstall and open StreamForge Dev, then scan the QR or enter:\n${metroURL}\n\nQR link: ${developmentURL}\n\nKeep this window open. Save UI/JavaScript changes to refresh the phone.\nGo/Kotlin/native changes require a newly authorized development APK.\nPress Ctrl+C to stop the PC development server.\n`)
if (!process.argv.includes('--connection-only')) {
  const cli = require.resolve('expo/bin/cli')
  const child = spawn(process.execPath, [cli, 'start', '--dev-client', '--lan', '--scheme', 'streamforge-dev', '--port', String(port), '--max-workers', '2'], {
    cwd: mobileRoot, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', REACT_NATIVE_PACKAGER_HOSTNAME: host, EXPO_NO_TELEMETRY: '1' }
  })
  child.on('error', error => { console.error(error.message); process.exitCode = 1 })
  child.on('exit', code => { process.exitCode = code ?? 0 })
}
