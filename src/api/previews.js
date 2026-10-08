// Anteprime delle opere Koma (sessione 18). Le immagini stanno nel bucket
// Storage privato 'aaa3-previews' in <work_id>/<uid>/<file>; le righe in
// aaa2."AAA3_work_previews". Funzione solo della fonte koma, come watchlist e
// claim: non fa parte del formato normalizzato delle fonti.
//
// Caricamento in due passi: file nello Storage (la policy controlla autore
// verificato e limite), poi register_work_preview. Se la registrazione fallisce
// il file viene rimosso, così non restano file senza riga.

import { supabase } from '../lib/supabaseClient'

const BUCKET = 'aaa3-previews'
export const MAX_PREVIEWS = 5
export const MAX_PREVIEW_BYTES = 1024 * 1024
export const PREVIEW_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
// Gli URL firmati scadono: il tempo di cache delle query (vedi usePreviews) deve restare più corto.
export const SIGNED_URL_SECONDS = 60 * 60

const PREVIEW_COLUMNS = 'id, work_id, storage_path, status, review_note, created_at'

// Aggiunge a ogni riga l'URL firmato dell'immagine (null se la firma fallisce:
// la UI mostra il segnaposto invece di un'immagine rotta).
async function withSignedUrls(rows) {
  if (rows.length === 0) return []
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(rows.map((row) => row.storage_path), SIGNED_URL_SECONDS)
  if (error) {
    throw new Error(`Impossibile caricare le immagini: ${error.message}`)
  }
  const urlByPath = new Map(data.map((item) => [item.path, item.error ? null : item.signedUrl]))
  return rows.map((row) => ({
    id: row.id,
    workId: row.work_id,
    status: row.status,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    url: urlByPath.get(row.storage_path) ?? null,
    ...(row.works && { workTitle: row.works.title }),
    ...(row.uploader && { uploaderName: row.uploader.display_name }),
  }))
}

// Anteprime visibili al pubblico nella scheda dell'opera.
export async function fetchPublishedPreviews(workId) {
  const { data, error } = await supabase
    .from('AAA3_work_previews')
    .select(PREVIEW_COLUMNS)
    .eq('work_id', workId)
    .eq('status', 'published')
    .order('created_at')
  if (error) {
    throw new Error(`Impossibile caricare le anteprime: ${error.message}`)
  }
  return withSignedUrls(data)
}

// Tutte le anteprime di un'opera, in qualunque stato: la RLS le mostra solo
// agli autori dell'opera e agli admin.
export async function fetchWorkPreviews(workId) {
  const { data, error } = await supabase
    .from('AAA3_work_previews')
    .select(PREVIEW_COLUMNS)
    .eq('work_id', workId)
    .order('created_at')
  if (error) {
    throw new Error(`Impossibile caricare le anteprime: ${error.message}`)
  }
  return withSignedUrls(data)
}

// Stessi controlli del bucket, fatti prima per dare un errore chiaro in italiano.
export function previewFileProblem(file) {
  if (!PREVIEW_TYPES[file.type]) return 'Formato non supportato: usa JPG, PNG o WebP.'
  if (file.size > MAX_PREVIEW_BYTES) return "L'immagine supera 1 MB."
  return null
}

export async function uploadPreview({ workId, userId, file }) {
  const problem = previewFileProblem(file)
  if (problem) throw new Error(problem)

  const path = `${workId}/${userId}/${crypto.randomUUID()}.${PREVIEW_TYPES[file.type]}`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) {
    throw new Error(`Caricamento non riuscito: ${uploadError.message}`)
  }

  const { error } = await supabase.rpc('register_work_preview', { p_work_id: workId, p_storage_path: path })
  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(`Impossibile registrare l'anteprima: ${error.message}`)
  }
}

// Prima la riga (così l'anteprima sparisce subito per tutti), poi il file.
export async function deletePreview(previewId) {
  const { data: path, error } = await supabase.rpc('delete_work_preview', { p_preview_id: previewId })
  if (error) {
    throw new Error(`Impossibile eliminare l'anteprima: ${error.message}`)
  }
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([path])
  if (removeError) {
    throw new Error(`Anteprima eliminata, ma il file non è stato rimosso: ${removeError.message}`)
  }
}

export async function fetchPendingPreviews() {
  const { data, error } = await supabase
    .from('AAA3_work_previews')
    .select(`${PREVIEW_COLUMNS}, works:AAA3_works(title), uploader:AAA3_profiles!uploaded_by(display_name)`)
    .eq('status', 'pending_review')
    .order('created_at')
  if (error) {
    throw new Error(`Impossibile caricare le anteprime in revisione: ${error.message}`)
  }
  return withSignedUrls(data)
}

export async function reviewPreview({ previewId, decision, note }) {
  const { error } = await supabase.rpc('admin_review_preview', {
    p_preview_id: previewId,
    p_decision: decision,
    p_note: note || null,
  })
  if (error) {
    throw new Error(`Impossibile revisionare l'anteprima: ${error.message}`)
  }
}
