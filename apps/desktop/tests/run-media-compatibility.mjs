import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'esbuild'

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'streamforge-compatibility-tests-'))
const bundledTest = path.join(temporaryDirectory, 'media-compatibility.test.cjs')

try {
  await build({
    entryPoints: [path.resolve('tests/media-compatibility.integration.test.ts')],
    outfile: bundledTest,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    packages: 'external',
    sourcemap: 'inline',
    logLevel: 'silent'
  })

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      '--test',
      '--test-isolation=none',
      '--test-concurrency=1',
      bundledTest
    ], { stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('close', (code) => resolve(code ?? 1))
  })
  process.exitCode = exitCode
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
