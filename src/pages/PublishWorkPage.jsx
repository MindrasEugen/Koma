import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'
import { usePublishWork } from '../hooks/useMyWorks'
import { typeLabel } from '../lib/labels'

const TYPE_OPTIONS = ['webcomic', 'manga', 'anime']

// Passa sempre da self_publish_work (mai un INSERT
// diretto) — l'opera nasce in pending_review, invisibile al catalogo
// pubblico finché un admin non la approva o una claim la verifica.
export function PublishWorkPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const publishMutation = usePublishWork()

  const [type, setType] = useState(TYPE_OPTIONS[0])
  const [title, setTitle] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [genres, setGenres] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [originalUrl, setOriginalUrl] = useState('')
  const [episodeCount, setEpisodeCount] = useState('')

  if (!user) {
    return (
      <p>
        <Link to="/login">Accedi</Link> per pubblicare un'opera.
      </p>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const workId = await publishMutation.mutateAsync({
        type,
        title,
        synopsis,
        coverUrl,
        genres: genres
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean),
        originalUrl,
        episodeCount: episodeCount === '' ? null : Number(episodeCount),
      })
      navigate('/le-mie-opere', { state: { justPublished: workId } })
    } catch {
      // errore già in publishMutation.error, mostrato sotto
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <h1>Pubblica un'opera</h1>
      <div className="field">
        <label>
          Titolo{' '}
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
      </div>
      <div className="field">
        <label>
          Tipo{' '}
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        <label>
          Sinossi{' '}
          <textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} />
        </label>
      </div>
      <div className="field">
        <label>
          Generi (separati da virgola){' '}
          <input value={genres} onChange={(e) => setGenres(e.target.value)} />
        </label>
      </div>
      <div className="field">
        <label>
          Cover URL (opzionale){' '}
          <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
        </label>
      </div>
      <div className="field">
        <label>
          URL originale (opzionale — lascia vuoto se l'opera nasce solo qui){' '}
          <input value={originalUrl} onChange={(e) => setOriginalUrl(e.target.value)} />
        </label>
      </div>
      <div className="field">
        <label>
          Numero episodi/capitoli (opzionale){' '}
          <input
            type="number"
            min="0"
            value={episodeCount}
            onChange={(e) => setEpisodeCount(e.target.value)}
          />
        </label>
      </div>
      {publishMutation.isError && (
        <p className="form-error" role="alert">
          Errore: {publishMutation.error.message}
        </p>
      )}
      <button type="submit" className="button-primary" disabled={publishMutation.isPending}>
        Pubblica (va in revisione)
      </button>
    </form>
  )
}
