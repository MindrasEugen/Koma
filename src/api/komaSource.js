// Fonte primaria del catalogo: opere registrate direttamente in Koma
// (aaa2."AAA3_works" su Supabase). Adatta i dati al formato normalizzato condiviso.
//
// Contratto comune delle fonti (sessione 16):
// - fetchComics({ q, genre, type, page, pageSize }) → { items, total }
// - fetchGenres() → generi disponibili, ordinati
// - fetchComicById(id) → una singola opera
//
// fetchComics(): passa da aaa2.search_catalog (SECURITY DEFINER), che filtra
// esplicitamente publication_status = 'published'. Una SELECT diretta con la
// RLS non potrebbe usare gli indici GIN su genres e title_search (operatori
// non leakproof): vedi docs/schema.md, sessione 16.
//
// fetchComicById(): NESSUN filtro su publication_status (sessione 9) — un
// filtro qui romperebbe la visualizzazione della propria opera pending_review
// da /le-mie-opere. La RLS di aaa2."AAA3_works" è già la barriera corretta e
// completa per "chi può vedere questa singola riga" (pubblica, o
// autore/inserter/admin) — un filtro client-side aggiuntivo qui sarebbe
// ridondante e, in questo caso, sbagliato.

import { supabase } from '../lib/supabaseClient'

const WORK_COLUMNS =
  '*, work_authors:AAA3_work_authors(authorship_source, profiles:AAA3_profiles(id, display_name))'

// authors: [{ id, name, verified }] — verified distingue l'autorship provata
// con una claim da quella solo dichiarata con l'autopubblicazione.
function buildAuthors(row) {
  return (row.work_authors ?? [])
    .filter((wa) => wa.profiles)
    .map((wa) => ({
      id: wa.profiles.id,
      name: wa.profiles.display_name,
      verified: wa.authorship_source === 'claim_verified',
    }))
}

export function normalizeWork(row) {
  const authors = buildAuthors(row)
  return {
    id: row.id,
    source: 'koma',
    sourceType: row.source_type,
    type: row.type,
    title: row.title,
    // Autore con profilo Koma, altrimenti il nome dichiarato dalla fonte
    // (credited_author, non verificato: sessione 18), altrimenti sconosciuto.
    author: authors[0]?.name ?? row.credited_author ?? null,
    authors,
    // null se manca: la UI mostra il retino, non un'immagine finta (sessione 15)
    coverUrl: row.cover_url,
    synopsis: row.synopsis,
    genres: row.genres ?? [],
    episodeCount: row.episode_count,
    originalUrl: row.original_url,
    publicationStatus: row.publication_status,
    claimedBy: row.claimed_by,
  }
}

export async function fetchComics({ q = '', genre = null, type = null, page = 1, pageSize = 24 } = {}) {
  const from = (Math.max(1, page) - 1) * pageSize
  const args = { p_query: q.trim() || null, p_genre: genre || null, p_type: type || null }
  const { data, error, count } = await supabase
    .rpc('search_catalog', args, { count: 'exact' })
    .select(WORK_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, from + pageSize - 1)

  if (error) {
    // Pagina oltre la fine: PostgREST risponde 416 senza conteggio. È una
    // pagina vuota, non un errore; il totale serve comunque alla UI.
    if (error.code === 'PGRST103') {
      // Prima riga + conteggio (POST come la query principale: con head/GET
      // gli argomenti null finirebbero nell'URL come stringa "null").
      const { count: total, error: countError } = await supabase
        .rpc('search_catalog', args, { count: 'exact' })
        .select('id')
        .range(0, 0)
      if (countError) throw new Error(`Koma ha risposto con errore: ${countError.message}`)
      return { items: [], total: total ?? 0 }
    }
    throw new Error(`Koma ha risposto con errore: ${error.message}`)
  }
  return { items: data.map(normalizeWork), total: count ?? data.length }
}

export async function fetchGenres() {
  const { data, error } = await supabase.rpc('catalog_genres')
  if (error) {
    throw new Error(`Impossibile caricare i generi: ${error.message}`)
  }
  // setof text: PostgREST può restituire stringhe o oggetti { catalog_genres }
  return data.map((row) => (typeof row === 'string' ? row : row.catalog_genres))
}

export async function fetchComicById(id) {
  const { data, error } = await supabase.from('AAA3_works').select(WORK_COLUMNS).eq('id', id).single()

  if (error) {
    throw new Error(`Opera non trovata su Koma: ${id}`)
  }
  return normalizeWork(data)
}
