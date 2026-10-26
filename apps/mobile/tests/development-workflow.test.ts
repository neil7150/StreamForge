import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { nativeFingerprint, repositoryRoot } from '../scripts/native-fingerprint.mjs'

test('live JavaScript edits do not invalidate the native build; native inputs and installed versions do', () => {
  const root = mkdtempSync(join(tmpdir(), 'streamforge-dev-inputs-'))
  try {
    for (const path of ['apps/mobile/app.json', 'apps/mobile/plugins', 'apps/mobile/modules/streamforge-torrent-daemon', 'services/torrent-daemon']) {
      mkdirSync(join(root, path, '..'), { recursive: true })
      cpSync(join(repositoryRoot, path), join(root, path), { recursive: true, filter: source => !/[\\/](?:build|libs|\.cxx|\.gradle)(?:[\\/]|$)/.test(source) && !/\.(?:aar|jar)$/.test(source) })
    }
    const pkg = { dependencies: { expo: '^57.0.0', 'expo-dev-client': '~57.0.20' } }
    const lock = { packages: { 'node_modules/expo': { version: '57.0.28' }, 'node_modules/desktop-only': { version: '1.0.0' } } }
    writeFileSync(join(root, 'apps/mobile/package.json'), JSON.stringify(pkg))
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock))
    const original = nativeFingerprint(root).sha256
    mkdirSync(join(root, 'apps/mobile/src'), { recursive: true })
    writeFileSync(join(root, 'apps/mobile/src/AnyScreen.tsx'), 'export const title = "edited UI"')
    assert.equal(nativeFingerprint(root).sha256, original)
    lock.packages['node_modules/desktop-only'].version = '2.0.0'
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock))
    assert.equal(nativeFingerprint(root).sha256, original)
    lock.packages['node_modules/expo'].version = '57.0.29'
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock))
    assert.notEqual(nativeFingerprint(root).sha256, original)
    lock.packages['node_modules/expo'].version = '57.0.28'
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock))
    const source = join(root, 'services/torrent-daemon/engine/engine.go')
    writeFileSync(source, readFileSync(source, 'utf8') + '\n// changed native code\n')
    assert.notEqual(nativeFingerprint(root).sha256, original)
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()))
    assert.ok(basename(root).startsWith('streamforge-dev-inputs-'))
    rmSync(root, { recursive: true, force: true })
  }
})
