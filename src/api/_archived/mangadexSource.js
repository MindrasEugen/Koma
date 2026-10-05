// ARCHIVIATO (sessione 10, 2026-09-05) — NON in uso, non registrato in
// src/api/sources.js.
//
// Perché era stato scritto: sessione 3, per stress-testare il formato
// normalizzato condiviso con una fonte reale, pubblica e senza chiave
// (api.mangadex.org), strutturalmente molto diversa dai dati mock — vedi
// project-koma-setup in memoria di progetto. Il test ha avuto successo: il
// formato ha retto dati eterogenei reali senza modifiche al suo schema
// (a parte l'aggiunta esplicitamente richiesta di sourceType).
//
// Perché non è più in uso: decisione di prodotto (sessione 10) — MangaDex è
// strutturalmente una piattaforma di redistribuzione di opere pubblicate
// altrove (scanlation), incompatibile col posizionamento di Koma, che punta
// a dare visibilità e TRAFFICO ad autori indipendenti. Non un problema
// tecnico: sourceType='redistribution' era già impostato staticamente per
// l'intera fonte fin dalla sessione 3, proprio perché MangaDex non permette
// di isolare in modo affidabile le opere pubblicate dall'autore.
//
// Il file resta qui come riferimento per una futura fonte reale con
// struttura dati eterogenea, non per essere riattivato così com'è.

// Fonte reale (api.mangadex.org, pubblica, senza chiave). Adatta i dati al
// formato normalizzato condiviso — vedi mockSource.js per la firma.
//
// Nota importante (verificata in sessione di ricognizione): MangaDex non offre
// un modo affidabile per distinguere opere pubblicate direttamente dall'autore
// da redistribuzioni/scanlation di opere già pubblicate altrove. Per questo
// sourceType è impostato staticamente su 'redistribution' per tutta la fonte,
// non calcolato caso per caso.

const API_BASE = 'https://api.mangadex.org'

function pickLocalizedText(map, fallback = '') {
  if (!map) return fallback
  if (map.en) return map.en
  const values = Object.values(map)
  return values[0] ?? fallback
}

// attributes.title è quasi sempre nella lingua originale (es. coreano
// romanizzato); il titolo inglese più riconoscibile, quando esiste, si trova
// tipicamente dentro altTitles.
function resolveTitle(manga) {
  if (manga.attributes.title.en) return manga.attributes.title.en
  const altEn = (manga.attributes.altTitles ?? []).find((t) => t.en)
  if (altEn) return altEn.en
  return pickLocalizedText(manga.attributes.title)
}

function buildCoverUrl(manga) {
  const coverRel = manga.relationships?.find((r) => r.type === 'cover_art')
  const fileName = coverRel?.attributes?.fileName
  if (!fileName) {
    return 'https://placehold.co/300x420?text=No+Cover'
  }
  return `https://uploads.mangadex.org/covers/${manga.id}/${fileName}`
}

function buildAuthor(manga) {
  const authorRel = manga.relationships?.find((r) => r.type === 'author')
  return authorRel?.attributes?.name ?? 'Autore sconosciuto'
}

function buildGenres(manga) {
  return (manga.attributes.tags ?? [])
    .filter((tag) => tag.attributes.group === 'genre')
    .map((tag) => pickLocalizedText(tag.attributes.name))
}

// L'endpoint di ricerca/dettaglio non espone un conteggio episodi diretto:
// lastChapter è spesso vuoto o solo approssimativo. Un conteggio esatto
// richiederebbe una chiamata aggiuntiva per opera (endpoint aggregate),
// evitata qui per non moltiplicare le richieste in una lista. null quando
// lastChapter non è un numero valido: "sconosciuto" non è "zero".
function buildEpisodeCount(manga) {
  const parsed = Number.parseInt(manga.attributes.lastChapter, 10)
  return Number.isNaN(parsed) ? null : parsed
}

// originalUrl non deve mai restare vuoto: si usa il link alla fonte originale
// (raw) o alla traduzione ufficiale (engtl) quando MangaDex li conosce,
// altrimenti si ripiega sulla scheda MangaDex stessa.
function buildOriginalUrl(manga) {
  const links = manga.attributes.links ?? {}
  return links.raw ?? links.engtl ?? `https://mangadex.org/title/${manga.id}`
}

function normalizeManga(manga) {
  return {
    id: manga.id,
    source: 'mangadex',
    sourceType: 'redistribution',
    type: 'manga',
    title: resolveTitle(manga),
    author: buildAuthor(manga),
    coverUrl: buildCoverUrl(manga),
    synopsis: pickLocalizedText(manga.attributes.description, null),
    genres: buildGenres(manga),
    episodeCount: buildEpisodeCount(manga),
    originalUrl: buildOriginalUrl(manga),
  }
}

async function mangadexFetch(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    throw new Error(`MangaDex ha risposto con errore ${res.status}`)
  }
  return res.json()
}

export async function fetchComics() {
  // Un'unica richiesta con includes[] per cover e autore: evita chiamate N+1
  // per opera e resta ben sotto il rate limit di MangaDex (~5 richieste/s).
  const body = await mangadexFetch(
    '/manga?limit=10&contentRating[]=safe&order[followedCount]=desc&includes[]=cover_art&includes[]=author',
  )
  return body.data.map(normalizeManga)
}

export async function fetchComicById(id) {
  let body
  try {
    body = await mangadexFetch(`/manga/${id}?includes[]=cover_art&includes[]=author`)
  } catch {
    throw new Error(`Opera non trovata su MangaDex: ${id}`)
  }
  return normalizeManga(body.data)
}
