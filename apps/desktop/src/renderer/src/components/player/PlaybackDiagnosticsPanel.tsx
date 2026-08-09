import { useState } from 'react'
import { Check, Copy, Download, X } from 'lucide-react'
import type { PlaybackDiagnosticsReport } from '../../lib/playback-diagnostics'
import { playbackDiagnosticsFilename, serializePlaybackDiagnostics } from '../../lib/playback-diagnostics'
import { formatBytes, formatSpeed } from '../../lib/utils'

interface Props {
  report: PlaybackDiagnosticsReport
  onClose: () => void
}
function seconds(value: number): string {
  if (!Number.isFinite(value)) return 'â€”'
  const minutes = Math.floor(value / 60)
  return `${minutes}:${Math.floor(value % 60).toString().padStart(2, '0')}`
}

function Row({ label, value }: { label: string; value: string | number }) {
  return <div className="flex items-start justify-between gap-4 py-1.5"><dt className="text-white/30">{label}</dt><dd className="max-w-[210px] break-words text-right font-mono text-white/65">{value}</dd></div>
}

function countSummary(counts: Record<string, number>): string {
  const active = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name} ${count}`)
  return active.length > 0 ? active.join(' · ') : 'none'
}

export default function PlaybackDiagnosticsPanel({ report, onClose }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const peerConnections = report.torrent.peerConnections
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(serializePlaybackDiagnostics(report))
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    window.setTimeout(() => setCopyState('idle'), 1600)
  }
  const downloadReport = () => {
    const blob = new Blob([serializePlaybackDiagnostics(report)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = playbackDiagnosticsFilename(report)
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <aside className="fixed right-4 top-14 z-40 flex max-h-[calc(100%-4.5rem)] w-[390px] flex-col overflow-hidden rounded-xl border border-white/[0.09] bg-[#151719]/98 shadow-2xl">
      <header className="flex items-center border-b border-white/[0.07] px-4 py-3">
        <div className="min-w-0 flex-1"><h2 className="text-[12px] font-semibold text-white/80">Playback diagnostics</h2><p className="mt-0.5 text-[9px] text-white/28">Live local session data</p></div>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-white/30 hover:bg-white/[0.06] hover:text-white/65" aria-label="Close diagnostics"><X className="h-3.5 w-3.5" /></button>
      </header>
      <div className="overflow-y-auto px-4 py-3 text-[10px]">
        <section><h3 className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/22">Connection</h3><dl><Row label="Phase" value={report.connection.phase} /><Row label="Elapsed" value={`${(report.connection.elapsedMs / 1000).toFixed(1)}s`} /><Row label="Torrent retry" value={report.connection.connectionAttempt} /><Row label="Stream URL attempts" value={report.connection.streamURLAttempts} /><Row label="Media probes" value={report.connection.mediaProbeAttempts} /><Row label="Playback request" value={report.connection.playbackRequest} /></dl></section>
        <section className="mt-4 border-t border-white/[0.06] pt-3"><h3 className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/22">Torrent</h3><dl><Row label="Ready" value={report.torrent.ready ? 'yes' : 'no'} /><Row label="Peers" value={report.torrent.peers} />{peerConnections && <><Row label="Discovered" value={peerConnections.discovered} /><Row label="Pending" value={peerConnections.pending} /><Row label="Transport" value={countSummary(peerConnections.byTransport)} /><Row label="Sources" value={countSummary(peerConnections.bySource)} /><Row label="Fast TCP fallback" value={peerConnections.fastTcpFallbacksArmed} /></>}<Row label="Downloaded" value={`${(report.torrent.progress * 100).toFixed(1)}% Â· ${formatBytes(report.torrent.downloaded)}`} /><Row label="Playback buffer" value={`${(report.torrent.bufferProgress * 100).toFixed(1)}%`} /><Row label="Download speed" value={formatSpeed(report.torrent.downloadSpeed)} /><Row label="Upload speed" value={formatSpeed(report.torrent.uploadSpeed)} /></dl></section>
        <section className="mt-4 border-t border-white/[0.06] pt-3"><h3 className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/22">Media</h3><dl><Row label="Mode" value={report.media.playbackMode} /><Row label="Video" value={report.media.videoCodec || 'unknown'} /><Row label="Audio" value={report.media.audioCodec || 'unknown'} /><Row label="Resolution" value={report.media.resolution || 'unknown'} /><Row label="Duration" value={seconds(report.media.duration)} /><Row label="Audio track" value={report.media.selectedAudioTrackIndex ?? 'default'} /><Row label="Subtitle tracks" value={report.media.subtitleTracks.length} /></dl></section>
        <section className="mt-4 border-t border-white/[0.06] pt-3"><h3 className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/22">Browser playback</h3>{report.playback ? <dl><Row label="Event" value={report.playback.lastEvent} /><Row label="Position" value={`${seconds(report.playback.currentTime)} / ${seconds(report.playback.duration)}`} /><Row label="Buffered ahead" value={`${report.playback.bufferedAhead.toFixed(1)}s`} /><Row label="Ranges" value={report.playback.bufferedRanges.length} /><Row label="Ready state" value={report.playback.readyState} /><Row label="Network state" value={report.playback.networkState} /><Row label="Load retries" value={report.playback.loadRetryCount} /><Row label="Last seek" value={report.connection.lastSeekTarget === null ? 'none' : seconds(report.connection.lastSeekTarget)} /></dl> : <p className="py-2 text-white/28">Waiting for the video element.</p>}</section>
        {report.errors.length > 0 && <section className="mt-4 border-t border-red-300/10 pt-3"><h3 className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-red-300/50">Errors</h3>{report.errors.map((error, index) => <p key={`${error}-${index}`} className="mb-2 rounded-md bg-red-400/[0.05] px-2.5 py-2 leading-4 text-red-200/65">{error}</p>)}</section>}
      </div>
      <footer className="flex gap-2 border-t border-white/[0.07] p-3"><button onClick={() => void copyReport()} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] text-[10px] text-white/52 hover:bg-white/[0.05]">{copyState === 'copied' ? <Check className="h-3 w-3 text-teal-300" /> : <Copy className="h-3 w-3" />}{copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy JSON'}</button><button onClick={downloadReport} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white text-[10px] font-semibold text-[#17191b] hover:bg-white/90"><Download className="h-3 w-3" /> Download</button></footer>
    </aside>
  )
}
