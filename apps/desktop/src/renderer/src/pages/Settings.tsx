import { useEffect, useState, useCallback } from 'react'
import { HardDrive, Info, Keyboard, Loader2, Plus, RotateCcw, Trash2, X, LogOut, User, CheckCircle2, ShieldCheck, Mail, ExternalLink, Shield } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useAppStore } from '../stores/appStore'
import { usePlaybackSettingsStore, type PlaybackSettings } from '../stores/playbackSettingsStore'
import { formatBytes } from '../lib/utils'
import { api } from '../lib/api'

export default function Settings() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const cacheSize = useAppStore((state) => state.cacheSize)
  const refreshCacheSize = useAppStore((state) => state.refreshCacheSize)
  const [clearing, setClearing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const playback = usePlaybackSettingsStore()
  const updateSettings = usePlaybackSettingsStore((state) => state.updateSettings)
  const resetSettings = usePlaybackSettingsStore((state) => state.resetSettings)

  const auth = useAuthStore()
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)

  // Auto-login from OAuth query parameters if present
  useEffect(() => {
    const accessToken = searchParams.get('access_token')
    const refreshToken = searchParams.get('refresh_token')
    const oauthError = searchParams.get('error')
    if (accessToken && refreshToken) {
      api.setToken(accessToken)
      api.getMe().then((res: any) => {
        auth.setSession(accessToken, refreshToken, res.data || { email: 'user@oauth', role: 'user' })
      }).catch(() => {})
    } else if (oauthError) {
      setMessage(`OAuth error: ${oauthError}`)
    }
  }, [searchParams, auth])

  const handleLogin = async () => {
    await auth.login(authEmail, authPassword)
  }
  const handleRegister = async () => {
    await auth.register(authEmail, authPassword)
  }

  const handleRequestVerification = async () => {
    setVerifying(true)
    setVerifyMsg(null)
    try {
      const res = await api.requestEmailVerification()
      setVerifyMsg(res.data?.message || 'Verification token sent (check logs/email).')
    } catch (err: any) {
      setVerifyMsg(err.message || 'Failed to request verification')
    } finally {
      setVerifying(false)
    }
  }

  const handleConfirmVerification = async () => {
    if (!verificationCode.trim()) return
    setVerifying(true)
    setVerifyMsg(null)
    try {
      await api.verifyEmail(verificationCode.trim())
      setVerifyMsg('Email verified successfully! Refreshing session...')
      await auth.refreshAuth()
    } catch (err: any) {
      setVerifyMsg(err.message || 'Failed to verify email')
    } finally {
      setVerifying(false)
    }
  }

  const update = <K extends keyof PlaybackSettings>(key: K, value: PlaybackSettings[K]) => {
    updateSettings({ [key]: value } as Pick<PlaybackSettings, K>)
  }

  const updateTorznabEndpoint = (index: number, field: 'url' | 'apiKey', value: string) => {
    update('torznabEndpoints', playback.torznabEndpoints.map((endpoint, endpointIndex) => (
      endpointIndex === index ? { ...endpoint, [field]: value } : endpoint
    )))
  }

  const updateStremioAddonUrl = (index: number, value: string) => {
    update('stremioAddonUrls', playback.stremioAddonUrls.map((url, urlIndex) => urlIndex === index ? value : url))
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
          <h2 className="text-[11px] font-semibold text-white/48">Account</h2>
          <div className="mt-3 divide-y divide-white/[0.055] border-y border-white/[0.06]">
            {auth.isAuthenticated && auth.user ? (
              <div className="py-5 space-y-4">
                <div className="flex items-center gap-4">
                  <User className="h-4 w-4 text-white/25" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[12px] font-medium text-white/67">{auth.user.email}</p>
                      {auth.user.email_verified ? (
                        <span className="flex items-center gap-1 rounded-full bg-teal-400/10 px-2 py-0.5 text-[9px] font-medium text-teal-300">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Verified
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] font-medium text-amber-300">
                          Unverified
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-white/27">Signed in as {auth.user.role}</p>
                  </div>
                  {auth.user.role === 'admin' && (
                    <button
                      onClick={() => navigate('/admin')}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-400/10 px-3 text-[10px] text-teal-300 hover:bg-teal-400/20"
                    >
                      <Shield className="h-3 w-3" /> Admin Panel
                    </button>
                  )}
                  <button
                    onClick={() => void auth.logout()}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 text-[10px] text-white/40 hover:bg-white/[0.05] hover:text-red-300"
                  >
                    <LogOut className="h-3 w-3" /> Sign out
                  </button>
                </div>

                {!auth.user.email_verified && (
                  <div className="rounded-lg border border-white/[0.06] bg-[#171a1c] p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-amber-300/70" />
                        <span className="text-[10px] text-white/60">Verify your email address</span>
                      </div>
                      <button
                        onClick={() => void handleRequestVerification()}
                        disabled={verifying}
                        className="rounded bg-white/[0.06] px-2.5 py-1 text-[9px] text-white/70 hover:bg-white/10 disabled:opacity-40"
                      >
                        {verifying ? 'Sending...' : 'Request Code'}
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Paste verification code"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        className="min-w-0 flex-1 rounded border border-white/[0.08] bg-[#111315] px-2 py-1 text-[9px] text-white/70 outline-none"
                      />
                      <button
                        onClick={() => void handleConfirmVerification()}
                        disabled={verifying || !verificationCode.trim()}
                        className="rounded bg-teal-400/20 px-3 py-1 text-[9px] font-medium text-teal-300 hover:bg-teal-400/30 disabled:opacity-40"
                      >
                        Confirm
                      </button>
                    </div>
                    {verifyMsg && <p className="mt-2 text-[9px] text-teal-200/70">{verifyMsg}</p>}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-5">
                <div className="flex items-center gap-3">
                  <input
                    type="email"
                    placeholder="Email"
                    value={authEmail}
                    onChange={(e) => { setAuthEmail(e.target.value); auth.clearError() }}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    className="min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={authPassword}
                    onChange={(e) => { setAuthPassword(e.target.value); auth.clearError() }}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    className="min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => void handleLogin()}
                    disabled={auth.isLoading || !authEmail || !authPassword}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-teal-400/15 px-4 text-[10px] font-medium text-teal-300 hover:bg-teal-400/25 disabled:opacity-35"
                  >
                    {auth.isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Sign in
                  </button>
                  <button
                    onClick={() => void handleRegister()}
                    disabled={auth.isLoading || !authEmail || !authPassword}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.09] px-4 text-[10px] text-white/45 hover:bg-white/[0.05] disabled:opacity-35"
                  >
                    Create account
                  </button>
                  <div className="h-4 w-px bg-white/10" />
                  <button
                    onClick={() => void auth.loginWithOAuth('google')}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 text-[10px] text-white/60 hover:bg-white/[0.07]"
                  >
                    Google
                  </button>
                  <button
                    onClick={() => void auth.loginWithOAuth('github')}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 text-[10px] text-white/60 hover:bg-white/[0.07]"
                  >
                    GitHub
                  </button>
                </div>
                {auth.error && (
                  <p className="mt-3 text-[10px] text-red-300/80">{auth.error}</p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="mt-9">
          <h2 className="text-[11px] font-semibold text-white/48">Storage</h2>
          <div className="mt-3 divide-y divide-white/[0.055] border-y border-white/[0.06]">
            <div className="flex items-center gap-4 py-5">
              <HardDrive className="h-4 w-4 text-white/25" />
              <div className="min-w-0 flex-1"><p className="text-[12px] font-medium text-white/67">Temporary streaming cache</p><p className="mt-1 text-[10px] text-white/27">The full selected video downloads for smoother seeking and remains cached until the stream is closed.</p></div>
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
            <SettingRow label="Built-in providers" description="Movies, television, anime archives, and public media are searched automatically."><span className="max-w-80 text-right text-[10px] leading-5 text-teal-200/55">YTS · EZTV · Knaben · APIBay · Nyaa · Anime Tosho · Tokyo Toshokan · Internet Archive</span></SettingRow>
            <ToggleRow label="Prowlarr / Jackett" description="Search up to eight Torznab endpoints alongside built-in providers." checked={playback.torznabEnabled} onChange={(value) => update('torznabEnabled', value)} />
            {playback.torznabEnabled && <SettingRow label="Torznab endpoints" description="Add complete Torznab API URLs. Keys stay on this device and are sent only to their endpoint."><div className="flex w-[390px] flex-col gap-2">
              {playback.torznabEndpoints.map((endpoint, index) => <div key={index} className="flex items-center gap-2">
                <input type="url" value={endpoint.url} placeholder="http://localhost:9696/1/api" onChange={(event) => updateTorznabEndpoint(index, 'url', event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none" />
                <input type="password" value={endpoint.apiKey} placeholder="API key" onChange={(event) => updateTorznabEndpoint(index, 'apiKey', event.target.value)} className="w-24 rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none" />
                <button aria-label={`Remove Torznab endpoint ${index + 1}`} onClick={() => update('torznabEndpoints', playback.torznabEndpoints.filter((_, endpointIndex) => endpointIndex !== index))} className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] text-white/28 hover:text-red-300"><X className="h-3 w-3" /></button>
              </div>)}
              {playback.torznabEndpoints.length < 8 && <button onClick={() => update('torznabEndpoints', [...playback.torznabEndpoints, { url: '', apiKey: '' }])} className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/[0.1] text-[10px] text-white/35 hover:bg-white/[0.04] hover:text-white/60"><Plus className="h-3 w-3" /> Add endpoint</button>}
            </div></SettingRow>}
            <ToggleRow label="Stremio-compatible addons" description="Use torrent streams from self-hosted Comet, MediaFusion, or another compatible addon." checked={playback.stremioAddonEnabled} onChange={(value) => update('stremioAddonEnabled', value)} />
            {playback.stremioAddonEnabled && <SettingRow label="Addon manifests" description="Add configured manifest.json URLs. Only torrent info-hash streams are used."><div className="flex w-[390px] flex-col gap-2">
              {playback.stremioAddonUrls.map((url, index) => <div key={index} className="flex items-center gap-2">
                <input type="url" value={url} placeholder="https://your-addon.example/config/manifest.json" onChange={(event) => updateStremioAddonUrl(index, event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-[#171a1c] px-2.5 py-2 text-[10px] text-white/62 outline-none" />
                <button aria-label={`Remove Stremio addon ${index + 1}`} onClick={() => update('stremioAddonUrls', playback.stremioAddonUrls.filter((_, urlIndex) => urlIndex !== index))} className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] text-white/28 hover:text-red-300"><X className="h-3 w-3" /></button>
              </div>)}
              {playback.stremioAddonUrls.length < 8 && <button onClick={() => update('stremioAddonUrls', [...playback.stremioAddonUrls, ''])} className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/[0.1] text-[10px] text-white/35 hover:bg-white/[0.04] hover:text-white/60"><Plus className="h-3 w-3" /> Add manifest</button>}
            </div></SettingRow>}
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
          <h2 className="text-[11px] font-semibold text-white/48">Controls and Shortcuts</h2>
          <div className="mt-3 divide-y divide-white/[0.055] border-y border-white/[0.06]">
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <Keyboard className="h-4 w-4 text-teal-300/70" />
                <div>
                  <p className="text-[11px] font-medium text-white/70">Keyboard Shortcuts Reference</p>
                  <p className="mt-0.5 text-[9px] text-white/30">View complete cheat sheet of playback and navigation hotkeys.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-shortcuts'))}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-1.5 text-[10px] font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <Keyboard className="h-3.5 w-3.5 text-teal-300" />
                View Shortcuts (<kbd className="font-mono text-[9px] text-teal-200">?</kbd>)
              </button>
            </div>
          </div>
        </section>

        <section className="mt-9">
          <h2 className="text-[11px] font-semibold text-white/48">About</h2>
          <div className="mt-3 flex items-center border-y border-white/[0.06] py-4">
            <Info className="mr-4 h-4 w-4 text-white/24" /><div className="flex-1"><p className="text-[11px] text-white/58">StreamForge Desktop</p><p className="mt-1 text-[9px] text-white/24">Electron · React · WebTorrent · FFmpeg</p></div><span className="font-mono text-[9px] text-white/28">1.1.0</span>
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
