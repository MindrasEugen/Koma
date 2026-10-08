// L'apertura di una claim passa da aaa2.open_claim (SECURITY DEFINER): il
// codice e la scadenza li genera il server, mai il client — vedi sessione 10
// (difetto critico: un INSERT diretto lasciava scegliere al client il
// proprio verification_code e una scadenza arbitraria, vanificando la
// verifica). L'INSERT diretto su claims è ora revocato per authenticated.

import { supabase } from '../lib/supabaseClient'

export async function openClaim({ workId, verificationProfileUrl }) {
  const { data, error } = await supabase.rpc('open_claim', {
    p_work_id: workId,
    p_verification_profile_url: verificationProfileUrl,
  })

  if (error) {
    throw new Error(`Impossibile aprire la rivendicazione: ${error.message}`)
  }
  return data
}

export async function withdrawClaim(claimId) {
  const { error } = await supabase.rpc('withdraw_claim', {
    p_claim_id: claimId,
  })

  if (error) {
    throw new Error(`Impossibile ritirare la rivendicazione: ${error.message}`)
  }
}

// Il client legge sempre AAA3_claims_view (effective_status calcolato), mai la
// tabella claims grezza — vedi docs/schema.md §3.
export async function fetchMyClaims(userId) {
  const { data, error } = await supabase
    .from('AAA3_claims_view')
    .select('*')
    .eq('claimant_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Impossibile caricare le rivendicazioni: ${error.message}`)
  }
  return data
}

export async function fetchClaimForWork(userId, workId) {
  const { data, error } = await supabase
    .from('AAA3_claims_view')
    .select('*')
    .eq('claimant_id', userId)
    .eq('work_id', workId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Impossibile leggere la rivendicazione: ${error.message}`)
  }
  return data
}

// Verifica la claim tramite la Edge Function koma-verify-claim con la sessione corrente
export async function verifyClaim(claimId) {
  const { data, error } = await supabase.functions.invoke('koma-verify-claim', {
    body: { claim_id: claimId },
  })

  if (error) {
    try {
      const errorBody = await error.context?.json?.()
      if (errorBody && errorBody.message) {
        return errorBody
      }
    } catch {
      // Ignora errori di parsing JSON
    }
    throw new Error('Impossibile contattare il servizio di verifica.')
  }

  return data
}
