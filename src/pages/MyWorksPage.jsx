import { Link } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'
import { useHideWork, useMyWorks } from '../hooks/useMyWorks'
import { StatusBadge } from '../components/ui/StatusBadge'
import { EmptyState, ErrorState, LoadingText } from '../components/ui/States'

// Nota dell'ultima revisione, solo per opere rifiutate o nascoste. Ordina una
// copia: l'array originale è quello in cache di React Query.
function reviewNote(work) {
  if (work.publication_status !== 'rejected' && work.publication_status !== 'hidden') return null
  const last = [...(work.reviews ?? [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
  return last?.note ?? null
}

export function MyWorksPage() {
  const { user } = useAuth()
  const { data, isPending, isError, error, refetch } = useMyWorks()
  const hideMutation = useHideWork()

  if (!user) {
    return (
      <EmptyState title="Le mie opere" action={<Link to="/login" className="button button-primary">Accedi</Link>}>
        Accedi per vedere le opere di cui sei autore.
      </EmptyState>
    )
  }

  if (isPending) {
    return <LoadingText label="Caricamento delle tue opere" />
  }

  if (isError) {
    return <ErrorState message={error.message} onRetry={refetch} />
  }

  return (
    <>
      <div className="page-head">
        <h1>Le mie opere</h1>
        <Link to="/pubblica" className="button button-primary">
          Pubblica un'opera
        </Link>
      </div>

      {data.length === 0 ? (
        <EmptyState title="Nessuna opera">
          Non hai ancora pubblicato opere, né ne hai rivendicate.
        </EmptyState>
      ) : (
        <ul className="panel-list">
          {data.map(({ works: work, authorship_source: authorshipSource }) => (
            <li key={work.id}>
              <Link to={`/opera/koma/${work.id}`} className="panel-title">
                {work.title}
              </Link>
              <div className="row">
                <StatusBadge kind="publication" value={work.publication_status} />
                <StatusBadge kind="authorship" value={authorshipSource} />
              </div>
              {reviewNote(work) && <p className="muted">Nota della revisione: {reviewNote(work)}</p>}
              <div className="row">
                {/* Anteprime: solo autorship verificate (stesso controllo di aaa2.is_verified_author) */}
                {(authorshipSource === 'claim_verified' || authorshipSource === 'admin_added') && (
                  <Link to={`/le-mie-opere/${work.id}/anteprime`} className="button">
                    Anteprime
                  </Link>
                )}
                {work.publication_status === 'published' && (
                  <button onClick={() => hideMutation.mutate(work.id)} disabled={hideMutation.isPending}>
                    Ritira dal catalogo
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {hideMutation.isError && (
        <p className="form-error" role="alert">
          Errore: {hideMutation.error.message}
        </p>
      )}
    </>
  )
}
