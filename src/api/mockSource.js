// TODO: Tapas non espone endpoint JSON pubblici e documentati (verificato il 2026-09-04:
// tapas.io/feeds/comics restituisce HTML server-side renderizzato, non un'API stabile).
// Questo file simula la fonte "Tapas" con dati statici finché non si trova un'alternativa
// (API ufficiale non ancora rilasciata, oppure integrazione futura via backend proprio).
// Il resto dell'app dipende solo dal formato normalizzato restituito qui, non da Tapas
// in sé: sostituire questa funzione con una fetch reale non richiede altre modifiche.
// Contratto comune delle fonti: vedi komaSource.js (fetchComics → { items, total }).

const RAW_COMICS = [
  {
    id: 'mock-1',
    source: 'mock',
    sourceType: 'author-published',
    type: 'webcomic',
    title: 'Lore Olympus',
    author: 'Rachel Smythe',
    coverUrl: 'https://placehold.co/300x420?text=Lore+Olympus',
    synopsis: 'Una reinterpretazione moderna del mito di Ade e Persefone.',
    genres: ['romance', 'fantasy'],
    episodeCount: 220,
    originalUrl: 'https://tapas.io/series/Lore-Olympus',
  },
  {
    id: 'mock-2',
    source: 'mock',
    sourceType: 'author-published',
    type: 'webcomic',
    title: 'Unholy Blood',
    author: 'Lline',
    coverUrl: 'https://placehold.co/300x420?text=Unholy+Blood',
    synopsis: 'Una cacciatrice di vampiri scopre una verità che sconvolge la sua identità.',
    genres: ['action', 'horror'],
    episodeCount: 150,
    originalUrl: 'https://tapas.io/series/Unholy-Blood',
  },
  {
    id: 'mock-3',
    source: 'mock',
    sourceType: 'author-published',
    type: 'manga',
    title: 'Days of Hana',
    author: 'Sooj',
    coverUrl: 'https://placehold.co/300x420?text=Days+of+Hana',
    synopsis: 'Una storia di crescita personale e resilienza dopo un trauma.',
    genres: ['drama', 'slice of life'],
    episodeCount: 60,
    originalUrl: 'https://tapas.io/series/Days-of-Hana',
  },
  {
    id: 'mock-4',
    source: 'mock',
    sourceType: 'author-published',
    type: 'webcomic',
    title: 'The Guy Upstairs',
    author: 'Sundae',
    coverUrl: 'https://placehold.co/300x420?text=Guy+Upstairs',
    synopsis: 'Una commedia romantica tra vicini di casa universitari.',
    genres: ['romance', 'comedy'],
    episodeCount: 80,
    originalUrl: 'https://tapas.io/series/The-Guy-Upstairs',
  },
  {
    id: 'mock-5',
    source: 'mock',
    sourceType: 'author-published',
    type: 'webcomic',
    title: 'Wolf Hills',
    author: 'Charmaine Delin',
    coverUrl: 'https://placehold.co/300x420?text=Wolf+Hills',
    synopsis: 'Un branco di licantropi in fuga da un passato oscuro.',
    genres: ['fantasy', 'action'],
    episodeCount: 95,
    originalUrl: 'https://tapas.io/series/Wolf-Hills',
  },
  {
    id: 'mock-6',
    source: 'mock',
    sourceType: 'author-published',
    type: 'manga',
    title: 'Ghost Girl',
    author: 'Yuumei',
    coverUrl: 'https://placehold.co/300x420?text=Ghost+Girl',
    synopsis: 'Una ragazza scopre di poter comunicare con gli spiriti dopo un incidente.',
    genres: ['supernatural', 'mystery'],
    episodeCount: 40,
    originalUrl: 'https://tapas.io/series/Ghost-Girl',
  },
  {
    id: 'mock-7',
    source: 'mock',
    sourceType: 'author-published',
    type: 'webcomic',
    title: 'Knights & Magic Guild',
    author: 'Anon Artist',
    coverUrl: 'https://placehold.co/300x420?text=Knights',
    synopsis: 'Una gilda di cavalieri e maghi difende un regno in declino.',
    genres: ['fantasy', 'adventure'],
    episodeCount: 130,
    originalUrl: 'https://tapas.io/series/Knights-Magic-Guild',
  },
  {
    id: 'mock-8',
    source: 'mock',
    sourceType: 'author-published',
    type: 'webcomic',
    title: 'Late Night Cravings',
    author: 'Miso Studio',
    coverUrl: 'https://placehold.co/300x420?text=Late+Night',
    synopsis: 'Due sconosciuti si incontrano ogni notte in una tavola calda.',
    genres: ['romance', 'slice of life'],
    episodeCount: 55,
    originalUrl: 'https://tapas.io/series/Late-Night-Cravings',
  },
  {
    id: 'mock-9',
    source: 'mock',
    sourceType: 'author-published',
    type: 'manga',
    title: 'Iron Orchard',
    author: 'Devu',
    coverUrl: 'https://placehold.co/300x420?text=Iron+Orchard',
    synopsis: 'In un futuro post-industriale, un\'agricoltrice robotica cerca la libertà.',
    genres: ['sci-fi', 'drama'],
    episodeCount: 30,
    originalUrl: 'https://tapas.io/series/Iron-Orchard',
  },
  {
    id: 'mock-10',
    source: 'mock',
    sourceType: 'author-published',
    type: 'webcomic',
    title: 'Small Gods of Brooklyn',
    author: 'J. Kessler',
    coverUrl: 'https://placehold.co/300x420?text=Small+Gods',
    synopsis: 'Divinità minori dimenticate vivono nascoste in una metropoli moderna.',
    genres: ['fantasy', 'comedy'],
    episodeCount: 70,
    originalUrl: 'https://tapas.io/series/Small-Gods-of-Brooklyn',
  },
]

// La fonte finta non ha profili autore: authors è null (valore mancante), non [].
const MOCK_COMICS = RAW_COMICS.map((comic) => ({ ...comic, authors: null }))

// Simula una latenza di rete per esercitare gli stati di caricamento reali.
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Stessa semantica di aaa2.search_catalog: ogni parola cercata deve essere
// il prefisso di una parola del titolo ("lore oly" trova "Lore Olympus").
function words(text) {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

function matchesQuery(title, q) {
  const wanted = words(q)
  if (wanted.length === 0) return true
  const titleWords = words(title)
  return wanted.every((w) => titleWords.some((t) => t.startsWith(w)))
}

export async function fetchComics({ q = '', genre = null, type = null, page = 1, pageSize = 24 } = {}) {
  await delay(400)
  const filtered = MOCK_COMICS.filter(
    (c) => matchesQuery(c.title, q) && (!genre || c.genres.includes(genre)) && (!type || c.type === type),
  )
  const from = (Math.max(1, page) - 1) * pageSize
  return { items: filtered.slice(from, from + pageSize), total: filtered.length }
}

export async function fetchGenres() {
  await delay(200)
  return [...new Set(MOCK_COMICS.flatMap((c) => c.genres))].sort((a, b) => a.localeCompare(b))
}

export async function fetchComicById(id) {
  await delay(300)
  const comic = MOCK_COMICS.find((c) => c.id === id)
  if (!comic) {
    throw new Error(`Opera non trovata: ${id}`)
  }
  return comic
}
