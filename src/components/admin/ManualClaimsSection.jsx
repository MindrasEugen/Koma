import { useState } from 'react'
import { useDecideClaim, useManualReviewClaims } from '../../hooks/useAdmin'

// Claim per cui la verifica automatica non è disponibile (sessione 13).
function ManualClaim({ claim, mutation }) {
  const [note, setNote] = useState('')

  return (
    <article>
      <h3>{claim.title ?? 'Opera sconosciuta'}</h3>
      <p>Richiedente: {claim.claimantName ?? '—'}</p>
      <p>
        Profilo:{' '}
        <a href={claim.verification_profile_url} target="_blank" rel="noreferrer">
          {claim.verification_profile_url}
        </a>
      </p>
      <p>Aperta il {new Date(claim.created_at).toLocaleString()}</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Nota (obbligatoria per il rifiuto)"
      />
      <div>
        <button
          onClick={() => mutation.mutate({ claimId: claim.id, approve: true, note })}
          disabled={mutation.isPending}
        >
          Approva
        </button>{' '}
        <button
          onClick={() => mutation.mutate({ claimId: claim.id, approve: false, note })}
          disabled={mutation.isPending || note.trim() === ''}
        >
          Rifiuta
        </button>
      </div>
    </article>
  )
}

export function ManualClaimsSection() {
  const { data, isPending, isError, error } = useManualReviewClaims(true)
  const mutation = useDecideClaim()

  return (
    <section>
      <h2>Rivendicazioni in revisione manuale</h2>
      {isPending && <p>Caricamento...</p>}
      {isError && <p>Errore: {error.message}</p>}
      {data && data.length === 0 && <p>Nessuna rivendicazione in attesa di revisione manuale.</p>}
      {data?.map((claim) => (
        <ManualClaim key={claim.id} claim={claim} mutation={mutation} />
      ))}
      {mutation.isError && <p>Errore: {mutation.error.message}</p>}
    </section>
  )
}
