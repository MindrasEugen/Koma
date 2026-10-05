import { useState } from 'react'
import { useDisputes, useResolveDispute } from '../../hooks/useAdmin'

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '—')

// Le claim in conflitto affiancate: una colonna per claim.
function DisputeGroup({ group, mutation }) {
  const [note, setNote] = useState('')
  const { claims } = group

  return (
    <article>
      <h3>{group.title ?? group.workId}</h3>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (obbligatoria)" />
      <table>
        <tbody>
          <tr>
            <th scope="row">Richiedente</th>
            {claims.map((c) => (
              <td key={c.id}>{c.claimantName ?? '—'}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Stato</th>
            {claims.map((c) => (
              <td key={c.id}>{c.status}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Profilo</th>
            {claims.map((c) => (
              <td key={c.id}>
                <a href={c.verification_profile_url} target="_blank" rel="noreferrer">
                  {c.verification_profile_url}
                </a>
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Aperta il</th>
            {claims.map((c) => (
              <td key={c.id}>{formatDate(c.created_at)}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Verificata il</th>
            {claims.map((c) => (
              <td key={c.id}>{formatDate(c.verified_at)}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Decisione</th>
            {claims.map((c) => (
              <td key={c.id}>
                <button
                  onClick={() => mutation.mutate({ keepClaimId: c.id, note })}
                  disabled={mutation.isPending || note.trim() === ''}
                >
                  Tieni questa
                </button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </article>
  )
}

export function DisputesSection() {
  const { data, isPending, isError, error } = useDisputes(true)
  const mutation = useResolveDispute()

  return (
    <section>
      <h2>Rivendicazioni contese</h2>
      {isPending && <p>Caricamento...</p>}
      {isError && <p>Errore: {error.message}</p>}
      {data && data.length === 0 && <p>Nessuna rivendicazione contesa.</p>}
      {data?.map((group) => (
        <DisputeGroup key={group.workId} group={group} mutation={mutation} />
      ))}
      {mutation.isError && <p>Errore: {mutation.error.message}</p>}
    </section>
  )
}
