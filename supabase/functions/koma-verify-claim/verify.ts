// Logica pura della verifica claim (sessione 13): nessuna dipendenza da Deno,
// così è testabile con Node (verify.test.ts). La rete (DNS, fetch) è iniettata
// da index.ts.
//
// Modello di sicurezza (approvato in sessione 13):
// - si SCARICANO solo pagine profilo su FETCH_HOSTS (allowlist chiusa);
// - i siti personali non vengono mai scaricati: si verificano con un record
//   DNS TXT, quindi nessuna richiesta HTTP verso URL scelti dall'utente;
// - il codice si cerca solo nella bio, il link all'opera solo nell'elenco
//   opere generato dalla piattaforma: un commento o un testo scritto da altri
//   sul profilo non basta a superare la verifica.

export const PER_REQUEST_TIMEOUT_MS = 5000
export const TOTAL_TIMEOUT_MS = 10000
export const MAX_RESPONSE_BYTES = 1_000_000
export const MAX_REDIRECTS = 3

export type Outcome =
  | 'verified'
  | 'code_not_found'
  | 'work_link_not_found'
  | 'unsupported_platform'
  | 'manual_review'
  | 'fetch_failed'
  | 'error'

export type Platform = 'tapas' | 'comicfury' | 'webtoons'

export type VerificationPlan =
  | { kind: 'fetch'; platform: 'tapas' | 'comicfury'; profileUrl: string; workSlug: string }
  | { kind: 'dns'; host: string }
  | { kind: 'result'; outcome: Outcome; detail: string }

// Host da cui la funzione può scaricare pagine. Solo profili, mai opere.
export const FETCH_HOSTS = new Set(['tapas.io', 'www.tapas.io', 'comicfury.com', 'www.comicfury.com'])

// Percorsi di primo livello di Tapas che non sono profili utente.
const TAPAS_RESERVED = new Set([
  'series', 'episode', 'comics', 'novels', 'community', 'newsfeed', 'search', 'events',
  'mature', 'merchshop', 'redeem', 'account', 'login', 'signup', 'help', 'about', 'policies',
])

const SLUG_RE = /^[A-Za-z0-9_.-]{1,100}$/

export function platformOfHost(host: string): Platform | null {
  const h = host.toLowerCase()
  if (h === 'tapas.io' || h === 'www.tapas.io' || h === 'm.tapas.io') return 'tapas'
  if (
    h === 'comicfury.com' || h === 'www.comicfury.com' || h === 'cfw.me' ||
    h.endsWith('.cfw.me') || h.endsWith('.thecomicseries.com')
  ) return 'comicfury'
  if (h === 'webtoons.com' || h === 'www.webtoons.com' || h === 'm.webtoons.com') return 'webtoons'
  return null
}

export function isIpLiteral(host: string): boolean {
  return host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\d+$/.test(host)
}

// URL accettabile come input: http/https, porta di default, nessuna
// credenziale, host che sia un nome di dominio con almeno un punto.
export function parsePublicUrl(raw: string | null): URL | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password) return null
  if (url.port !== '') return null
  const host = url.hostname.toLowerCase()
  if (isIpLiteral(host) || !host.includes('.') || host.endsWith('.')) return null
  return url
}

function tapasUser(url: URL): string | null {
  const m = url.pathname.match(/^\/([A-Za-z0-9_.-]+)\/?$/)
  if (!m || TAPAS_RESERVED.has(m[1].toLowerCase())) return null
  return m[1]
}

function tapasSeriesSlug(url: URL): string | null {
  const m = url.pathname.match(/^\/series\/([A-Za-z0-9_.-]+)(\/info)?\/?$/)
  return m ? m[1].toLowerCase() : null
}

function comicfuryUser(url: URL): string | null {
  const h = url.hostname.toLowerCase()
  if (h !== 'comicfury.com' && h !== 'www.comicfury.com') return null
  if (url.pathname !== '/profile.php') return null
  const u = url.searchParams.get('username')
  return u && SLUG_RE.test(u) ? u : null
}

function comicfuryComicSlug(url: URL): string | null {
  const h = url.hostname.toLowerCase()
  const sub = h.match(/^([a-z0-9_-]+)\.(cfw\.me|thecomicseries\.com)$/)
  if (sub && sub[1] !== 'www') return sub[1]
  if (h === 'comicfury.com' || h === 'www.comicfury.com') {
    const read = url.pathname.match(/^\/read\/([A-Za-z0-9_-]+)/)
    if (read) return read[1].toLowerCase()
    if (url.pathname === '/comicprofile.php') {
      const u = url.searchParams.get('url')
      if (u && SLUG_RE.test(u)) return u.toLowerCase()
    }
  }
  return null
}

// Decide come verificare una claim, senza fare I/O.
export function planVerification(profileRaw: string, originalRaw: string | null): VerificationPlan {
  const profile = parsePublicUrl(profileRaw)
  if (!profile) {
    return { kind: 'result', outcome: 'unsupported_platform', detail: 'profile url not acceptable' }
  }
  if (!originalRaw) {
    return { kind: 'result', outcome: 'manual_review', detail: 'work has no original_url' }
  }
  const original = parsePublicUrl(originalRaw)
  if (!original) {
    return { kind: 'result', outcome: 'manual_review', detail: 'original_url not parseable' }
  }

  const profilePlatform = platformOfHost(profile.hostname)
  const workPlatform = platformOfHost(original.hostname)

  if (profilePlatform === 'webtoons') {
    // Profili Webtoons renderizzati via JavaScript e pagine che rispondono in
    // modo incoerente a una fetch semplice: verifica automatica non affidabile.
    return { kind: 'result', outcome: 'manual_review', detail: 'webtoons profiles not verifiable' }
  }

  if (profilePlatform === null) {
    // Sito personale: verifica tramite DNS TXT sul dominio del profilo, che
    // deve essere lo stesso dominio dell'opera o un suo dominio padre.
    if (workPlatform !== null) {
      return { kind: 'result', outcome: 'work_link_not_found', detail: 'personal profile, platform work' }
    }
    const host = profile.hostname.toLowerCase()
    const workHost = original.hostname.toLowerCase()
    if (workHost !== host && !workHost.endsWith('.' + host)) {
      return { kind: 'result', outcome: 'work_link_not_found', detail: 'work not on profile domain' }
    }
    return { kind: 'dns', host }
  }

  if (workPlatform !== profilePlatform) {
    return { kind: 'result', outcome: 'work_link_not_found', detail: 'profile and work on different platforms' }
  }

  if (profilePlatform === 'tapas') {
    const user = tapasUser(profile)
    const slug = tapasSeriesSlug(original)
    if (!user) return { kind: 'result', outcome: 'unsupported_platform', detail: 'not a tapas profile url' }
    if (!slug) return { kind: 'result', outcome: 'manual_review', detail: 'tapas original_url not a series url' }
    return { kind: 'fetch', platform: 'tapas', profileUrl: `https://tapas.io/${user}`, workSlug: slug }
  }

  const user = comicfuryUser(profile)
  const slug = comicfuryComicSlug(original)
  if (!user) return { kind: 'result', outcome: 'unsupported_platform', detail: 'not a comicfury profile url' }
  if (!slug) return { kind: 'result', outcome: 'manual_review', detail: 'comicfury original_url not recognised' }
  return {
    kind: 'fetch',
    platform: 'comicfury',
    profileUrl: `https://comicfury.com/profile.php?username=${encodeURIComponent(user)}`,
    workSlug: slug,
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function containsCode(text: string, code: string): boolean {
  const re = new RegExp(`(^|[^A-Za-z0-9-])${escapeRegExp(code)}([^A-Za-z0-9-]|$)`, 'i')
  return re.test(text)
}

// Sezioni della pagina profilo. null = struttura non riconosciuta (la
// piattaforma ha cambiato layout): trattato come errore, non come "codice
// assente", per non dare all'utente un messaggio fuorviante.
export function extractSections(platform: 'tapas' | 'comicfury', html: string): { bio: string; works: string } | null {
  if (platform === 'tapas') {
    const start = html.indexOf('<div class="user-desc">')
    if (start === -1) return null
    const stats = html.indexOf('<ul class="stats">', start)
    const close = html.indexOf('</div>', start)
    const ends = [stats, close].filter((i) => i !== -1)
    if (ends.length === 0) return null
    const bio = html.slice(start, Math.min(...ends))
    // L'elenco serie è markup generato: <a href="/series/slug" class="thumb-wrap ...">
    return { bio, works: html }
  }

  const aboutStart = html.indexOf('<div class="pchead">About Me</div>')
  if (aboutStart === -1) return null
  const aboutEnd = html.indexOf('class="pchead"', aboutStart + 10)
  const bio = html.slice(aboutStart, aboutEnd === -1 ? undefined : aboutEnd)
  const worksHead = html.search(/<div class="pchead">[^<]*Webcomics<\/div>/)
  let works = ''
  if (worksHead !== -1) {
    const worksEnd = html.indexOf('class="pchead"', worksHead + 10)
    works = html.slice(worksHead, worksEnd === -1 ? undefined : worksEnd)
  }
  return { bio, works }
}

export function hasWorkLink(platform: 'tapas' | 'comicfury', worksHtml: string, slug: string): boolean {
  const s = escapeRegExp(slug)
  const re = platform === 'tapas'
    ? new RegExp(`<a href="/series/${s}" class="thumb-wrap`, 'i')
    : new RegExp(`href="/comicprofile\\.php\\?url=${s}"`, 'i')
  return re.test(worksHtml)
}

export function checkProfileHtml(
  platform: 'tapas' | 'comicfury',
  html: string,
  code: string,
  slug: string,
): { outcome: Outcome; detail: string } {
  const sections = extractSections(platform, html)
  if (!sections) return { outcome: 'error', detail: `${platform} profile structure not recognised` }
  if (!containsCode(sections.bio, code)) return { outcome: 'code_not_found', detail: 'code not in bio' }
  if (!hasWorkLink(platform, sections.works, slug)) {
    return { outcome: 'work_link_not_found', detail: 'work not listed on profile' }
  }
  return { outcome: 'verified', detail: 'ok' }
}

export function txtHasCode(records: string[][], code: string): boolean {
  const expected = `koma-verify=${code}`.toLowerCase()
  return records.some((chunks) => chunks.join('').trim().toLowerCase() === expected)
}

// --- Filtro indirizzi IP (difesa in profondità: la barriera vera è FETCH_HOSTS)

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n
}

const PRIVATE_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]

export function isPrivateIp(ip: string): boolean {
  const v4 = ipv4ToInt(ip)
  if (v4 !== null) {
    return PRIVATE_V4.some(([base, bits]) => {
      const b = ipv4ToInt(base) as number
      const size = 2 ** (32 - bits)
      return v4 >= b && v4 < b + size
    })
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (!v6.includes(':')) return true // formato sconosciuto: rifiuta
  const mapped = v6.match(/^(::ffff:|64:ff9b::)(\d{1,3}(\.\d{1,3}){3})$/)
  if (mapped) return isPrivateIp(mapped[2])
  if (v6.startsWith('::ffff:') || v6.startsWith('64:ff9b:')) return true
  if (v6 === '::' || v6 === '::1') return true
  if (/^f[cd]/.test(v6)) return true // fc00::/7
  if (/^fe[89ab]/.test(v6)) return true // fe80::/10
  if (v6.startsWith('ff')) return true // multicast
  if (v6.startsWith('2001:db8') || v6.startsWith('2001:0db8')) return true
  return false
}

// Controlla un URL prima di scaricarlo (vale anche per ogni redirect).
export function isFetchableUrl(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    !url.username &&
    !url.password &&
    FETCH_HOSTS.has(url.hostname.toLowerCase())
  )
}
