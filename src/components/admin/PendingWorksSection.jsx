import { useState } from 'react'
import { usePendingWorks, useReviewWork } from '../../hooks/useAdmin'

function PendingWork({ work, mutation }) {
  const [note, setNote] = useState('')
  const authors = work.work_authors ?? []

  return (
    <article>
      {work.cover_url ? (
        <img src={work.cover_url} alt={`Copertina di ${work.title}`} width="120" />
      ) : (
        <p>Copertina assente</p>
      )}
      <h3>{work.title}</h3>
      <p>Tipo: {work.type}</p>
      <p>Generi: {work.genres?.length ? work.genres.join(', ') : 'Nessun genere'}</p>
      <p>Episodi: {work.episode_count ?? 'sconosciuti'}</p>
      <p>{work.synopsis ?? 'Sinossi assente'}</p>
      {work.original_url ? (
        <p>
          <a href={work.original_url} target="_blank" rel="noreferrer">
            Leggi sull'originale
          </a>
        </p>
      ) : (
        <p>Nessun link originale</p>
      )}
      <p>
        Autori:{' '}
        {authors.length
          ? authors.map((a) => `${a.profiles?.display_name ?? '—'} (${a.authorship_source})`).join(', ')
          : 'nessuno'}
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Nota (obbligatoria per il rifiuto)"
      />
      <div>
        <button
          onClick={() => mutation.mutate({ workId: work.id, decision: 'published', note })}
          disabled={mutation.isPending}
        >
          Pubblica
        </button>{' '}
        <button
          onClick={() => mutation.mutate({ workId: work.id, decision: 'rejected', note })}
          disabled={mutation.isPending || note.trim() === ''}
        >
          Rifiuta
        </button>
      </div>
    </article>
  )
}

export function PendingWorksSection() {
  const { data, isPending, isError, error } = usePendingWorks(true)
  const mutation = useReviewWork()

  return (
    <section>
      <h2>Opere in revisione</h2>
      {isPending && <p>Caricamento...</p>}
      {isError && <p>Errore: {error.message}</p>}
      {data && data.length === 0 && <p>Nessuna opera in revisione.</p>}
      {data?.map((work) => (
        <PendingWork key={work.id} work={work} mutation={mutation} />
      ))}
      {mutation.isError && <p>Errore: {mutation.error.message}</p>}
    </section>
  )
}
