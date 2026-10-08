import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'
import { useMyWorks } from '../hooks/useMyWorks'
import { useDeletePreview, useUploadPreview, useWorkPreviews } from '../hooks/usePreviews'
import { MAX_PREVIEWS, PREVIEW_TYPES } from '../api/previews'
import { PreviewGallery } from '../components/PreviewGallery'
import { StatusBadge } from '../components/ui/StatusBadge'
import { EmptyState, ErrorState, LoadingText } from '../components/ui/States'

// Autorship che permettono di caricare anteprime: stesse di aaa2.is_verified_author.
const VERIFIED_SOURCES = ['claim_verified', 'admin_added']

// Il controllo vero è nel database (policy dello Storage e register_work_preview):
// qui si evita solo di mostrare un form che fallirebbe.
export function WorkPreviewsPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { data: myWorks, isPending: worksPending } = useMyWorks()
  const { data: previews, isPending, isError, error, refetch } = useWorkPreviews(id)
  const uploadMutation = useUploadPreview(id)
  const deleteMutation = useDeletePreview()

  if (!user) {
    return (
      <EmptyState title="Anteprime" action={<Link to="/login" className="button button-primary">Accedi</Link>}>
        Accedi per gestire le anteprime delle tue opere.
      </EmptyState>
    )
  }

  if (worksPending || isPending) {
    return <LoadingText label="Caricamento delle anteprime" />
  }

  const authorship = myWorks?.find((row) => row.works?.id === id)
  if (!authorship || !VERIFIED_SOURCES.includes(authorship.authorship_source)) {
    return (
      <EmptyState title="Anteprime" action={<Link to="/le-mie-opere" className="button">Le mie opere</Link>}>
        Solo gli autori verificati di un'opera possono caricarne le anteprime. Rivendica l'opera per verificarti.
      </EmptyState>
    )
  }

  if (isError) {
    return <ErrorState message={error.message} onRetry={refetch} />
  }

  const title = authorship.works.title
  const used = previews.filter((p) => p.status !== 'rejected').length
  const isFull = used >= MAX_PREVIEWS

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (file) uploadMutation.mutate(file)
    // Svuota il campo: ricaricare lo stesso file deve riattivare onChange
    e.target.value = ''
  }

  return (
    <>
      <div className="page-head">
        <h1>Anteprime</h1>
        <Link to={`/opera/koma/${id}`} className="button">
          Vai all'opera
        </Link>
      </div>
      <p className="panel-title">{title}</p>
      <p className="muted">
        Fino a {MAX_PREVIEWS} immagini (JPG, PNG o WebP, massimo 1 MB ciascuna). Diventano pubbliche nella scheda
        dell'opera dopo l'approvazione di un amministratore. Carica solo tavole di cui sei autore.
      </p>

      <section aria-labelledby="upload-title">
        <h2 id="upload-title">Carica un'anteprima ({used}/{MAX_PREVIEWS})</h2>
        {isFull ? (
          <p className="muted">Hai raggiunto il limite: elimina un'anteprima per caricarne un'altra.</p>
        ) : (
          <div className="field">
            <label>
              Immagine{' '}
              <input
                type="file"
                accept={Object.keys(PREVIEW_TYPES).join(',')}
                onChange={handleFile}
                disabled={uploadMutation.isPending}
              />
            </label>
          </div>
        )}
        {uploadMutation.isPending && <p role="status">Caricamento in corso...</p>}
        {uploadMutation.isError && (
          <p className="form-error" role="alert">
            {uploadMutation.error.message}
          </p>
        )}
        {uploadMutation.isSuccess && (
          <p className="form-info" role="status">
            Anteprima caricata: è in attesa di revisione.
          </p>
        )}
      </section>

      <section aria-labelledby="list-title">
        <h2 id="list-title">Le tue anteprime</h2>
        {previews.length === 0 ? (
          <p className="muted">Nessuna anteprima caricata.</p>
        ) : (
          <PreviewGallery
            previews={previews}
            title={title}
            renderActions={(preview) => (
              <>
                <StatusBadge kind="publication" value={preview.status} />
                {preview.reviewNote && <p className="muted">Nota: {preview.reviewNote}</p>}
                <button onClick={() => deleteMutation.mutate(preview.id)} disabled={deleteMutation.isPending}>
                  Elimina
                </button>
              </>
            )}
          />
        )}
        {deleteMutation.isError && (
          <p className="form-error" role="alert">
            {deleteMutation.error.message}
          </p>
        )}
      </section>
    </>
  )
}
