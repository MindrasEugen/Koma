// Scritture sensibili su aaa2."AAA3_works": sempre tramite funzioni SECURITY DEFINER
// (self_publish_work, self_hide_work), mai .insert()/.update() diretti — la
// policy RLS di INSERT vincola inserted_by ma non basta da sola a impedire
// un client di forzare publication_status/source (vedi resoconto sessione 9).

import { supabase } from '../lib/supabaseClient'

export async function publishWork({ type, title, synopsis, coverUrl, genres, originalUrl, episodeCount }) {
  const { data, error } = await supabase.rpc('self_publish_work', {
    p_type: type,
    p_title: title,
    p_synopsis: synopsis || null,
    p_cover_url: coverUrl || null,
    p_genres: genres,
    p_original_url: originalUrl || null,
    p_episode_count: episodeCount ?? null,
  })

  if (error) {
    throw new Error(`Impossibile pubblicare l'opera: ${error.message}`)
  }
  return data
}

export async function hideWork(workId) {
  const { error } = await supabase.rpc('self_hide_work', { p_work_id: workId })

  if (error) {
    throw new Error(`Impossibile ritirare l'opera: ${error.message}`)
  }
}

// L'autorship (AAA3_work_authors) è la fonte autoritativa di "opere mie", non
// inserted_by — dopo una claim verificata su un'opera altrui, l'utente
// diventa autore senza essere l'inserted_by originale.
export async function fetchMyWorks(userId) {
  const { data, error } = await supabase
    .from('AAA3_work_authors')
    .select('role, authorship_source, works:AAA3_works(id, title, type, publication_status, original_url, reviews:AAA3_work_reviews(decision, note, created_at))')
    .eq('profile_id', userId)

  if (error) {
    throw new Error(`Impossibile caricare le tue opere: ${error.message}`)
  }
  return data
}
