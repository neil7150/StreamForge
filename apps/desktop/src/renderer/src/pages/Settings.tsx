import { useEffect, useState, useCallback } from 'react'
import { HardDrive, Info, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { usePlaybackSettingsStore, type PlaybackSettings } from '../stores/playbackSettingsStore'
import { formatBytes } from '../lib/utils'

export default function Settings() {
  const cacheSize = useAppStore((state) => state.cacheSize)
  const refreshCacheSize = useAppStore((state) => state.refreshCacheSize)
  const [clearing, setClearing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const playback = usePlaybackSettingsStore()
  const updateSettings = usePlaybackSettingsStore((state) => state.updateSettings)
  const resetSettings = usePlaybackSettingsStore((state) => state.resetSettings)

  const update = <K extends keyof PlaybackSettings>(key: K, value: PlaybackSettings[K]) => {
    updateSettings({ [key]: value } as Pick<PlaybackSettings, K>)
  }

  useEffect(() => { void refreshCacheSize() }, [refreshCacheSize])

  const clearCache = useCallback(async () => {
    setClearing(true); setMessage(null)
    try {
      if (!window.torrentAPI) return
      await window.torrentAPI.clearCache()
      await refreshCacheSize()
      setMessage('Temporary cache cleared')
    } catch {
      setMessage('The cache could not be cleared. Close active streams and try again.')
    } finally { setClearing(false) }
  }, [refreshCacheSize])

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto w-full max-w-[860px] px-10 pb-14 pt-9">
        <header className="flex items-end justify-between"><div><h1 className="text-[22px] font-semibold tracking-[-0.025em] text-white/90">Settings</h1><p className="mt-1.5 text-[11px] text-white/32">Tune source selection, playback, subtitles, and storage.</p></div><button onClick={resetSettings} className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/65"><RotateCcw className="h-3 w-3" /> Reset playback</button></header>

        <section className="mt-9">
          <h2 className="text-[11px] font-semibold text-white/48">Storage</h2>
          <div className="mt-3 divide-y divide-white/[0.055] border-y border-white/[0.06]">
            <div className="flex items-center gap-4 py-5">
              <HardDrive className="h-4 w-4 text-white/25" />
              <div className="min-w-0 flex-1"><p className="text-[12px] font-medium text-white/67">Temporary streaming cache</p><p className="mt-1 text-[10px] text-white/27">Watched pieces are removed automatically around the playback window.</p></div>
              <span className="text-[12px] font-medium text-white/55">{formatBytes(cacheSize)}</span>
              <button onClick={() => void clearCache()} disabled={clearing || cacheSize === 0} className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 text-[10px] text-white/40 hover:bg-white/[0.05] hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30">{clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Clear</button>
            </div>
          </div>
          {message && <p className="mt-3 text-[10px] text-white/40">{message}</p>}
        </section>

        <section className="mt-9">
          <h2 className="text-[11px] font-semibold text-white/48">Source selection</h2>
          <div className="mt-3 divide-y divide-white/[0.055] border-y border-white/[0.06]">
            <SettingRow label="Preferred quality" description="Play Best balances this with source health."><select value={playback.preferredQuality} onChange={(event) => update('preferredQuality', event.target.value as PlaybackSettings['preferredQuality'])} className="rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none"><option value="auto">Auto</option><option value="2160p">4K</option><option value="1080p">1080p</option><option value="720p">720p</option></select></SettingRow>
            <SettingRow label="Minimum seeders" description="Sources below this remain visible but rank last."><input type="number" min="0" max="10000" value={playback.minimumSeeders} onChange={(event) => update('minimumSeeders', Number(event.target.value))} className="w-24 rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none" /></SettingRow>
            <SettingRow label="Maximum stream size" description="Use 0 for no limit."><div className="flex items-center gap-2"><input type="number" min="0" step="0.5" value={playback.maxStreamSizeGb} onChange={(event) => update('maxStreamSizeGb', Number(event.target.value))} className="w-24 rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none" /><span className="text-[9px] text-white/28">GB</span></div></SettingRow>
            <ToggleRow label="Prefer direct play" description="Prefer H.264/AAC sources that avoid conversion." checked={playback.preferDirectPlay} onChange={(value) => update('preferDirectPlay', value)} />
            <ToggleRow label="Automatic source fallback" description="Try the next ranked source when startup fails." checked={playback.automaticSourceFallback} onChange={(value) => update('automaticSourceFallback', value)} />
            <SettingRow label="Built-in TV provider" description="EZTV is searched automatically for shows that have an IMDb ID."><span className="text-[10px] text-teal-200/55">EZTV enabled</span></SettingRow>
            <ToggleRow label="Torznab provider" description="Add your own Jackett or Prowlarr Torznab endpoint." checked={playback.torznabEnabled} onChange={(value) => update('torznabEnabled', value)} />
            {playback.torznabEnabled && <SettingRow label="Torznab URL" description="Use the complete Torznab API endpoint from Jackett or Prowlarr."><input type="url" value={playback.torznabUrl} placeholder="http://localhost:9117/.../api" onChange={(event) => update('torznabUrl', event.target.value.trim())} className="w-80 rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none" /></SettingRow>}
            {playback.torznabEnabled && <SettingRow label="Torznab API key" description="Stored locally and sent only to your configured endpoint."><input type="password" value={playback.torznabApiKey} placeholder="Optional" onChange={(event) => update('torznabApiKey', event.target.value.trim())} className="w-64 rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none" /></SettingRow>}
          </div>
        </section>

        <section className="mt-9"><h2 className="text-[11px] font-semibold text-white/48">Episodes</h2><div className="mt-3 divide-y divide-white/[0.055] border-y border-white/[0.06]">
          <ToggleRow label="Autoplay next episode" description="Show Up Next at the end and continue automatically." checked={playback.autoplayNextEpisode} onChange={(value) => update('autoplayNextEpisode', value)} />
          <ToggleRow label="Smart downloads" description="Queue the next episode when the current episode finishes." checked={playback.smartDownloads} onChange={(value) => update('smartDownloads', value)} />
          <SettingRow label="Smart download count" description="Number of upcoming episodes to keep queued."><select value={playback.smartDownloadCount} disabled={!playback.smartDownloads} onChange={(event) => update('smartDownloadCount', Number(event.target.value))} className="rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none disabled:opacity-35"><option value="1">1 episode</option><option value="2">2 episodes</option><option value="3">3 episodes</option></select></SettingRow>
          <ToggleRow label="Skip intro and credits" description="Offer a skip button when chapter markers identify them." checked={playback.skipChapterMarkers} onChange={(value) => update('skipChapterMarkers', value)} />
        </div></section>

        <section className="mt-9"><h2 className="text-[11px] font-semibold text-white/48">Language and subtitles</h2><div className="mt-3 divide-y divide-white/[0.055] border-y border-white/[0.06]">
          <SettingRow label="Preferred audio language" description="Three-letter language code, such as eng or hin."><input value={playback.preferredAudioLanguage} maxLength={3} placeholder="Auto" onChange={(event) => update('preferredAudioLanguage', event.target.value.trim().toLowerCase())} className="w-24 rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none" /></SettingRow>
          <SettingRow label="Preferred subtitle language" description="Used for automatic and online subtitle selection."><input value={playback.preferredSubtitleLanguage} maxLength={3} onChange={(event) => update('preferredSubtitleLanguage', event.target.value.trim().toLowerCase())} className="w-24 rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none" /></SettingRow>
          <SettingRow label="Subtitle behavior" description="Automatic uses subtitles when audio language differs."><select value={playback.subtitleMode} onChange={(event) => update('subtitleMode', event.target.value as PlaybackSettings['subtitleMode'])} className="rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none"><option value="auto">Automatic</option><option value="always">Always on</option><option value="off">Off</option></select></SettingRow>
          <SettingRow label="OpenSubtitles API key" description="Optional. Enables online subtitle search without bundling a shared secret."><input type="password" value={playback.openSubtitlesApiKey} placeholder="Not configured" onChange={(event) => update('openSubtitlesApiKey', event.target.value.trim())} className="w-52 rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none" /></SettingRow>
        </div></section>

        <section className="mt-9">
          <h2 className="text-[11px] font-semibold text-white/48">About</h2>
          <div className="mt-3 flex items-center border-y border-white/[0.06] py-4">
            <Info className="mr-4 h-4 w-4 text-white/24" /><div className="flex-1"><p className="text-[11px] text-white/58">StreamForge Desktop</p><p className="mt-1 text-[9px] text-white/24">Electron · React · WebTorrent · FFmpeg</p></div><span className="font-mono text-[9px] text-white/28">0.1.0</span>
          </div>
        </section>
      </main>
    </div>
  )
}

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return <div className="flex items-center gap-5 py-4"><div className="min-w-0 flex-1"><p className="text-[11px] text-white/62">{label}</p><p className="mt-1 text-[9px] text-white/25">{description}</p></div>{children}</div>
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <SettingRow label={label} description={description}><button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-teal-400/75' : 'bg-white/10'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-[18px]' : 'left-0.5'}`} /></button></SettingRow>
}
