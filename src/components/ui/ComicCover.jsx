import { useState } from 'react'
import styles from './ComicCover.module.css'

// Copertina in proporzione 5:7. Se manca (null) o non si carica, al suo posto
// c'è una vignetta di retino con il titolo: il vuoto detto col linguaggio del
// fumetto, non con un segnaposto grigio.
export function ComicCover({ src, title, eager = false }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div className={styles.frame}>
        <div className={styles.tone} role="img" aria-label={`Copertina di ${title} non disponibile`}>
          <span className={styles.toneTitle} aria-hidden="true">
            {title}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.frame}>
      <img
        className={styles.image}
        src={src}
        alt={`Copertina di ${title}`}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  )
}
