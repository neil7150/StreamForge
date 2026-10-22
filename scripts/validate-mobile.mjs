// Deliberately invoke tools directly: no npm lifecycle, Expo, Gradle or APK tasks.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { readdirSync } from 'node:fs'

const root = fileURLToPath(new URL('../', import.meta.url))
const tsc = resolve(root, 'node_modules/typescript/bin/tsc')
const mobileTests = readdirSync(resolve(root, 'apps/mobile/tests')).filter(name => name.endsWith('.test.ts'))
const checks = [
  ['Mobile TypeScript', process.execPath, [tsc, '--noEmit', '-p', 'apps/mobile/tsconfig.json']],
  ['Shared TypeScript', process.execPath, [tsc, '--noEmit', '-p', 'packages/core/tsconfig.json']],
  ['Shared policy tests', process.execPath, ['--import', './scripts/register-typescript.mjs', '--test', 'packages/core/tests/core-policies.test.ts']],
  ['Mobile logic tests', process.execPath, ['--import', './scripts/register-typescript.mjs', '--test', ...mobileTests.map(name => `apps/mobile/tests/${name}`)]],
  ['Release plugin syntax', process.execPath, ['--check', 'apps/mobile/plugins/with-android-release.js']],
  ['Network plugin syntax', process.execPath, ['--check', 'apps/mobile/plugins/with-localhost-cleartext.js']],
  ['Go daemon tests', 'go', ['test', './...'], 'services/torrent-daemon']
]
if (process.platform === 'win32') checks.push(['Android script syntax', 'powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/check-android-script-syntax.ps1']])

for (const [name, executable, args, directory = '.'] of checks) {
  console.log(`\n${name}`)
  const result = spawnSync(executable, args, {
    cwd: resolve(root, directory), stdio: 'inherit',
    env: { ...process.env, CGO_ENABLED: '0' }
  })
  if (result.error) console.error(result.error.message)
  if (result.error || result.status !== 0) process.exit(result.status || 1)
}
console.log('\nSource validation passed. No APK was generated; Android runtime checks remain separate.')
