import { Link } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import { useMyWatchlist } from '../hooks/useWatchlist'
import { ComicCard, ComicGrid } from '../components/ComicCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { EmptyState, ErrorState, LoadingGrid } from '../components/ui/States'
import { typeLabel } from '../lib/labels'

export function WatchlistPage() {
  const { user } = useAuth()
  const { data, isPending, isError, error, refetch } = useMyWatchlist()

  if (!user) {
    return (
      <EmptyState
        title="La tua watchlist"
        action={
          <Link to="/login" className="button button-primary">
            Accedi
          </Link>
        }
      >
        Accedi per tenere traccia delle opere che leggi.
      </EmptyState>
    )
  }

  return (
    <>
      <h1>La mia watchlist</h1>
      {isPending && <LoadingGrid label="Caricamento della watchlist" />}
      {isError && <ErrorState message={error.message} onRetry={refetch} />}
      {!isPending && !isError && data.length === 0 && (
        <EmptyState
          title="Watchlist vuota"
          action={
            <Link to="/" className="button button-primary">
              Sfoglia il catalogo
            </Link>
          }
        >
          Aggiungi un'opera dalla sua scheda per ritrovarla qui.
        </EmptyState>
      )}
      {!isPending && !isError && data.length > 0 && (
        <ComicGrid label="Opere nella watchlist">
          {data.map((entry) => (
            <ComicCard
              key={entry.work_id}
              to={`/opera/koma/${entry.work_id}`}
              title={entry.works?.title ?? 'Opera non disponibile'}
              coverUrl={entry.works?.cover_url ?? null}
              meta={`${entry.works ? typeLabel(entry.works.type) : '—'} · ${entry.progress == null ? 'progresso non indicato' : `progresso ${entry.progress}`}`}
              badge={<StatusBadge kind="watchlist" value={entry.status} />}
            />
          ))}
        </ComicGrid>
      )}
    </>
  )
}
