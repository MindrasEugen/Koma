import { useState } from 'react'
import { useClaimForWork, useOpenClaim, useVerifyClaim } from '../hooks/useClaims'
import { LoadingText } from './ui/States'

// Verifica tramite Edge Function koma-verify-claim (sessione 13)
export function ClaimSection({ workId }) {
  const { data: claim, isPending } = useClaimForWork(workId)
  const openMutation = useOpenClaim(workId)
  const verifyMutation = useVerifyClaim(workId)
  const [profileUrl, setProfileUrl] = useState('')

  if (isPending) {
    return <LoadingText label="Caricamento rivendicazione" />
  }

  if (claim && claim.effective_status === 'pending') {
    return (
      <div className="stack">
        <p>Hai una rivendicazione in corso per quest'opera.</p>
        <p>
          Codice di verifica: <code>{claim.verification_code}</code>
        </p>
        <p>
          Incolla questo codice nella bio del tuo profilo su{' '}
          <a href={claim.verification_profile_url} target="_blank" rel="noreferrer">
            {claim.verification_profile_url}
          </a>
          , poi premi "Verifica ora".
        </p>
        <p className="muted">
          Se il profilo è il tuo sito personale, aggiungi invece al dominio un record DNS TXT con valore{' '}
          <code>koma-verify={claim.verification_code}</code>.
        </p>
        <p className="muted">Scade il {new Date(claim.expires_at).toLocaleString()}.</p>
        <div>
          <button
            className="button-primary"
            onClick={() => verifyMutation.mutate(claim.id)}
            disabled={verifyMutation.isPending}
          >
            {verifyMutation.isPending ? 'Verifica in corso...' : 'Verifica ora'}
          </button>
        </div>
        {verifyMutation.data && (
          <p className={verifyMutation.data.status === 'verified' ? 'form-info' : 'form-error'} role="status">
            {verifyMutation.data.message}
            {verifyMutation.data.retry_after && (
              <>
                {' '}
                Riprova dopo le {new Date(verifyMutation.data.retry_after).toLocaleTimeString()}.
              </>
            )}
          </p>
        )}
        {verifyMutation.isError && (
          <p className="form-error" role="alert">
            Errore: {verifyMutation.error.message}
          </p>
        )}
      </div>
    )
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        openMutation.mutate(profileUrl)
      }}
    >
      <div className="field">
        <label>
          URL del tuo profilo sulla piattaforma originale
          <span className="hint">Il tuo profilo (es. tapas.io/tuonome), non l'URL dell'opera.</span>
          <input type="url" value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} required />
        </label>
      </div>
      <div>
        <button type="submit" disabled={openMutation.isPending}>
          Rivendica quest'opera
        </button>
      </div>
      {openMutation.isError && (
        <p className="form-error" role="alert">
          Errore: {openMutation.error.message}
        </p>
      )}
    </form>
  )
}
