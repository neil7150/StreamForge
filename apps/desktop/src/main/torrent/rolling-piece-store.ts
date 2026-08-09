/**
 * Ephemeral, piece-addressable storage for stream-mode torrents.
 *
 * Each verified torrent piece is stored as a separate file so playback can
 * discard expired pieces without touching the active playback window.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

interface StoreOptions {
  path?: string
  name?: string
  torrent?: { infoHash?: string }
}

type Callback = (error?: Error) => void
type GetCallback = (error: Error | null, buffer?: Buffer) => void
type ReadOptions = { offset?: number; length?: number }

export class RollingPieceStore {
  readonly chunkLength: number
  private readonly directory: string
  private readonly ready: Promise<void>
  private closed = false

  constructor(chunkLength: number, options: StoreOptions = {}) {
    this.chunkLength = chunkLength
    const identifier = options.torrent?.infoHash || options.name || 'unknown-torrent'
    const safeIdentifier = identifier.replace(/[^a-zA-Z0-9._-]/g, '_')
    this.directory = path.join(options.path || process.cwd(), '.streamforge-pieces', safeIdentifier)
    this.ready = fs.mkdir(this.directory, { recursive: true }).then(() => undefined)
  }

  put(index: number, buffer: Uint8Array, callback: Callback = () => {}): void {
    void this.writePiece(index, buffer, callback)
  }

  get(index: number, options: ReadOptions | GetCallback | null | undefined, callback?: GetCallback): void {
    const readOptions = typeof options === 'function' ? {} : (options ?? {})
    const done = typeof options === 'function' ? options : callback
    if (!done) return
    void this.readPiece(index, readOptions, done)
  }

  delete(index: number, callback: Callback = () => {}): void {
    void this.removePiece(index, callback)
  }

  close(callback: Callback = () => {}): void {
    this.closed = true
    queueMicrotask(() => callback())
  }

  destroy(callback: Callback = () => {}): void {
    this.closed = true
    void fs.rm(this.directory, { recursive: true, force: true })
      .then(() => callback())
      .catch((error: unknown) => callback(toError(error)))
  }

  private async writePiece(index: number, buffer: Uint8Array, callback: Callback): Promise<void> {
    try {
      if (this.closed) throw new Error('Storage is closed')
      await this.ready
      await fs.writeFile(this.piecePath(index), buffer)
      callback()
    } catch (error) {
      callback(toError(error))
    }
  }

  private async readPiece(
    index: number,
    options: ReadOptions,
    callback: GetCallback
  ): Promise<void> {
    try {
      if (this.closed) throw new Error('Storage is closed')
      await this.ready
      const buffer = await fs.readFile(this.piecePath(index))
      const offset = options.offset ?? 0
      if (!Number.isInteger(offset) || offset < 0 || offset > buffer.length) {
        throw new RangeError('Invalid piece offset: ' + offset)
      }
      if (options.length !== undefined && (!Number.isInteger(options.length) || options.length < 0)) {
        throw new RangeError('Invalid piece length: ' + options.length)
      }
      const end = options.length === undefined ? buffer.length : offset + options.length
      callback(null, buffer.subarray(offset, end))
    } catch (error) {
      callback(toError(error))
    }
  }

  private async removePiece(index: number, callback: Callback): Promise<void> {
    try {
      await fs.rm(this.piecePath(index), { force: true })
      callback()
    } catch (error) {
      callback(toError(error))
    }
  }

  private piecePath(index: number): string {
    return path.join(this.directory, `${index}.piece`)
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}