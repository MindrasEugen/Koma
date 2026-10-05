// Etichette italiane per i valori grezzi del database. tone guida il colore
// del badge (vedi StatusBadge); un valore sconosciuto resta leggibile.

export const TYPE_LABELS = {
  webcomic: 'Webcomic',
  manga: 'Manga',
  anime: 'Anime',
}

export const STATUS_LABELS = {
  publication: {
    pending_review: { label: 'In revisione', tone: 'pending' },
    published: { label: 'Pubblicata', tone: 'ok' },
    hidden: { label: 'Nascosta', tone: 'neutral' },
    rejected: { label: 'Rifiutata', tone: 'bad' },
  },
  watchlist: {
    to_read: { label: 'Da leggere', tone: 'neutral' },
    reading: { label: 'In lettura', tone: 'pending' },
    completed: { label: 'Completata', tone: 'ok' },
    on_hold: { label: 'In pausa', tone: 'neutral' },
    dropped: { label: 'Abbandonata', tone: 'bad' },
  },
  claim: {
    pending: { label: 'In attesa', tone: 'pending' },
    verified: { label: 'Verificata', tone: 'ok' },
    rejected: { label: 'Rifiutata', tone: 'bad' },
    disputed: { label: 'Contesa', tone: 'pending' },
    revoked: { label: 'Revocata', tone: 'bad' },
    withdrawn: { label: 'Ritirata', tone: 'neutral' },
  },
  authorship: {
    claim_verified: { label: 'Autore verificato', tone: 'ok' },
    self_published_unverified: { label: 'Autore non verificato', tone: 'neutral' },
  },
}

export function statusInfo(kind, value) {
  return STATUS_LABELS[kind]?.[value] ?? { label: value ?? '—', tone: 'neutral' }
}

export function typeLabel(type) {
  return TYPE_LABELS[type] ?? type
}

// "Zero episodi" e "numero sconosciuto" sono informazioni diverse.
export function episodesLabel(count) {
  if (count == null) return 'Episodi sconosciuti'
  return count === 1 ? '1 episodio' : `${count} episodi`
}
