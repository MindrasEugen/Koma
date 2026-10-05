import { useHiddenWorks, useReviewWork } from '../../hooks/useAdmin'

// Ultima decisione sull'opera; copia dell'array per non riordinare la cache.
function latestReview(reviews) {
  return [...(reviews ?? [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
}

export function HiddenWorksSection() {
  const { data, isPending, isError, error } = useHiddenWorks(true)
  const mutation = useReviewWork()

  return (
    <section>
      <h2>Opere nascoste</h2>
      {isPending && <p>Caricamento...</p>}
      {isError && <p>Errore: {error.message}</p>}
      {data && data.length === 0 && <p>Nessuna opera nascosta.</p>}
      {data?.map((work) => {
        const last = latestReview(work.reviews)
        const byAuthor = last?.decision === 'hidden_by_author'
        return (
          <article key={work.id}>
            <h3>{work.title}</h3>
            {byAuthor ? (
              <p>Ritirata dall'autore.</p>
            ) : (
              <p>Nascosta da un amministratore: {last?.note ?? 'nessuna nota'}</p>
            )}
            <button
              onClick={() => mutation.mutate({ workId: work.id, decision: 'published' })}
              disabled={mutation.isPending}
            >
              Ripubblica
            </button>
            {byAuthor && <p>Attenzione: ripubblicandola vai contro la scelta dell'autore.</p>}
          </article>
        )
      })}
      {mutation.isError && <p>Errore: {mutation.error.message}</p>}
    </section>
  )
}
