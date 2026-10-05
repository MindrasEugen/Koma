import { Link } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import { useMyClaims, useWithdrawClaim } from '../hooks/useClaims'
import { StatusBadge } from '../components/ui/StatusBadge'
import { EmptyState, ErrorState, LoadingText } from '../components/ui/States'

export function MyClaimsPage() {
  const { user } = useAuth()
  const { data, isPending, isError, error, refetch } = useMyClaims()
  const withdrawMutation = useWithdrawClaim()

  if (!user) {
    return (
      <EmptyState title="Rivendicazioni" action={<Link to="/login" className="button button-primary">Accedi</Link>}>
        Accedi per vedere le tue rivendicazioni.
      </EmptyState>
    )
  }

  if (isPending) {
    return <LoadingText label="Caricamento delle rivendicazioni" />
  }

  if (isError) {
    return <ErrorState message={error.message} onRetry={refetch} />
  }

  return (
    <>
      <div className="page-head">
        <h1>Le mie rivendicazioni</h1>
      </div>

      {data.length === 0 ? (
        <EmptyState title="Nessuna rivendicazione">
          Se sei l'autore di un'opera del catalogo, puoi rivendicarla dalla sua scheda.
        </EmptyState>
      ) : (
        <ul className="panel-list">
          {data.map((claim) => (
            <li key={claim.id}>
              <div className="row">
                <StatusBadge kind="claim" value={claim.effective_status} />
                <Link to={`/opera/koma/${claim.work_id}`}>Vai all'opera</Link>
              </div>
              <p>
                Codice: <code>{claim.verification_code}</code>
              </p>
              <p className="muted">Scade il {new Date(claim.expires_at).toLocaleString()}</p>
              {claim.notes && <p className="muted">Nota: {claim.notes}</p>}
              {claim.effective_status === 'pending' && (
                <div>
                  <button onClick={() => withdrawMutation.mutate(claim.id)} disabled={withdrawMutation.isPending}>
                    Ritira
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {withdrawMutation.error && (
        <p className="form-error" role="alert">
          Errore: {withdrawMutation.error.message}
        </p>
      )}
    </>
  )
}
