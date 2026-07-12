/**
 * CacheManager — Manages the temporary stream cache directory.
 *
 * Stream mode uses an ephemeral temp dir that is wiped on every app restart.
 * Download mode files live in a persistent folder and are NOT managed here.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export class CacheManager {
  /** Ephemeral stream cache — wiped on every startup */
  private readonly streamCacheDir: string

  constructor() {
    this.streamCacheDir = path.join(os.tmpdir(), 'streamforge-stream')
  }

  /**
   * Initialize — wipe the entire stream cache so no stale data remains
   * from previous sessions. This is the core "cleanup on restart" behavior.
   */
  async initialize(): Promise<void> {
    // Wipe everything in the stream cache
    try {
      await fs.rm(this.streamCacheDir, { recursive: true, force: true })
    } catch {
      // May not exist yet — that's fine
    }

    // Recreate the empty directory
    await fs.mkdir(this.streamCacheDir, { recursive: true })

    console.log(`[CacheManager] Stream cache wiped and initialized at ${this.streamCacheDir}`)
  }

  /** Returns the absolute path to the stream cache directory. */
  getStreamCacheDir(): string {
    return this.streamCacheDir
  }

  /**
   * Calculates the total size of all files in the stream cache (recursive).
   * Returns size in bytes.
   */
  async getCacheSize(): Promise<number> {
    try {
      return await this.getDirectorySize(this.streamCacheDir)
    } catch {
      return 0
    }
  }

  /** Removes all files and subdirectories in the stream cache. */
  async clearCache(): Promise<void> {
    try {
      const entries = await fs.readdir(this.streamCacheDir, { withFileTypes: true })
      const removalTasks = entries.map((entry) => {
        const fullPath = path.join(this.streamCacheDir, entry.name)
        return fs.rm(fullPath, { recursive: true, force: true })
      })
      await Promise.all(removalTasks)
      console.log('[CacheManager] Stream cache cleared')
    } catch (error) {
      console.error('[CacheManager] Failed to clear stream cache:', error)
    }
  }

  /**
   * Final cleanup on app shutdown — remove the entire stream cache.
   */
  async cleanupOnExit(): Promise<void> {
    try {
      await fs.rm(this.streamCacheDir, { recursive: true, force: true })
      console.log('[CacheManager] Stream cache cleaned up on exit')
    } catch {
      // Best-effort cleanup
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────

  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      const sizes = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(dirPath, entry.name)
          if (entry.isDirectory()) {
            return this.getDirectorySize(fullPath)
          }
          const stat = await fs.stat(fullPath)
          return stat.size
        })
      )

      totalSize = sizes.reduce((acc, size) => acc + size, 0)
    } catch {
      // Directory may not exist or be inaccessible
    }

    return totalSize
  }
}
