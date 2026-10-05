import * as mockSource from './mockSource'
import * as komaSource from './komaSource'

// Registro delle fonti dati disponibili, tutte con la stessa firma
// (fetchComics, fetchComicById) e lo stesso formato normalizzato in uscita.
//
// MangaDex è stata rimossa (non archiviata come codice: vedi
// src/api/_archived/mangadexSource.js) perché strutturalmente una
// piattaforma di redistribuzione di opere pubblicate altrove — incompatibile
// col posizionamento di Koma, che punta a dare visibilità e traffico ad
// autori indipendenti.
export const SOURCES = {
  mock: mockSource,
  koma: komaSource,
}

export const DEFAULT_SOURCE = 'mock'
