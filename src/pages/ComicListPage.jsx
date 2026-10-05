import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PAGE_SIZE, useComics, useGenres } from '../hooks/useComics'
import { ComicCard, ComicGrid } from '../components/ComicCard'
import { EmptyState, ErrorState, LoadingGrid } from '../components/ui/States'
import { SOURCES, DEFAULT_SOURCE } from '../api/sources'
import { TYPE_LABELS, episodesLabel, typeLabel } from '../lib/labels'
import styles from './ComicListPage.module.css'

// Tutto lo stato del catalogo vive nell'URL (sessione 16), così una ricerca
// si condivide con un link: ?fonte=koma&q=vetro&genere=drama&tipo=manga&pagina=2
function readParams(searchParams) {
  const source = searchParams.get('fonte')
  const page = Number.parseInt(searchParams.get('pagina') ?? '1', 10)
  return {
    sourceKey: source in SOURCES ? source : DEFAULT_SOURCE,
    q: searchParams.get('q') ?? '',
    genre: searchParams.get('genere') ?? '',
    type: searchParams.get('tipo') ?? '',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  }
}

// Costruisce una query string togliendo i valori vuoti e la pagina 1.
function toSearch({ sourceKey, q, genre, type, page }) {
  const sp = new URLSearchParams()
  if (sourceKey !== DEFAULT_SOURCE) sp.set('fonte', sourceKey)
  if (q) sp.set('q', q)
  if (genre) sp.set('genere', genre)
  if (type) sp.set('tipo', type)
  if (page > 1) sp.set('pagina', String(page))
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export function ComicListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const state = readParams(searchParams)
  const { sourceKey, q, genre, type, page } = state
  const [draft, setDraft] = useState(q)
  const [lastQ, setLastQ] = useState(q)

  // Se la ricerca cambia dall'URL (link, indietro), il campo si riallinea.
  if (q !== lastQ) {
    setLastQ(q)
    setDraft(q)
  }

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useComics(sourceKey, {
    q,
    genre,
    type,
    page,
  })
  const { data: genres } = useGenres(sourceKey)

  // Ogni cambio di ricerca o filtro riparte dalla pagina 1.
  const update = (changes) => {
    const next = { ...state, page: 1, ...changes }
    setSearchParams(new URLSearchParams(toSearch(next).slice(1)))
  }

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = Boolean(q || genre || type)

  return (
    <>
      <div className={styles.head}>
        <h1>Catalogo</h1>
        <label className={styles.source}>
          Fonte
          <select value={sourceKey} onChange={(e) => update({ sourceKey: e.target.value, genre: '' })}>
            {Object.keys(SOURCES).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.filters}>
        <form
          className={styles.searchForm}
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            update({ q: draft.trim() })
          }}
        >
          <label htmlFor="catalog-q" className="visually-hidden">
            Cerca per titolo
          </label>
          <input
            id="catalog-q"
            type="search"
            placeholder="Cerca per titolo"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit">Cerca</button>
        </form>

        <label className={styles.filter}>
          Genere
          <select value={genre} onChange={(e) => update({ genre: e.target.value })}>
            <option value="">Tutti</option>
            {/* un genere arrivato da un link ma non (più) presente resta selezionabile */}
            {genre && !genres?.includes(genre) && <option value={genre}>{genre}</option>}
            {genres?.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filter}>
          Tipo
          <select value={type} onChange={(e) => update({ type: e.target.value })}>
            <option value="">Tutti</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!isPending && !isError && (
        <p className={styles.summary} role="status" aria-live="polite">
          {total === 1 ? '1 opera' : `${total} opere`}
          {hasFilters && (
            <>
              {' · '}
              <Link to={toSearch({ sourceKey, q: '', genre: '', type: '', page: 1 }) || '/'}>Azzera filtri</Link>
            </>
          )}
        </p>
      )}

      {isPending && <LoadingGrid label="Caricamento delle opere" />}
      {isError && <ErrorState message={error.message} onRetry={refetch} />}
      {/* Pagina oltre la fine (es. link vecchio): le opere ci sono, la pagina no */}
      {!isPending && !isError && data.items.length === 0 && total > 0 && (
        <EmptyState
          title="Pagina inesistente"
          action={
            <Link className="button" to={toSearch({ ...state, page: 1 }) || '?'}>
              Torna alla prima pagina
            </Link>
          }
        >
          Questa ricerca ha {totalPages === 1 ? 'una sola pagina' : `${totalPages} pagine`}.
        </EmptyState>
      )}
      {!isPending && !isError && total === 0 && (
        <EmptyState title={hasFilters ? 'Nessun risultato' : 'Nessuna opera'}>
          {hasFilters
            ? 'Nessuna opera corrisponde a questa ricerca. Prova con meno filtri.'
            : 'Il catalogo di questa fonte è ancora vuoto.'}
        </EmptyState>
      )}
      {!isPending && !isError && data.items.length > 0 && (
        <div className={isPlaceholderData ? styles.stale : undefined}>
          <ComicGrid label="Opere del catalogo">
            {data.items.map((comic) => (
              <ComicCard
                key={`${comic.source}-${comic.id}`}
                to={`/opera/${comic.source}/${comic.id}`}
                title={comic.title}
                coverUrl={comic.coverUrl}
                author={comic.author}
                meta={`${typeLabel(comic.type)} · ${episodesLabel(comic.episodeCount)}`}
              />
            ))}
          </ComicGrid>
        </div>
      )}

      {!isError && totalPages > 1 && (
        <nav className={styles.pagination} aria-label="Pagine del catalogo">
          {page > 1 ? (
            <Link className="button" to={toSearch({ ...state, page: page - 1 }) || '?'} rel="prev">
              ← Precedente
            </Link>
          ) : (
            <span />
          )}
          <span aria-current="page">
            Pagina {page} di {totalPages}
          </span>
          {page < totalPages ? (
            <Link className="button" to={toSearch({ ...state, page: page + 1 })} rel="next">
              Successiva →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  )
}
