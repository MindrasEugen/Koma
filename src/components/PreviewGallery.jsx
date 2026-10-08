import styles from './PreviewGallery.module.css'

// Tavole di anteprima come vignette affiancate. Ogni immagine si apre a
// dimensione piena in una nuova scheda. url null (firma non riuscita):
// segnaposto invece di un'immagine rotta.
export function PreviewGallery({ previews, title, renderActions }) {
  return (
    <ol className={styles.gallery}>
      {previews.map((preview, i) => (
        <li key={preview.id} className={styles.item}>
          {preview.url ? (
            <a href={preview.url} target="_blank" rel="noreferrer" className={styles.frame}>
              <img
                src={preview.url}
                alt={`Anteprima ${i + 1} di ${title}`}
                loading="lazy"
                className={styles.image}
              />
              <span className="visually-hidden"> (si apre in una nuova scheda)</span>
            </a>
          ) : (
            <div className={`${styles.frame} ${styles.missing}`}>Immagine non disponibile</div>
          )}
          {renderActions?.(preview)}
        </li>
      ))}
    </ol>
  )
}
