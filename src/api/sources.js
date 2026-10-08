import * as komaSource from './komaSource'

// Registro delle fonti dati disponibili, tutte con la stessa firma
// (fetchComics, fetchGenres, fetchComicById) e lo stesso formato normalizzato in uscita.
//
// MangaDex è stata rimossa (non archiviata come codice: vedi
// src/api/_archived/mangadexSource.js) perché strutturalmente una
// piattaforma di redistribuzione di opere pubblicate altrove — incompatibile
// col posizionamento di Koma, che punta a dare visibilità e traffico ad
// autori indipendenti.
//
// La fonte "mock" (dati finti che simulavano Tapas, con link inesistenti) è
// stata rimossa in sessione 18: il catalogo reale ha ormai abbastanza opere
// per provare l'interfaccia. Recuperabile dalla cronologia git.
export const SOURCES = {
  koma: komaSource,
}

export const DEFAULT_SOURCE = 'koma'
