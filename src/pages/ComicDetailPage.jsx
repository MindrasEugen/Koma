import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDeleteWork, useIsAdmin } from '../hooks/useAdmin'
import { useComic } from '../hooks/useComic'
import { useAuth } from '../lib/useAuth'
import { useMyWorks } from '../hooks/useMyWorks'
import {
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useUpdateWatchlistEntry,
  useWatchlistEntry,
} from '../hooks/useWatchlist'
import { usePublishedPreviews } from '../hooks/usePreviews'
import { ClaimSection } from '../components/ClaimSection'
import { PreviewGallery } from '../components/PreviewGallery'
import { ComicCover } from '../components/ui/ComicCover'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ErrorState, LoadingText } from '../components/ui/States'
import { STATUS_LABELS, episodesLabel, typeLabel } from '../lib/labels'
import styles from './ComicDetailPage.module.css'

const STATUS_OPTIONS = Object.keys(STATUS_LABELS.watchlist)

// Il work_id delle opere non-koma non esiste in aaa2.works: la watchlist ha
// senso solo per la fonte koma, vedi resoconto.
function WatchlistControls({ workId }) {
  const { data: entry, isPending } = useWatchlistEntry(workId)
  const addMutation = useAddToWatchlist(workId)
  const updateMutation = useUpdateWatchlistEntry(workId)
  const removeMutation = useRemoveFromWatchlist(workId)

  if (isPending) {
    return <LoadingText label="Caricamento watchlist" />
  }

  if (!entry) {
    return (
      <div>
        <button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
          Aggiungi alla watchlist
        </button>
        {addMutation.isError && <p role="alert">Errore: {addMutation.error.message}</p>}
      </div>
    )
  }

  return (
    <div className={styles.watchlist}>
      <label>
        Stato
        <select value={entry.status} onChange={(e) => updateMutation.mutate({ status: e.target.value })}>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS.watchlist[status].label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Progresso
        <input
          type="number"
          step="0.1"
          min="0"
          defaultValue={entry.progress}
          onBlur={(e) => updateMutation.mutate({ progress: Number(e.target.value) })}
        />
      </label>
      <button onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}>
        Rimuovi
      </button>
      {updateMutation.isError && <p role="alert">Errore: {updateMutation.error.message}</p>}
      {removeMutation.isError && <p role="alert">Errore: {removeMutation.error.message}</p>}
    </div>
  )
}

// Anteprime approvate (solo fonte koma). Nessuna anteprima: nessuna sezione,
// e un errore qui non deve nascondere il resto della scheda.
function PreviewSection({ workId, title }) {
  const { data, isError } = usePublishedPreviews(workId)

  if (isError) {
    return <p className="muted">Anteprima non disponibile al momento.</p>
  }
  if (!data?.length) return null

  return (
    <section aria-labelledby="preview-title">
      <h2 id="preview-title" className={styles.panelTitle}>
        Anteprima
      </h2>
      <PreviewGallery previews={data} title={title} />
    </section>
  )
}

// Solo admin: cancellazione definitiva con conferma in due passi. La protezione
// vera è admin_delete_work (controllo is_admin nel database).
function AdminDeletePanel({ workId, title }) {
  const { data: isAdmin } = useIsAdmin()
  const deleteMutation = useDeleteWork()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  if (isAdmin !== true) return null

  return (
    <section className={styles.panel} aria-labelledby="admin-title">
      <h2 id="admin-title" className={styles.panelTitle}>
        Amministrazione
      </h2>
      {confirming ? (
        <>
          <p>
            Eliminare definitivamente «{title}»? Spariscono anche autori, rivendicazioni, watchlist, anteprime e
            storico delle revisioni. Non si può annullare.
          </p>
          <div className="row">
            <button
              className="button-primary"
              onClick={() => deleteMutation.mutate(workId, { onSuccess: () => navigate('/') })}
              disabled={deleteMutation.isPending}
            >
              Conferma eliminazione
            </button>
            <button onClick={() => setConfirming(false)} disabled={deleteMutation.isPending}>
              Annulla
            </button>
          </div>
        </>
      ) : (
        <button onClick={() => setConfirming(true)}>Elimina opera</button>
      )}
      {deleteMutation.isError && (
        <p className="form-error" role="alert">
          {deleteMutation.error.message}
        </p>
      )}
    </section>
  )
}

export function ComicDetailPage() {
  const { source, id } = useParams()
  const { data, isPending, isError, error, refetch } = useComic(source, id)
  const { user } = useAuth()
  const { data: myWorks } = useMyWorks()

  if (isPending) {
    return <LoadingText label="Caricamento dell'opera" />
  }

  if (isError) {
    return <ErrorState message={`Impossibile caricare l'opera: ${error.message}`} onRetry={refetch} />
  }

  const isKoma = source === 'koma'
  // Chi è già autore dell'opera non vede il form di rivendicazione (sessione 12).
  const isAuthor = myWorks?.some((row) => row.works?.id === id) ?? false
  // Opere editoriali (es. MANGA Plus): non rivendicabili, lo blocca anche open_claim.
  const isPublisher = data.sourceType === 'publisher-official'
  const showClaim = isKoma && !data.claimedBy && !isAuthor && !isPublisher

  return (
    <article className={styles.detail}>
      <div className={styles.coverPanel}>
        <ComicCover src={data.coverUrl} title={data.title} eager />
      </div>

      <div className={styles.info}>
        <h1 className={styles.title}>{data.title}</h1>
        {/* Autori con profilo Koma: link alla pagina autore, con lo stato della verifica */}
        {data.authors?.length ? (
          <p className={styles.author}>
            {data.authors.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ', '}
                <Link to={`/autore/${a.id}`}>{a.name}</Link>
                {!a.verified && <span className={styles.unverifiedNote}> (non verificato)</span>}
              </span>
            ))}
          </p>
        ) : (
          <p className={styles.author}>{data.author ?? 'Autore sconosciuto'}</p>
        )}

        <p className={styles.meta}>
          <span>{typeLabel(data.type)}</span>
          <span aria-hidden="true">·</span>
          <span>{episodesLabel(data.episodeCount)}</span>
          {isPublisher && (
            <>
              <span aria-hidden="true">·</span>
              <span>Opera editoriale</span>
            </>
          )}
          {isKoma && data.publicationStatus && data.publicationStatus !== 'published' && (
            <StatusBadge kind="publication" value={data.publicationStatus} />
          )}
        </p>

        {data.genres.length > 0 && (
          <ul className={styles.genres} aria-label="Generi">
            {data.genres.map((genre) => (
              <li key={genre}>{genre}</li>
            ))}
          </ul>
        )}

        {data.synopsis ? (
          <p className={styles.synopsis}>{data.synopsis}</p>
        ) : (
          <p className={`${styles.synopsis} muted`}>Sinossi non ancora disponibile.</p>
        )}

        {isKoma && !isPublisher && <PreviewSection workId={id} title={data.title} />}

        {/* Koma non ospita le tavole (solo poche anteprime): senza original_url il pulsante non c'è */}
        {data.originalUrl ? (
          <a className="button button-primary" href={data.originalUrl} target="_blank" rel="noreferrer">
            Leggi sull'originale
            <span className="visually-hidden"> (si apre in una nuova scheda)</span>
          </a>
        ) : (
          <p className="muted">Nessun link di lettura disponibile.</p>
        )}

        {isKoma && (
          <section className={styles.panel} aria-labelledby="watchlist-title">
            <h2 id="watchlist-title" className={styles.panelTitle}>
              La tua watchlist
            </h2>
            {user ? (
              <WatchlistControls workId={id} />
            ) : (
              <p>
                <Link to="/login">Accedi</Link> per aggiungere quest'opera alla tua watchlist.
              </p>
            )}
          </section>
        )}

        {showClaim && (
          <section className={styles.panel} aria-labelledby="claim-title">
            <h2 id="claim-title" className={styles.panelTitle}>
              Sei l'autore?
            </h2>
            {user ? (
              <ClaimSection workId={id} />
            ) : (
              <p>
                <Link to="/login">Accedi</Link> per rivendicare quest'opera.
              </p>
            )}
          </section>
        )}

        {isKoma && user && <AdminDeletePanel workId={id} title={data.title} />}
      </div>
    </article>
  )
}
