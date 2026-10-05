// Edge Function koma-verify-claim (sessione 13).
// Il client la chiama con la propria sessione e { claim_id }. La funzione:
// 1. identifica l'utente dal JWT;
// 2. con register_verification_attempt (service_role) controlla in modo
//    atomico che la claim sia sua, pending, non scaduta, e il limite di
//    frequenza; se tutto è in regola registra il tentativo;
// 3. verifica: pagina profilo (solo host in allowlist) o record DNS TXT;
// 4. solo se la verifica riesce chiama mark_claim_verified (service_role).
// La service_role key è una variabile d'ambiente della funzione, mai nel
// frontend. Dettagli tecnici solo nei log, mai nella risposta all'utente.

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  MAX_REDIRECTS,
  MAX_RESPONSE_BYTES,
  PER_REQUEST_TIMEOUT_MS,
  TOTAL_TIMEOUT_MS,
  checkProfileHtml,
  isFetchableUrl,
  isPrivateIp,
  planVerification,
  txtHasCode,
  type Outcome,
} from './verify.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MESSAGES: Record<string, string> = {
  verified: "Verifica riuscita: ora risulti autore di quest'opera.",
  code_not_found:
    'Codice non trovato nella bio del profilo. Controlla di averlo salvato e riprova tra qualche minuto: la pagina può essere in cache.',
  dns_not_found:
    'Record DNS TXT non trovato sul dominio. Aggiungi il record indicato e riprova: la propagazione DNS può richiedere fino a qualche ora.',
  work_link_not_found: "Il profilo indicato non risulta tra gli autori di quest'opera sulla piattaforma.",
  unsupported_platform:
    'Piattaforma non supportata. Indica il tuo profilo su tapas.io o comicfury.com, oppure il tuo sito personale.',
  manual_review:
    "La verifica automatica non è disponibile per quest'opera: la rivendicazione resta in attesa di revisione da parte di un amministratore.",
  fetch_failed: 'Impossibile leggere la pagina del profilo in questo momento. Riprova più tardi.',
  error: 'La verifica non è riuscita per un problema temporaneo. Riprova più tardi.',
  not_found: 'Rivendicazione non trovata.',
  not_pending: 'Questa rivendicazione non è più in attesa di verifica.',
  expired: 'Rivendicazione scaduta: aprine una nuova.',
  rate_limited: 'Troppi tentativi ravvicinati.',
  claim_attempts_exhausted:
    'Hai raggiunto il numero massimo di tentativi per questa rivendicazione. Ritirala e aprine una nuova.',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

class VerifyError extends Error {
  outcome: Outcome
  constructor(outcome: Outcome, detail: string) {
    super(detail)
    this.outcome = outcome
  }
}

async function resolvePublicIps(host: string): Promise<void> {
  if (typeof Deno.resolveDns !== 'function') {
    throw new VerifyError('error', 'Deno.resolveDns not available')
  }
  // Nome assoluto (punto finale): senza, il resolver prova prima i domini di
  // ricerca dell'infrastruttura (es. "host.eu-central-2.compute.internal.").
  const fqdn = `${host}.`
  const results = await Promise.allSettled([Deno.resolveDns(fqdn, 'A'), Deno.resolveDns(fqdn, 'AAAA')])
  const ips = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (ips.length === 0) throw new VerifyError('fetch_failed', `no DNS records for ${host}`)
  const bad = ips.find((ip) => isPrivateIp(ip))
  if (bad) throw new VerifyError('fetch_failed', `${host} resolves to non-public ${bad}`)
}

async function readLimited(res: Response): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? '0')
  if (declared > MAX_RESPONSE_BYTES) throw new VerifyError('fetch_failed', 'response too large (declared)')
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new VerifyError('fetch_failed', 'response too large')
    }
    chunks.push(value)
  }
  const all = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    all.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(all)
}

// Scarica una pagina profilo con tutte le protezioni SSRF: allowlist degli
// host (rivalidata a ogni redirect), solo https/443, DNS verso IP pubblici,
// timeout per richiesta e totale, dimensione massima, solo HTML/testo.
async function safeFetchText(startUrl: string): Promise<string> {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS
  let url = new URL(startUrl)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isFetchableUrl(url)) throw new VerifyError('fetch_failed', `blocked url ${url.host}`)
    await resolvePublicIps(url.hostname)
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new VerifyError('fetch_failed', 'total timeout')
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      signal: AbortSignal.timeout(Math.min(PER_REQUEST_TIMEOUT_MS, remaining)),
      headers: {
        'User-Agent': 'KomaVerifier/1.0 (verifica rivendicazioni autore)',
        Accept: 'text/html, text/plain',
      },
    })
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      await res.body?.cancel()
      if (!location) throw new VerifyError('fetch_failed', 'redirect without location')
      url = new URL(location, url)
      continue
    }
    if (!res.ok) {
      await res.body?.cancel()
      throw new VerifyError('fetch_failed', `status ${res.status}`)
    }
    const type = (res.headers.get('content-type') ?? '').toLowerCase()
    if (!type.startsWith('text/html') && !type.startsWith('text/plain')) {
      await res.body?.cancel()
      throw new VerifyError('fetch_failed', `content-type ${type}`)
    }
    return await readLimited(res)
  }
  throw new VerifyError('fetch_failed', 'too many redirects')
}

async function verify(profileUrl: string, originalUrl: string | null, code: string): Promise<{ outcome: Outcome; message: string }> {
  const plan = planVerification(profileUrl, originalUrl)
  if (plan.kind === 'result') {
    console.log(`plan result: ${plan.outcome} (${plan.detail})`)
    return { outcome: plan.outcome, message: MESSAGES[plan.outcome] }
  }

  if (plan.kind === 'dns') {
    if (typeof Deno.resolveDns !== 'function') {
      console.error('Deno.resolveDns not available: personal sites go to manual review')
      return { outcome: 'manual_review', message: MESSAGES.manual_review }
    }
    let records: string[][] = []
    try {
      records = await Deno.resolveDns(`${plan.host}.`, 'TXT')
    } catch (e) {
      console.log(`TXT lookup failed for ${plan.host}: ${e}`)
    }
    return txtHasCode(records, code)
      ? { outcome: 'verified', message: MESSAGES.verified }
      : { outcome: 'code_not_found', message: MESSAGES.dns_not_found }
  }

  const html = await safeFetchText(plan.profileUrl)
  const result = checkProfileHtml(plan.platform, html, code, plan.workSlug)
  console.log(`profile check ${plan.platform}: ${result.outcome} (${result.detail})`)
  return { outcome: result.outcome, message: MESSAGES[result.outcome] }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ status: 'error', message: 'Accesso richiesto.' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ status: 'error', message: 'Accesso richiesto.' }, 401)

  let claimId: unknown
  try {
    claimId = (await req.json())?.claim_id
  } catch {
    claimId = null
  }
  if (typeof claimId !== 'string' || !UUID_RE.test(claimId)) {
    return json({ status: 'error', reason: 'not_found', message: MESSAGES.not_found }, 400)
  }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    db: { schema: 'aaa2' },
    auth: { persistSession: false },
  })

  const { data: reg, error: regError } = await admin.rpc('register_verification_attempt', {
    p_claim_id: claimId,
    p_profile_id: userData.user.id,
  })
  if (regError || !reg) {
    console.error('register_verification_attempt failed', regError)
    return json({ status: 'error', reason: 'error', message: MESSAGES.error }, 500)
  }
  if (!reg.allowed) {
    return json({
      status: 'rejected',
      reason: reg.reason,
      message: MESSAGES[reg.reason] ?? MESSAGES.error,
      retry_after: reg.retry_after ?? null,
    })
  }

  let outcome: Outcome
  let message: string
  try {
    ;({ outcome, message } = await verify(reg.verification_profile_url, reg.original_url, reg.verification_code))
  } catch (e) {
    outcome = e instanceof VerifyError ? e.outcome : 'error'
    message = MESSAGES[outcome]
    console.error(`verification failed: ${e instanceof Error ? e.message : e}`)
  }

  if (outcome === 'verified') {
    const { error: markError } = await admin.rpc('mark_claim_verified', { p_claim_id: claimId })
    if (markError) {
      console.error('mark_claim_verified failed', markError)
      outcome = 'error'
      message = MESSAGES.error
    }
  }

  const { error: finishError } = await admin.rpc('finish_verification_attempt', {
    p_attempt_id: reg.attempt_id,
    p_outcome: outcome,
  })
  if (finishError) console.error('finish_verification_attempt failed', finishError)

  return json({ status: outcome === 'verified' ? 'verified' : 'failed', reason: outcome, message })
})
