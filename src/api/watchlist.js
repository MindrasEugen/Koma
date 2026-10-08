// Accesso a aaa2."AAA3_watchlist_entries". A differenza di komaSource,
// non è una "fonte di catalogo" (niente fetchComics/fetchComicById):
// legge e scrive dati mutabili scoped all'utente autenticato, protetti da RLS
// (profile_id = auth.uid()) lato server — i filtri qui sotto sono difensivi,
// non l'unica barriera.

import { supabase } from '../lib/supabaseClient'

export async function fetchWatchlist(userId) {
  const { data, error } = await supabase
    .from('AAA3_watchlist_entries')
    .select('work_id, status, progress, works:AAA3_works(id, title, type, cover_url, publication_status)')
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Impossibile caricare la watchlist: ${error.message}`)
  }
  return data
}

export async function fetchWatchlistEntry(userId, workId) {
  const { data, error } = await supabase
    .from('AAA3_watchlist_entries')
    .select('work_id, status, progress')
    .eq('profile_id', userId)
    .eq('work_id', workId)
    .maybeSingle()

  if (error) {
    throw new Error(`Impossibile leggere la watchlist: ${error.message}`)
  }
  return data
}

export async function addToWatchlist({ userId, workId }) {
  const { error } = await supabase
    .from('AAA3_watchlist_entries')
    .insert({ profile_id: userId, work_id: workId })

  if (error) {
    throw new Error(`Impossibile aggiungere alla watchlist: ${error.message}`)
  }
}

export async function updateWatchlistEntry({ userId, workId, patch }) {
  const { error } = await supabase
    .from('AAA3_watchlist_entries')
    .update(patch)
    .eq('profile_id', userId)
    .eq('work_id', workId)

  if (error) {
    throw new Error(`Impossibile aggiornare la watchlist: ${error.message}`)
  }
}

export async function removeFromWatchlist({ userId, workId }) {
  const { error } = await supabase
    .from('AAA3_watchlist_entries')
    .delete()
    .eq('profile_id', userId)
    .eq('work_id', workId)

  if (error) {
    throw new Error(`Impossibile rimuovere dalla watchlist: ${error.message}`)
  }
}
