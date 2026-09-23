import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Film,
  Tv,
  Plus,
  Trash2,
  Magnet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  ShieldAlert
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { api } from '../lib/api'

type TabType = 'movies' | 'shows'

export default function Admin() {
  const navigate = useNavigate()
  const auth = useAuthStore()
  const [activeTab, setActiveTab] = useState<TabType>('movies')
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Catalog items for listing
  const [moviesList, setMoviesList] = useState<any[]>([])
  const [showsList, setShowsList] = useState<any[]>([])
  const [genres, setGenres] = useState<Array<{ id: string; name: string }>>([])

  // Movie Form State
  const [movieForm, setMovieForm] = useState({
    title: '',
    overview: '',
    release_date: '',
    runtime_minutes: 120,
    language: 'en',
    poster_url: '',
    backdrop_url: '',
    imdb_id: '',
    license_type: 'Creative Commons',
    selected_genres: [] as string[],
    initial_magnet: ''
  })

  // Show Form State
  const [showForm, setShowForm] = useState({
    title: '',
    overview: '',
    first_air_date: '',
    language: 'en',
    poster_url: '',
    backdrop_url: '',
    license_type: 'Creative Commons',
    selected_genres: [] as string[]
  })

  // Magnet Modal State
  const [magnetModal, setMagnetModal] = useState<{
    open: boolean
    targetType: 'movie' | 'episode'
    targetId: string
    title: string
  }>({ open: false, targetType: 'movie', targetId: '', title: '' })

  const [magnetInput, setMagnetInput] = useState({
    magnet_uri: '',
    quality: '1080p',
    codec: 'H.264',
    source: 'Custom'
  })

  // Load catalog data
  const loadCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const [moviesRes, showsRes, genresRes] = await Promise.allSettled([
        api.getMovies(1, 50) as Promise<any>,
        api.getShows(1, 50) as Promise<any>,
        api.getGenres()
      ])

      if (moviesRes.status === 'fulfilled') {
        setMoviesList(moviesRes.value?.data ?? [])
      }
      if (showsRes.status === 'fulfilled') {
        setShowsList(showsRes.value?.data ?? [])
      }
      if (genresRes.status === 'fulfilled') {
        setGenres(genresRes.value?.data ?? [])
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Failed to load catalog data' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (auth.isAuthenticated && auth.user?.role === 'admin') {
      void loadCatalog()
    }
  }, [auth.isAuthenticated, auth.user, loadCatalog])

  if (!auth.isAuthenticated || auth.user?.role !== 'admin') {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-amber-400/80" />
        <h2 className="mt-4 text-[16px] font-semibold text-white/90">Admin Access Required</h2>
        <p className="mt-2 max-w-sm text-[11px] text-white/40">
          This portal requires an administrator account. You are currently signed in as {auth.user?.role || 'guest'}.
        </p>
        <button
          onClick={() => navigate('/settings')}
          className="mt-6 flex items-center gap-2 rounded-lg border border-white/[0.09] px-4 py-2 text-[10px] text-white/60 hover:bg-white/[0.05]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Settings
        </button>
      </div>
    )
  }

  const handleCreateMovie = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!movieForm.title) return
    setLoading(true)
    setStatusMsg(null)
    try {
      const res = await api.createAdminMovie({
        title: movieForm.title,
        overview: movieForm.overview || undefined,
        release_date: movieForm.release_date || undefined,
        runtime_minutes: Number(movieForm.runtime_minutes) || undefined,
        language: movieForm.language,
        poster_url: movieForm.poster_url || undefined,
        backdrop_url: movieForm.backdrop_url || undefined,
        imdb_id: movieForm.imdb_id || undefined,
        license_type: movieForm.license_type,
        genre_ids: movieForm.selected_genres.length ? movieForm.selected_genres : undefined
      })

      const movieId = res.data?.id
      if (movieId && movieForm.initial_magnet) {
        await api.addAdminMovieMagnet(movieId, {
          magnet_uri: movieForm.initial_magnet,
          quality: '1080p',
          codec: 'H.264',
          source: 'Initial Seed'
        })
      }

      setStatusMsg({ type: 'success', text: `Movie "${movieForm.title}" created successfully!` })
      setMovieForm({
        title: '',
        overview: '',
        release_date: '',
        runtime_minutes: 120,
        language: 'en',
        poster_url: '',
        backdrop_url: '',
        imdb_id: '',
        license_type: 'Creative Commons',
        selected_genres: [],
        initial_magnet: ''
      })
      await loadCatalog()
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to create movie' })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteMovie = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return
    try {
      await api.deleteAdminMovie(id)
      setStatusMsg({ type: 'success', text: `Movie "${title}" deleted.` })
      await loadCatalog()
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to delete movie' })
    }
  }

  const handleCreateShow = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!showForm.title) return
    setLoading(true)
    setStatusMsg(null)
    try {
      await api.createAdminShow({
        title: showForm.title,
        overview: showForm.overview || undefined,
        first_air_date: showForm.first_air_date || undefined,
        language: showForm.language,
        poster_url: showForm.poster_url || undefined,
        backdrop_url: showForm.backdrop_url || undefined,
        license_type: showForm.license_type,
        genre_ids: showForm.selected_genres.length ? showForm.selected_genres : undefined
      })

      setStatusMsg({ type: 'success', text: `Show "${showForm.title}" created successfully!` })
      setShowForm({
        title: '',
        overview: '',
        first_air_date: '',
        language: 'en',
        poster_url: '',
        backdrop_url: '',
        license_type: 'Creative Commons',
        selected_genres: []
      })
      await loadCatalog()
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to create show' })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteShow = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return
    try {
      await api.deleteAdminShow(id)
      setStatusMsg({ type: 'success', text: `Show "${title}" deleted.` })
      await loadCatalog()
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to delete show' })
    }
  }

  const handleAddMagnet = async () => {
    if (!magnetInput.magnet_uri) return
    setLoading(true)
    try {
      if (magnetModal.targetType === 'movie') {
        await api.addAdminMovieMagnet(magnetModal.targetId, magnetInput)
      } else {
        await api.addAdminEpisodeMagnet(magnetModal.targetId, magnetInput)
      }
      setStatusMsg({ type: 'success', text: 'Magnet link attached successfully!' })
      setMagnetModal({ open: false, targetType: 'movie', targetId: '', title: '' })
      setMagnetInput({ magnet_uri: '', quality: '1080p', codec: 'H.264', source: 'Custom' })
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to attach magnet' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto w-full max-w-[1040px] px-10 pb-14 pt-8">
        <header className="flex items-center justify-between border-b border-white/[0.06] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/settings')}
                className="text-[10px] text-white/40 hover:text-white/80"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <h1 className="text-[20px] font-semibold text-white/90">Content Administration</h1>
            </div>
            <p className="mt-1 text-[11px] text-white/35">
              Manage database catalog, create titles, and configure P2P magnet streams.
            </p>
          </div>
          <button
            onClick={() => void loadCatalog()}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] text-white/45 hover:bg-white/[0.05]"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </header>

        {statusMsg && (
          <div
            className={`mt-5 flex items-center gap-2 rounded-lg p-3 text-[11px] ${
              statusMsg.type === 'success'
                ? 'bg-teal-500/10 text-teal-300 border border-teal-500/20'
                : 'bg-red-500/10 text-red-300 border border-red-500/20'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Tab Selection */}
        <div className="mt-7 flex gap-2 border-b border-white/[0.06] pb-3">
          <button
            onClick={() => setActiveTab('movies')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-medium transition ${
              activeTab === 'movies'
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70'
            }`}
          >
            <Film className="h-3.5 w-3.5" /> Movies ({moviesList.length})
          </button>
          <button
            onClick={() => setActiveTab('shows')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-medium transition ${
              activeTab === 'shows'
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70'
            }`}
          >
            <Tv className="h-3.5 w-3.5" /> TV Shows ({showsList.length})
          </button>
        </div>

        {/* ─── MOVIES TAB ────────────────────────────────────────── */}
        {activeTab === 'movies' && (
          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Create Movie Form */}
            <form onSubmit={handleCreateMovie} className="space-y-4 rounded-xl border border-white/[0.07] bg-[#141618] p-5 lg:col-span-5">
              <h2 className="text-[12px] font-semibold text-white/75">Add New Movie</h2>
              <div>
                <label className="text-[10px] text-white/40">Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Big Buck Bunny"
                  value={movieForm.title}
                  onChange={(e) => setMovieForm({ ...movieForm, title: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#1a1d1f] px-3 py-2 text-[11px] text-white/80 outline-none focus:border-teal-400/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-white/40">Release Date</label>
                  <input
                    type="date"
                    value={movieForm.release_date}
                    onChange={(e) => setMovieForm({ ...movieForm, release_date: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#1a1d1f] px-2.5 py-1.5 text-[10px] text-white/80 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/40">Runtime (min)</label>
                  <input
                    type="number"
                    value={movieForm.runtime_minutes}
                    onChange={(e) => setMovieForm({ ...movieForm, runtime_minutes: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#1a1d1f] px-2.5 py-1.5 text-[10px] text-white/80 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-white/40">Poster Image URL</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={movieForm.poster_url}
                  onChange={(e) => setMovieForm({ ...movieForm, poster_url: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#1a1d1f] px-3 py-1.5 text-[10px] text-white/80 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40">Overview / Synopsis</label>
                <textarea
                  rows={3}
                  value={movieForm.overview}
                  onChange={(e) => setMovieForm({ ...movieForm, overview: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#1a1d1f] px-3 py-2 text-[10px] text-white/80 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40">Initial Magnet Link (Optional)</label>
                <input
                  type="text"
                  placeholder="magnet:?xt=urn:btih:..."
                  value={movieForm.initial_magnet}
                  onChange={(e) => setMovieForm({ ...movieForm, initial_magnet: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#1a1d1f] px-3 py-1.5 text-[10px] text-white/80 outline-none font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !movieForm.title}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-400/20 py-2.5 text-[11px] font-semibold text-teal-300 hover:bg-teal-400/30 disabled:opacity-40"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add Movie
              </button>
            </form>

            {/* Movies List */}
            <div className="space-y-3 lg:col-span-7">
              <h2 className="text-[12px] font-semibold text-white/75">Database Titles ({moviesList.length})</h2>
              {moviesList.length === 0 ? (
                <p className="text-[11px] text-white/30">No movies found in backend database.</p>
              ) : (
                <div className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.07] bg-[#141618]">
                  {moviesList.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-3.5">
                      <div className="min-w-0 flex-1 pr-4">
                        <p className="truncate text-[11px] font-medium text-white/85">{m.title}</p>
                        <p className="mt-0.5 text-[9px] text-white/35">
                          {m.release_date?.split('T')[0] || 'Unknown year'} · {m.language?.toUpperCase()} · {m.license_type}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setMagnetModal({ open: true, targetType: 'movie', targetId: m.id, title: m.title })}
                          className="flex items-center gap-1 rounded bg-white/[0.06] px-2.5 py-1 text-[9px] text-white/60 hover:bg-white/10"
                        >
                          <Magnet className="h-3 w-3" /> Magnet
                        </button>
                        <button
                          onClick={() => void handleDeleteMovie(m.id, m.title)}
                          className="rounded p-1.5 text-white/30 hover:bg-red-500/10 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── SHOWS TAB ────────────────────────────────────────── */}
        {activeTab === 'shows' && (
          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Create Show Form */}
            <form onSubmit={handleCreateShow} className="space-y-4 rounded-xl border border-white/[0.07] bg-[#141618] p-5 lg:col-span-5">
              <h2 className="text-[12px] font-semibold text-white/75">Add New TV Show</h2>
              <div>
                <label className="text-[10px] text-white/40">Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cosmos"
                  value={showForm.title}
                  onChange={(e) => setShowForm({ ...showForm, title: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#1a1d1f] px-3 py-2 text-[11px] text-white/80 outline-none focus:border-teal-400/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40">First Air Date</label>
                <input
                  type="date"
                  value={showForm.first_air_date}
                  onChange={(e) => setShowForm({ ...showForm, first_air_date: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#1a1d1f] px-2.5 py-1.5 text-[10px] text-white/80 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40">Poster Image URL</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={showForm.poster_url}
                  onChange={(e) => setShowForm({ ...showForm, poster_url: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#1a1d1f] px-3 py-1.5 text-[10px] text-white/80 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40">Overview / Synopsis</label>
                <textarea
                  rows={3}
                  value={showForm.overview}
                  onChange={(e) => setShowForm({ ...showForm, overview: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#1a1d1f] px-3 py-2 text-[10px] text-white/80 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !showForm.title}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-400/20 py-2.5 text-[11px] font-semibold text-teal-300 hover:bg-teal-400/30 disabled:opacity-40"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add TV Show
              </button>
            </form>

            {/* Shows List */}
            <div className="space-y-3 lg:col-span-7">
              <h2 className="text-[12px] font-semibold text-white/75">Database Shows ({showsList.length})</h2>
              {showsList.length === 0 ? (
                <p className="text-[11px] text-white/30">No shows found in backend database.</p>
              ) : (
                <div className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.07] bg-[#141618]">
                  {showsList.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-3.5">
                      <div className="min-w-0 flex-1 pr-4">
                        <p className="truncate text-[11px] font-medium text-white/85">{s.title}</p>
                        <p className="mt-0.5 text-[9px] text-white/35">
                          {s.first_air_date?.split('T')[0] || 'Unknown premiere'} · {s.season_count || 0} seasons · {s.episode_count || 0} episodes
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void handleDeleteShow(s.id, s.title)}
                          className="rounded p-1.5 text-white/30 hover:bg-red-500/10 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Magnet Link Modal */}
        {magnetModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#171a1c] p-6 shadow-2xl space-y-4">
              <h3 className="text-[14px] font-semibold text-white/90">Add Magnet for "{magnetModal.title}"</h3>
              <div>
                <label className="text-[10px] text-white/40">Magnet URI *</label>
                <input
                  type="text"
                  placeholder="magnet:?xt=urn:btih:..."
                  value={magnetInput.magnet_uri}
                  onChange={(e) => setMagnetInput({ ...magnetInput, magnet_uri: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#111315] p-2 text-[10px] text-white/80 font-mono outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-white/40">Quality</label>
                  <select
                    value={magnetInput.quality}
                    onChange={(e) => setMagnetInput({ ...magnetInput, quality: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#111315] p-2 text-[10px] text-white/80 outline-none"
                  >
                    <option value="2160p">4K (2160p)</option>
                    <option value="1080p">1080p</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-white/40">Codec</label>
                  <input
                    type="text"
                    value={magnetInput.codec}
                    onChange={(e) => setMagnetInput({ ...magnetInput, codec: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#111315] p-2 text-[10px] text-white/80 outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMagnetModal({ open: false, targetType: 'movie', targetId: '', title: '' })}
                  className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-[10px] text-white/50 hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleAddMagnet()}
                  disabled={loading || !magnetInput.magnet_uri}
                  className="rounded-lg bg-teal-400/20 px-4 py-1.5 text-[10px] font-semibold text-teal-300 hover:bg-teal-400/30 disabled:opacity-40"
                >
                  Attach Magnet
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
