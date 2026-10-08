import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePendingPreviews, useReviewPreview } from '../../hooks/usePreviews'

function PendingPreview({ preview, mutation }) {
  const [note, setNote] = useState('')

  return (
    <article>
      {preview.url ? (
        <a href={preview.url} target="_blank" rel="noreferrer">
          <img src={preview.url} alt={`Anteprima in revisione di ${preview.workTitle}`} width="240" />
        </a>
      ) : (
        <p>Immagine non disponibile</p>
      )}
      <h3>
        <Link to={`/opera/koma/${preview.workId}`}>{preview.workTitle}</Link>
      </h3>
      <p>Caricata da: {preview.uploaderName ?? '—'}</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Nota (obbligatoria per il rifiuto)"
      />
      <div>
        <button
          onClick={() => mutation.mutate({ previewId: preview.id, decision: 'published', note })}
          disabled={mutation.isPending}
        >
          Approva
        </button>{' '}
        <button
          onClick={() => mutation.mutate({ previewId: preview.id, decision: 'rejected', note })}
          disabled={mutation.isPending || note.trim() === ''}
        >
          Rifiuta
        </button>
      </div>
    </article>
  )
}

export function PendingPreviewsSection() {
  const { data, isPending, isError, error } = usePendingPreviews(true)
  const mutation = useReviewPreview()

  return (
    <section>
      <h2>Anteprime in revisione</h2>
      {isPending && <p>Caricamento...</p>}
      {isError && <p>Errore: {error.message}</p>}
      {data && data.length === 0 && <p>Nessuna anteprima in revisione.</p>}
      {data?.map((preview) => (
        <PendingPreview key={preview.id} preview={preview} mutation={mutation} />
      ))}
      {mutation.isError && <p>Errore: {mutation.error.message}</p>}
    </section>
  )
}
