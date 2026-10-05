import { supabase } from '../lib/supabaseClient'

export async function isAdmin() {
  const { data, error } = await supabase.rpc('is_admin')

  if (error) {
    throw new Error(`Impossibile verificare i permessi: ${error.message}`)
  }
  return data
}

export async function fetchPendingWorks() {
  const { data, error } = await supabase
    .from('AAA3_works')
    .select('*, work_authors:AAA3_work_authors(authorship_source, profiles:AAA3_profiles(display_name))')
    .eq('publication_status', 'pending_review')
    .order('created_at')

  if (error) {
    throw new Error(`Impossibile caricare le opere in revisione: ${error.message}`)
  }
  return data
}

export async function fetchHiddenWorks() {
  const { data, error } = await supabase
    .from('AAA3_works')
    .select('id, title, type, updated_at, reviews:AAA3_work_reviews(decision, note, created_at)')
    .eq('publication_status', 'hidden')
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`Impossibile caricare le opere nascoste: ${error.message}`)
  }
  return data
}

export async function reviewWork({ workId, decision, note }) {
  const { error } = await supabase.rpc('admin_review_work', {
    p_work_id: workId,
    p_decision: decision,
    p_note: note || null,
  })

  if (error) {
    throw new Error(`Impossibile rivedere l'opera: ${error.message}`)
  }
}

export async function fetchDisputes() {
  const { data: claims, error: claimsError } = await supabase
    .from('AAA3_claims_view')
    .select('*')
    .in('status', ['verified', 'disputed'])
    .order('created_at')

  if (claimsError) {
    throw new Error(`Impossibile caricare le rivendicazioni: ${claimsError.message}`)
  }

  // Raggruppa per work_id e tieni solo i gruppi con almeno una claim 'disputed'
  const groups = {}
  const disputedWorkIds = new Set()
  const claimantIds = new Set()

  claims.forEach(claim => {
    if (!groups[claim.work_id]) {
      groups[claim.work_id] = []
    }
    groups[claim.work_id].push(claim)
    if (claim.status === 'disputed') {
      disputedWorkIds.add(claim.work_id)
    }
    claimantIds.add(claim.claimant_id)
  })

  // Filtra solo i gruppi con claim contese
  const disputedGroupIds = Array.from(disputedWorkIds)

  if (disputedGroupIds.length === 0) {
    return []
  }

  // Carica titoli opere
  const { data: works, error: worksError } = await supabase
    .from('AAA3_works')
    .select('id, title')
    .in('id', disputedGroupIds)

  if (worksError) {
    throw new Error(`Impossibile caricare i titoli: ${worksError.message}`)
  }

  // Carica nomi dei ricorrenti
  const { data: profiles, error: profilesError } = await supabase
    .from('AAA3_profiles')
    .select('id, display_name')
    .in('id', Array.from(claimantIds))

  if (profilesError) {
    throw new Error(`Impossibile caricare i profili: ${profilesError.message}`)
  }

  const workMap = {}
  works.forEach(w => {
    workMap[w.id] = w.title
  })

  const profileMap = {}
  profiles.forEach(p => {
    profileMap[p.id] = p.display_name
  })

  // Arricchisci e ritorna
  return disputedGroupIds.map(workId => ({
    workId,
    title: workMap[workId] || null,
    claims: groups[workId].map(claim => ({
      ...claim,
      claimantName: profileMap[claim.claimant_id] || null,
    })),
  }))
}

export async function resolveDispute({ keepClaimId, note }) {
  const { error } = await supabase.rpc('admin_resolve_dispute', {
    p_keep_claim_id: keepClaimId,
    p_note: note,
  })

  if (error) {
    throw new Error(`Impossibile risolvere la controversia: ${error.message}`)
  }
}

export async function fetchManualReviewClaims() {
  const { data: attempts, error: attemptsError } = await supabase
    .from('AAA3_claim_verification_attempts')
    .select('claim_id')
    .eq('outcome', 'manual_review')

  if (attemptsError) {
    throw new Error(`Impossibile caricare i tentativi di verifica: ${attemptsError.message}`)
  }

  // Estrai ID distinti
  const ids = Array.from(new Set(attempts.map(a => a.claim_id)))

  if (ids.length === 0) {
    return []
  }

  // Carica claim in pending
  const { data: claims, error: claimsError } = await supabase
    .from('AAA3_claims_view')
    .select('*')
    .in('id', ids)
    .eq('effective_status', 'pending')
    .order('created_at')

  if (claimsError) {
    throw new Error(`Impossibile caricare le rivendicazioni: ${claimsError.message}`)
  }

  // Carica titoli e nomi
  const workIds = Array.from(new Set(claims.map(c => c.work_id)))
  const claimantIds = Array.from(new Set(claims.map(c => c.claimant_id)))

  const { data: works, error: worksError } = await supabase
    .from('AAA3_works')
    .select('id, title')
    .in('id', workIds)

  if (worksError) {
    throw new Error(`Impossibile caricare i titoli: ${worksError.message}`)
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('AAA3_profiles')
    .select('id, display_name')
    .in('id', claimantIds)

  if (profilesError) {
    throw new Error(`Impossibile caricare i profili: ${profilesError.message}`)
  }

  const workMap = {}
  works.forEach(w => {
    workMap[w.id] = w.title
  })

  const profileMap = {}
  profiles.forEach(p => {
    profileMap[p.id] = p.display_name
  })

  return claims.map(claim => ({
    ...claim,
    title: workMap[claim.work_id] || null,
    claimantName: profileMap[claim.claimant_id] || null,
  }))
}

export async function decideClaim({ claimId, approve, note }) {
  const { error } = await supabase.rpc('admin_decide_claim', {
    p_claim_id: claimId,
    p_approve: approve,
    p_note: note || null,
  })

  if (error) {
    throw new Error(`Impossibile decidere la rivendicazione: ${error.message}`)
  }
}
