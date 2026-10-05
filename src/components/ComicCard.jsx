import { Link } from 'react-router-dom'
import { ComicCover } from './ui/ComicCover'
import styles from './ComicCard.module.css'

// Una vignetta della griglia. Tutta la scheda è un unico link (un solo tab
// stop); il titolo ne è il nome accessibile, la copertina ha il suo alt.
export function ComicCard({ to, title, coverUrl, author, meta, badge }) {
  return (
    <li className={styles.item}>
      <Link to={to} className={styles.card}>
        <ComicCover src={coverUrl} title={title} />
        <div className={styles.body}>
          <h2 className={styles.title}>{title}</h2>
          {/* author undefined = la vista non lo conosce (es. watchlist); null = sconosciuto */}
          {author !== undefined && <p className={styles.author}>{author ?? 'Autore sconosciuto'}</p>}
          {meta && <p className={styles.meta}>{meta}</p>}
          {badge && <div className={styles.badge}>{badge}</div>}
        </div>
      </Link>
    </li>
  )
}

export function ComicGrid({ children, label }) {
  return (
    <ul className={styles.grid} aria-label={label}>
      {children}
    </ul>
  )
}
