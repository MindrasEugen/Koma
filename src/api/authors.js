// Pagina autore (sessione 16): profilo pubblico e opere pubblicate di cui la
// persona risulta autrice. Le opere sono restituite nel formato normalizzato
// (normalizeWork di komaSource) più `verified`: l'autorship di QUESTO autore
// su quell'opera è provata da una claim, oppure solo dichiarata
// autopubblicando (self_published_unverified).

import { supabase } from '../lib/supabaseClient'
import { normalizeWork } from './komaSource'

export async function fetchAuthor(id) {
  const { data, error } = await supabase
    .from('AAA3_profiles')
    .select('id, display_name, bio, avatar_url')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Impossibile caricare l'autore: ${error.message}`)
  }
  return data
}

export async function fetchAuthorWorks(id) {
  const { data, error } = await supabase
    .from('AAA3_work_authors')
    .select(
      'authorship_source, works:AAA3_works!inner(*, work_authors:AAA3_work_authors(authorship_source, profiles:AAA3_profiles(id, display_name)))',
    )
    .eq('profile_id', id)
    // Pagina pubblica: solo opere pubblicate, anche se chi guarda potrebbe
    // vederne altre (es. l'autore stesso le proprie in revisione).
    .eq('works.publication_status', 'published')

  if (error) {
    throw new Error(`Impossibile caricare le opere dell'autore: ${error.message}`)
  }
  return data.map((row) => ({
    ...normalizeWork(row.works),
    verified: row.authorship_source === 'claim_verified',
  }))
}
