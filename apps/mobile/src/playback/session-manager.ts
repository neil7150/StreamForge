export interface SessionFile { index: number; name: string; path: string; size: number; type: string }
export interface SessionInfo {
  sessionId: string
  infoHash: string
  name: string
  files: SessionFile[]
  totalSize: number
  selectedFileIndex: number
  requiresFileSelection: boolean
  streamURL: string
  ready: boolean
}
export interface SessionRequest { magnetURI: string; fileIndex?: number; season?: number; episode?: number }
export interface SessionBackend {
  start(): Promise<unknown>
  prepare(id: string, request: SessionRequest): Promise<SessionInfo>
  cancel(id: string): Promise<void>
  stop(): Promise<void>
}
const cancelled = () => new Error('Playback request cancelled')
let sequence = 0

export class PlaybackAttempt {
  readonly id = `${Date.now().toString(36)}-${++sequence}`
  readonly result: Promise<SessionInfo>
  private closed = false
  private submitted = false
  private closing: Promise<void> | null = null

  constructor(private backend: SessionBackend, request: SessionRequest, previous?: PlaybackAttempt) {
    this.result = (async () => {
      let ownsEngine = false
      try {
        if (previous) await previous.close()
        if (this.closed) throw cancelled()
        ownsEngine = true
        await backend.start()
        if (this.closed) throw cancelled()
        this.submitted = true
        const info = await backend.prepare(this.id, request)
        if (this.closed) throw cancelled()
        if (info.sessionId !== this.id) throw new Error('Native playback session did not match this request')
        return info
      } catch (error) {
        try { if (this.submitted) await backend.cancel(this.id) } catch {}
        if (ownsEngine) { try { await backend.stop() } catch {} }
        throw error
      }
    })()
  }

  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    this.closing = (async () => {
      try { if (this.submitted) await this.backend.cancel(this.id) } catch {
        await this.backend.stop()
      }
      await this.result.catch(() => {})
      try { if (this.submitted) await this.backend.cancel(this.id) } catch {}
      await this.backend.stop()
    })()
    return this.closing
  }
}

export class PlaybackSessionManager {
  private current?: PlaybackAttempt
  constructor(private backend: SessionBackend) {}
  open(request: SessionRequest): PlaybackAttempt {
    const attempt = new PlaybackAttempt(this.backend, request, this.current)
    this.current = attempt
    return attempt
  }
  async close() { await this.current?.close() }
}
