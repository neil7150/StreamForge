import assert from 'node:assert/strict'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const resourcesDir = path.join(projectDir, 'dist', 'win-unpacked', 'resources')
const asarPath = path.join(resourcesDir, 'app.asar')
const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked')

async function findFile(directory, pattern) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = await findFile(target, pattern)
      if (nested) return nested
    } else if (pattern.test(entry.name)) {
      return target
    }
  }
  return null
}

const asar = await stat(asarPath)
assert.ok(asar.size > 50_000, 'app.asar is unexpectedly small')

const ffmpeg = await findFile(unpackedDir, /^ffmpeg\.exe$/i)
const ffprobe = await findFile(unpackedDir, /^ffprobe\.exe$/i)
assert.ok(ffmpeg, 'Packaged FFmpeg executable is missing')
assert.ok(ffprobe, 'Packaged FFprobe executable is missing')
assert.ok((await stat(ffmpeg)).size > 1_000_000, 'Packaged FFmpeg executable is invalid')
assert.ok((await stat(ffprobe)).size > 1_000_000, 'Packaged FFprobe executable is invalid')

console.log('Package verification passed: app.asar, FFmpeg, and FFprobe are present.')
