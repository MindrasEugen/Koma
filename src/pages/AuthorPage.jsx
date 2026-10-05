import { useParams } from 'react-router-dom'
import { useAuthor, useAuthorWorks } from '../hooks/useAuthor'
import { ComicCard, ComicGrid } from '../components/ComicCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { EmptyState, ErrorState, LoadingGrid, LoadingText } from '../components/ui/States'
import { episodesLabel, typeLabel } from '../lib/labels'
import styles from './AuthorPage.module.css'

// Le opere sono divise in due gruppi distinti anche visivamente: autorship
// provata con una rivendicazione verificata, oppure solo dichiarata
// autopubblicando (self_published_unverified).
function WorksGroup({ title, description, works, verified }) {
  if (works.length === 0) return null
  return (
    <section className={verified ? styles.group : `${styles.group} ${styles.unverified}`}>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      <ComicGrid label={title}>
        {works.map((work) => (
          <ComicCard
            key={work.id}
            to={`/opera/koma/${work.id}`}
            title={work.title}
            coverUrl={work.coverUrl}
            meta={`${typeLabel(work.type)} · ${episodesLabel(work.episodeCount)}`}
            badge={<StatusBadge kind="authorship" value={verified ? 'claim_verified' : 'self_published_unverified'} />}
          />
        ))}
      </ComicGrid>
    </section>
  )
}

export function AuthorPage() {
  const { id } = useParams()
  const author = useAuthor(id)
  const works = useAuthorWorks(id)

  if (author.isPending) {
    return <LoadingText label="Caricamento dell'autore" />
  }
  if (author.isError) {
    return <ErrorState message={author.error.message} onRetry={author.refetch} />
  }
  if (!author.data) {
    return <EmptyState title="Autore non trovato">Questo profilo non esiste o non è più disponibile.</EmptyState>
  }

  const { display_name: name, bio, avatar_url: avatarUrl } = author.data
  const verifiedWorks = works.data?.filter((w) => w.verified) ?? []
  const declaredWorks = works.data?.filter((w) => !w.verified) ?? []

  return (
    <>
      <header className={styles.profile}>
        {avatarUrl && <img className={styles.avatar} src={avatarUrl} alt="" width="96" height="96" />}
        <div>
          <p className={styles.kicker}>Autore</p>
          <h1 className={styles.name}>{name}</h1>
          {bio ? <p className={styles.bio}>{bio}</p> : <p className="muted">Nessuna biografia.</p>}
        </div>
      </header>

      {works.isPending && <LoadingGrid count={4} label="Caricamento delle opere" />}
      {works.isError && <ErrorState message={works.error.message} onRetry={works.refetch} />}
      {works.data && works.data.length === 0 && (
        <EmptyState title="Nessuna opera pubblicata">Questo autore non ha ancora opere nel catalogo.</EmptyState>
      )}
      {works.data && (
        <>
          <WorksGroup
            title="Opere verificate"
            description="L'autore ha dimostrato di essere il titolare del profilo originale dell'opera."
            works={verifiedWorks}
            verified
          />
          <WorksGroup
            title="Opere dichiarate"
            description="Pubblicate da questo profilo su Koma, ma senza una verifica dell'autorship sulla piattaforma originale."
            works={declaredWorks}
            verified={false}
          />
        </>
      )}
    </>
  )
}
