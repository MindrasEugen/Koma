# Schema dati — registrazione autori e catalogo (progettazione)

> **Sessione 12 — rinomina**: tutte le tabelle e la vista hanno il prefisso `AAA3_` in maiuscolo (`aaa2."AAA3_works"`, `aaa2."AAA3_profiles"`, `aaa2."AAA3_work_authors"`, `aaa2."AAA3_claims"`, `aaa2."AAA3_watchlist_entries"`, `aaa2."AAA3_claims_view"`). I nomi vanno SEMPRE scritti tra virgolette doppie. Nel testo di questo documento le tabelle sono spesso citate col nome breve (`works`, `claims`, ...): si intende sempre la tabella `AAA3_` corrispondente. Nomi di policy, indici, vincoli, enum e funzioni NON sono cambiati.

## Da sapere prima di toccare lo schema

Le policy RLS sono solo metà del modello di sicurezza. L'altra metà sono i **privilegi revocati per colonna e per funzione**, che non compaiono leggendo `pg_policies`: una policy che sembra permettere un UPDATE non serve a nulla se la colonna non ha il GRANT, e viceversa. Il principio del progetto: se una scrittura non deve venire dal client, si **revoca il privilegio**, non si aggiunge un controllo su chi chiama.

### Colonne protette (nessun GRANT INSERT/UPDATE per `authenticated`)

Verificato su `information_schema.column_privileges` (sessione 12). Si scrivono solo tramite funzioni `SECURITY DEFINER` o da `service_role`.

| Tabella | Colonne scrivibili da `authenticated` (UPDATE) | Colonne protette (sensibili) |
|---|---|---|
| `works` | `title`, `synopsis`, `cover_url`, `genres`, `episode_count`, `original_url` | `publication_status`; provenienza: `source`, `source_type`, `external_source`, `external_id`, `inserted_by`, `claimed_by`; `type` |
| `profiles` | `display_name`, `bio`, `avatar_url` | `role` |
| `claims` | `verification_profile_url` | `status`, `verification_code`, `expires_at`, `verified_at`, `reviewed_by`, `notes`, `claimant_id`, `work_id` |

Privilegi di tabella revocati a `authenticated`:
- `INSERT` su `works` → l'unica via è `self_publish_work` (sessione 11).
- `INSERT` su `claims` → l'unica via è `open_claim` (sessione 11).
- `DELETE` su `claims` → il ritiro è `withdraw_claim`, che porta la claim a `withdrawn` senza cancellarla (sessione 12). La policy `claims_delete` esiste ancora ma è inerte senza il GRANT.
- `work_authors`: nessun privilegio di scrittura diretto; la scrivono solo `self_publish_work` e `mark_claim_verified`.
- L'unica tabella con scrittura diretta completa dal client è `watchlist_entries`.

**Non ripristinare nessuno di questi privilegi** per "far funzionare" una feature: se serve una nuova scrittura, si crea una funzione `SECURITY DEFINER` dedicata.

### Funzioni eseguibili solo da `service_role`

`aaa2.mark_claim_verified(p_claim_id uuid)`: `EXECUTE` revocato a `PUBLIC`, concesso solo a `service_role`. È voluto: se la potesse chiamare il claimant, potrebbe aprire una claim e verificarsela da sé (difetto critico della sessione 10). La chiama solo la Edge Function `koma-verify-claim`, con la service_role key lato server. Le azioni admin sulle claim vanno in una funzione separata con controllo `is_admin()`, non riaprendo questa.

Stessa regola (sessione 13) per `aaa2.register_verification_attempt(p_claim_id, p_profile_id)` e `aaa2.finish_verification_attempt(p_attempt_id, p_outcome)`, usate solo dalla Edge Function per il limite di frequenza. `service_role` ha `USAGE` sullo schema `aaa2` (concesso in sessione 13: senza, nessuna di queste funzioni era raggiungibile) ma nessun privilegio diretto sulle tabelle.

`aaa2."AAA3_claim_verification_attempts"`: RLS attiva, nessun privilegio di scrittura per `anon`/`authenticated`. La scrivono solo le due funzioni sopra. Da sessione 14 gli admin la LEGGONO (policy `is_admin()`), per la coda delle claim in revisione manuale.

### Funzioni admin (sessione 14)

Il controllo è `is_admin()` dentro la funzione (admin è un attributo di riga, non un ruolo Postgres); `EXECUTE` solo ad `authenticated`, mai ad `anon`.
- `admin_review_work(p_work_id, p_decision, p_note)`: transizioni `pending_review→published|rejected`, `published→hidden`, `hidden→published`. Nota obbligatoria per `rejected`/`hidden`. Ogni decisione scrive una riga in `AAA3_work_reviews`.
- `admin_resolve_dispute(p_keep_claim_id, p_note)`: tra la claim `verified` e le `disputed` della stessa opera, l'admin sceglie quale tenere. Se tiene una disputed: la verified diventa `revoked` e perde l'autorship `claim_verified`. Le altre disputed diventano `rejected`. Nota obbligatoria. Un admin non può decidere dispute in cui è parte.
- `admin_decide_claim(p_claim_id, p_approve, p_note)`: claim `pending` non scadute (revisione manuale). Nota obbligatoria sul rifiuto. Mai sulle proprie.
- `apply_claim_verification(p_claim_id, p_reviewer_id)`: logica condivisa "applica una verifica" (autorship, `claimed_by`, promozione delle opere di catalogo, altre pending → disputed). **EXECUTE revocato a tutti**: la chiamano solo `mark_claim_verified` e le funzioni admin.
- `admin_set_publication_status`: **dismessa**, EXECUTE revocato a tutti (sostituita da `admin_review_work`, che registra la nota; prima la nota veniva ignorata).

### Ricerca e filtri del catalogo (sessione 16)

- `AAA3_works.title_search`: colonna `tsvector` GENERATA dal titolo (config `simple`), indice GIN `works_title_search_idx`. Nessuno la scrive.
- `aaa2.search_catalog(p_query, p_genre, p_type)` → `setof AAA3_works`, **SECURITY DEFINER**, EXECUTE ad `anon`/`authenticated`. Il client la chiama via RPC con embed, ordinamento, `range` e `count: 'exact'` (paginazione a offset).
  - **Perché SECURITY DEFINER** (verificato con EXPLAIN su 20.000 righe sintetiche): con la RLS attiva, gli operatori non leakproof (`@>` sugli array, `@@` del full-text) non possono diventare condizioni di indice, quindi per `anon`/`authenticated` gli indici GIN su `genres` e `title_search` non venivano MAI usati (Index Scan su publication_status + filtro). La funzione gira come proprietario e filtra **esplicitamente** `publication_status = 'published'`: restituisce esattamente ciò che la policy `works_select_published` mostra già a chiunque. Se un giorno la visibilità pubblica cambia, va cambiata anche qui.
  - Query dinamica (piano su misura per ogni combinazione di filtri). La ricerca accetta solo parole alfanumeriche, ciascuna come prefisso (`"cron vet"` → `'cron':* & 'vet':*`): nessuna sintassi tsquery dall'utente.
  - Limite noto: niente ricerca "contiene" a metà parola (`ronache` non trova `Cronache`) né insensibilità agli accenti: servirebbero `pg_trgm`/`unaccent`, estensioni a livello di database condiviso, quindi escluse.
- `aaa2.catalog_genres()` → generi distinti delle sole opere pubblicate, SECURITY INVOKER.

### Storico delle decisioni sulle opere (sessione 14)

`aaa2."AAA3_work_reviews"` (work_id, reviewer_id, decision, note, created_at). `decision` ∈ `published`, `rejected`, `hidden`, `hidden_by_author` (scritta da `self_hide_work`, così si distingue il ritiro dell'autore dalla rimozione admin). Vincolo: nota obbligatoria per `rejected`/`hidden`. Lettura: admin e autori/inserter dell'opera. Nessuna scrittura diretta. Tabella separata da `works` perché le colonne delle opere pubblicate sono leggibili da chiunque.

`publication_status` ha il nuovo valore `rejected` (sessione 14): visibile solo all'autore e agli admin (le policy di lettura pubblica filtrano `published`). Un'opera rifiutata oggi non può essere ripresentata: nessuna transizione da `rejected`.

### `CREATE OR REPLACE FUNCTION` e gli overload

Cambiare la firma di una funzione (aggiungere, togliere o cambiare il tipo di un parametro) con `CREATE OR REPLACE` **non sostituisce** la funzione: crea un secondo overload. PostgREST poi rifiuta le chiamate ambigue (`PGRST203`). È successo con `self_publish_work` (sessione 9, corretto in sessione 11). Quando cambia la firma: `DROP FUNCTION` della vecchia firma nella stessa migrazione, poi verifica su `pg_proc` che resti un solo overload. Attenzione anche ai privilegi: la nuova funzione riparte dai default (`EXECUTE` a `PUBLIC`), quindi i `REVOKE`/`GRANT` vanno riapplicati.

---

Stato: **implementato e applicato** al progetto Supabase `cinema-vicino-app` (id `wjswqerpvwockfbgjggy`), schema `aaa2`, sessione 6 (2026-09-04). Questo file resta la documentazione di riferimento ma descrive ora oggetti REALMENTE esistenti nel database, non solo una proposta.

Contesto che guida le scelte qui sotto: l'aggregazione automatica (Tapas, Webtoon Canvas, MangaDex) non regge come fonte primaria del catalogo — vedi le sessioni precedenti. Questo schema tratta la **registrazione diretta degli autori** come fonte primaria, non come funzionalità accessoria.

**Sessione 5**: chiude la falla nell'autopubblicazione, applica le decisioni prese (§B del brief), corregge `original_url`/`progress`.

**Sessione 6**: applicate le migrazioni reali su Supabase, tutto dentro lo schema `aaa2` (progetto condiviso con un altro prodotto, `clear-math`, in `public` — mai toccato). Le funzioni che qui erano firme non implementate (`self_publish_work`, `mark_claim_verified`, `admin_set_publication_status`) ora hanno un corpo reale e sono live nel database; aggiunta `self_hide_work` (nuova). Aggiunte anche due protezioni per colonna non esplicitamente richieste ma necessarie (vedi §5): `profiles.role` e `claims.status` non erano scrivibili in sicurezza dalle sole policy di riga.

**Sessioni 10/11 — audit ostile e chiusura difetti**: un audit sistematico con scritture dirette "ostili" (non tramite l'app) ha trovato 4 difetti, tutti della stessa forma — una scrittura diretta del client che sarebbe dovuta passare da una funzione. Il più grave: `mark_claim_verified` non verificava affatto CHI la chiamasse, e l'INSERT diretto su `claims` lasciava al client scegliere `verification_code`/`expires_at`/`status` — combinati, un utente poteva autoverificarsi come autore di QUALSIASI opera senza alcuna prova reale. Corretto revocando i privilegi diretti (mai aggiungendo controlli aggiuntivi come unica difesa) — vedi §2 e §4 per il dettaglio: `mark_claim_verified` ora chiamabile solo da `service_role`; nuova funzione `open_claim` per l'apertura claim; `REVOKE INSERT` su `works` e `claims` per `authenticated`; `is_admin()` senza argomento (prima rivelava lo stato admin di un uid a scelta).

---

## 1. Diagramma testuale

```
auth.users (Supabase Auth, gestita da Supabase)
    │ 1:1 (profiles.id = auth.users.id)
    ▼
profiles ─────────────────────────────────────────┐
    │                                              │
    │ 1:N (claimant_id)                            │ N:M tramite work_authors
    │                                              │ (authorship_source distingue
    ▼                                              │  self_published_unverified
 claims ──────────────────(work_id)───────────►  works  │  da claim_verified — vedi §3/§4)
    │  (claims_view espone                          │
    │   effective_status, vedi §3)          publication_status:
    │                                        pending_review | published | hidden
    │ claims.verification_profile_url               │
    │ (profilo autore, NON works.original_url)       │ 1:N
    │                                                ▼
    └── work_authors (work_id, profile_id, role,   watchlist_entries ◄── profile_id
        authorship_source)                          (profile_id, work_id, status, progress numeric)
        scritta solo da funzioni SECURITY DEFINER
        (self_publish_work, mark_claim_verified)
```

Relazioni chiave (invariate dalla sessione 4):
- `profiles` 1:1 con `auth.users`.
- `works` N:M con `profiles` tramite `work_authors`.
- `claims` N:1 verso `works` e verso `profiles`; una verifica riuscita scrive in `work_authors` e in `works.claimed_by`.
- `watchlist_entries` N:1 verso `profiles` e verso `works`.

Novità di questa sessione: `works.publication_status` (visibilità nel catalogo) e `work_authors.authorship_source` (origine dell'autorship: verificata o no) — vedi §2 e §3 per il perché.

---

## 2. DDL commentato

```sql
-- Estensione per gen_random_uuid() — abilitata di default nei progetti Supabase.
create extension if not exists pgcrypto;

-- ============================================================
-- ENUM condivisi con il formato normalizzato già in uso nel codice
-- (src/api/*.js): { type, sourceType } devono restare in sync manualmente,
-- non c'è un meccanismo automatico che lo garantisce — vedi §5.
-- ============================================================

create type work_type as enum ('webcomic', 'manga', 'anime');

create type source_type as enum ('author-published', 'redistribution', 'unknown');

create type claim_status as enum ('pending', 'verified', 'rejected', 'disputed', 'revoked');

create type watchlist_status as enum ('to_read', 'reading', 'completed', 'on_hold', 'dropped');

-- Ruolo minimo per la RLS. Confermato invariato in sessione 5 (§B.2).
create type app_role as enum ('user', 'admin');

-- NUOVO (sessione 5, punto A): visibilità di un'opera nel catalogo pubblico.
-- Copre sia la coda di revisione dell'autopubblicazione sia il soft delete
-- richiesto al punto B.3.
create type publication_status as enum ('pending_review', 'published', 'hidden');

-- NUOVO (sessione 5, punto A): da dove viene l'autorship di una riga
-- work_authors. È il cuore della soluzione alla falla — vedi §3.
create type authorship_source as enum ('self_published_unverified', 'claim_verified', 'admin_added');


-- ============================================================
-- profiles — un profilo per utente Supabase Auth (invariata)
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  bio text,
  avatar_url text,
  role app_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La riga profiles viene creata da un trigger su auth.users (codice
-- applicativo, fuori scope qui), non da un INSERT diretto del client.


-- ============================================================
-- works — il catalogo. 'type' resta l'unico punto di variazione per formato.
-- ============================================================

create table public.works (
  id uuid primary key default gen_random_uuid(),

  type work_type not null,
  title text not null,
  synopsis text,
  cover_url text,

  -- MODIFICATO (sessione 5, punto C): nullable. Un'opera può esistere SOLO su
  -- Koma (autore che pubblica per la prima volta qui, senza una piattaforma
  -- esterna già esistente). Vedi §5 per l'implicazione di prodotto che questo
  -- riapre e che non ho risolto io.
  original_url text,

  genres text[] not null default '{}',
  episode_count integer,           -- generico: capitoli/episodi, nullable perché non sempre noto

  -- Provenienza: chi l'ha inserita, da dove, con che affidabilità.
  -- Valori attesi per `source`: 'manual' (curata da admin), 'self-published'
  -- (via self_publish_work). external_source/external_id restano dormienti
  -- per ora — vedi B.8: SOLO per un autore che collega un'opera già
  -- pubblicata altrove (es. 'webtoon', 'tapas'), MAI per un import
  -- automatico/massivo senza una decisione esplicita. Nota (sessione 10):
  -- MangaDex era l'esempio originale qui, ma è stata rimossa come fonte —
  -- vedi src/api/_archived/mangadexSource.js — perché strutturalmente una
  -- piattaforma di redistribuzione (scanlation), incompatibile col
  -- posizionamento di Koma (dare visibilità e traffico ad autori indipendenti).
  source text not null,
  source_type source_type not null,
  external_source text,            -- es. 'webtoon', 'tapas' — SOLO per un autore che collega un'opera già presente altrove (B.8), non per import
  external_id text,                -- id nel sistema esterno — non riusato come PK, vedi §5
  inserted_by uuid references public.profiles(id),  -- null se import automatico/servizio

  -- NUOVO (sessione 5): stato di pubblicazione. Il catalogo pubblico mostra
  -- solo 'published'. Scritto SOLO da funzioni (mai da UPDATE diretto del
  -- client, nemmeno admin — vedi §4). Default 'pending_review': un INSERT del
  -- client (autopubblicazione) è invisibile finché qualcosa non lo promuove.
  publication_status publication_status not null default 'pending_review',

  -- "Un" autore verificato di riferimento, non "l'unico": un'opera può avere
  -- più autori claim_verified (autore + disegnatore verificati separatamente).
  -- Non nullo ⟺ esiste almeno un'autorship claim_verified; per l'elenco
  -- completo vedere work_authors. Scritto solo da mark_claim_verified.
  claimed_by uuid references public.profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index works_type_idx on public.works(type);
create index works_source_type_idx on public.works(source_type);
create index works_external_idx on public.works(external_source, external_id);
create index works_publication_status_idx on public.works(publication_status);

-- NUOVO (sessione 5, punto B.6): indice GIN per ricerca/filtro su genres,
-- text[] confermato invece di una tabella tag normalizzata.
create index works_genres_gin_idx on public.works using gin (genres);


-- ============================================================
-- work_authors — relazione N:M opera-autore
-- ============================================================

create table public.work_authors (
  work_id uuid not null references public.works(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'author',  -- testo libero: 'author' | 'artist' | 'translator' ...

  -- NUOVO (sessione 5, punto A): il cuore della soluzione alla falla.
  -- 'self_published_unverified' non è MAI equivalente a 'claim_verified' nei
  -- dati, non solo in UI — nessuna query può confonderle senza guardare
  -- esplicitamente questo campo.
  authorship_source authorship_source not null default 'self_published_unverified',

  added_at timestamptz not null default now(),
  primary key (work_id, profile_id, role)
);

create index work_authors_profile_idx on public.work_authors(profile_id);

-- Nessuna policy INSERT/UPDATE/DELETE per authenticated/anon (deny-by-default
-- di Postgres RLS). Uniche vie di scrittura: self_publish_work (inserisce con
-- authorship_source='self_published_unverified') e mark_claim_verified
-- (upsert con authorship_source='claim_verified').


-- ============================================================
-- claims — rivendicazione di una scheda esistente
-- ============================================================

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  claimant_id uuid not null references public.profiles(id) on delete cascade,

  status claim_status not null default 'pending',
  verification_code text not null,

  -- works.original_url punta alla pagina della SERIE (ora anche nullable, se
  -- l'opera è nata su Koma); il codice va incollato nella bio del PROFILO
  -- AUTORE, un URL diverso, richiesto esplicitamente al claimant.
  verification_profile_url text not null,

  expires_at timestamptz not null default (now() + interval '7 days'),
  verified_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index claims_work_idx on public.claims(work_id);
create index claims_claimant_idx on public.claims(claimant_id);

-- Un solo claim "in corso" per (opera, richiedente). La colonna `status`
-- letterale, non l'effective_status virtuale (vedi §3) — l'indice richiede
-- un predicato immutabile, non può usare now().
create unique index claims_one_pending_per_claimant
  on public.claims(work_id, claimant_id)
  where status = 'pending';

-- NUOVO (sessione 5, punto B.5): nessun cron. Prima di ogni nuovo INSERT,
-- questo trigger marca 'rejected' le claim pending scadute dello stesso
-- claimant sulla stessa opera, cosí l'indice unico sopra non blocca una
-- nuova richiesta legittima dopo la scadenza della precedente.
create or replace function public.expire_stale_claims()
returns trigger
language plpgsql
as $$
begin
  update public.claims
    set status = 'rejected', updated_at = now()
    where claimant_id = new.claimant_id
      and work_id = new.work_id
      and status = 'pending'
      and expires_at < now();
  return new;
end;
$$;

create trigger claims_expire_stale_before_insert
  before insert on public.claims
  for each row execute function public.expire_stale_claims();

-- NUOVO (sessione 5, punto B.5): per le semplici letture (una claim pending
-- scaduta ma non ancora "toccata" da un nuovo insert o da un tentativo di
-- verifica) espone uno stato calcolato al volo, senza scrivere nulla.
-- security_invoker=true: la vista rispetta la RLS della tabella base invece
-- di usare i permessi del proprietario della vista (richiede Postgres 15+,
-- disponibile su Supabase). Il client legge questa vista, non `claims` grezza.
create view public.claims_view
  with (security_invoker = true)
  as
  select *,
    case
      when status = 'pending' and expires_at < now() then 'rejected'::claim_status
      else status
    end as effective_status
  from public.claims;


-- ============================================================
-- watchlist_entries — progresso generico, non legato a "episodio"/"capitolo"
-- ============================================================

create table public.watchlist_entries (
  profile_id uuid not null references public.profiles(id) on delete cascade,

  -- L'FK resta 'on delete cascade': ora è un percorso eccezionale, perché
  -- 'hidden' (soft delete) è la via standard e non causa mai un DELETE reale.
  -- Il cascade resta come rete di sicurezza per il raro hard delete
  -- amministrativo (es. obbligo legale), dove eliminare anche i riferimenti
  -- in watchlist è corretto perché l'opera non esiste più in nessuna forma.
  work_id uuid not null references public.works(id) on delete cascade,

  status watchlist_status not null default 'to_read',

  -- MODIFICATO (sessione 5, punto C): da integer a numeric. I capitoli manga
  -- con numerazione tipo 10.5 sono comuni (split di un capitolo), non un
  -- caso limite. Precisione a una cifra decimale, senza tetto artificiale
  -- stretto ma con un limite ragionevole di cifre.
  progress numeric(7,1) not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, work_id)
);
```

### Funzioni — IMPLEMENTATE e live su Supabase (sessione 6)

Tutte in schema `aaa2`, `security definer`, `set search_path = aaa2, pg_temp` (mitiga il rischio di search_path hijacking sulle funzioni SECURITY DEFINER). L'unica parte davvero non implementata resta l'I/O di rete della verifica claim (fetch di `verification_profile_url`, ricerca del codice), che va in una Edge Function separata e chiama `mark_claim_verified` solo con l'esito.

```sql
create or replace function aaa2.self_publish_work(
  p_type aaa2.work_type,
  p_title text,
  p_synopsis text,
  p_cover_url text,
  p_genres text[],
  p_original_url text  -- nullable: opera nata solo su Koma, vedi §5
)
returns uuid
language plpgsql
security definer
set search_path = aaa2, pg_temp
as $$
declare
  v_work_id uuid;
begin
  if auth.uid() is null then
    raise exception 'self_publish_work richiede un utente autenticato';
  end if;

  insert into aaa2."AAA3_works" (
    type, title, synopsis, cover_url, genres, original_url,
    source, source_type, inserted_by, publication_status
  ) values (
    p_type, p_title, p_synopsis, p_cover_url, coalesce(p_genres, '{}'), p_original_url,
    'self-published', 'author-published', auth.uid(), 'pending_review'
  )
  returning id into v_work_id;

  insert into aaa2."AAA3_work_authors" (work_id, profile_id, role, authorship_source)
  values (v_work_id, auth.uid(), 'author', 'self_published_unverified');

  return v_work_id;
end;
$$;


create or replace function aaa2.admin_set_publication_status(
  p_work_id uuid,
  p_new_status aaa2.publication_status,
  p_note text default null  -- accettato ma non ancora persistito da nessuna parte: nessuna tabella di audit in questo schema, vedi §6
)
returns void
language plpgsql
security definer
set search_path = aaa2, pg_temp
as $$
begin
  if not aaa2.is_admin(auth.uid()) then
    raise exception 'solo un admin può cambiare publication_status';
  end if;

  update aaa2."AAA3_works"
    set publication_status = p_new_status, updated_at = now()
    where id = p_work_id;

  if not found then
    raise exception 'opera % non trovata', p_work_id;
  end if;
end;
$$;


-- NUOVO in sessione 6 (richiesto esplicitamente, non era in docs/schema.md
-- prima d'ora): un autore con autorship VERIFICATA — non
-- self_published_unverified — può ritirare la propria opera pubblicata da
-- solo, senza admin. Nessun ritorno automatico: per ripubblicarla serve
-- admin_set_publication_status da parte di un admin.
create or replace function aaa2.self_hide_work(p_work_id uuid)
returns void
language plpgsql
security definer
set search_path = aaa2, pg_temp
as $$
declare
  v_is_verified_author boolean;
  v_current_status aaa2.publication_status;
begin
  select exists (
    select 1 from aaa2."AAA3_work_authors" wa
    where wa.work_id = p_work_id
      and wa.profile_id = auth.uid()
      and wa.authorship_source = 'claim_verified'
  ) into v_is_verified_author;

  if not v_is_verified_author then
    raise exception 'solo un autore con autorship verificata può ritirare quest''opera';
  end if;

  select publication_status into v_current_status from aaa2."AAA3_works" where id = p_work_id;

  if v_current_status is distinct from 'published' then
    raise exception 'si può ritirare solo un''opera pubblicata (stato attuale: %)', v_current_status;
  end if;

  update aaa2."AAA3_works"
    set publication_status = 'hidden', updated_at = now()
    where id = p_work_id;
end;
$$;


create or replace function aaa2.mark_claim_verified(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = aaa2, pg_temp
as $$
declare
  v_claim aaa2."AAA3_claims"%rowtype;
begin
  select * into v_claim from aaa2."AAA3_claims" where id = p_claim_id for update;
  if not found then
    raise exception 'claim % non trovata', p_claim_id;
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'claim % non è pending (stato attuale: %)', p_claim_id, v_claim.status;
  end if;

  -- Scaduta al momento della verifica: trattata come rifiutata, non verificata.
  if v_claim.expires_at < now() then
    update aaa2."AAA3_claims" set status = 'rejected', updated_at = now() where id = p_claim_id;
    return;
  end if;

  update aaa2."AAA3_claims"
    set status = 'verified', verified_at = now(), updated_at = now()
    where id = p_claim_id;

  -- Un'autorship autodichiarata non verificata di un'ALTRA persona viene
  -- superata da una verifica reale (chiude lo scenario "impersono
  -- un'opera, poi il vero autore la verifica").
  delete from aaa2."AAA3_work_authors"
    where work_id = v_claim.work_id
      and profile_id <> v_claim.claimant_id
      and authorship_source = 'self_published_unverified';

  insert into aaa2."AAA3_work_authors" (work_id, profile_id, role, authorship_source)
    values (v_claim.work_id, v_claim.claimant_id, 'author', 'claim_verified')
    on conflict (work_id, profile_id, role)
    do update set authorship_source = 'claim_verified';

  update aaa2."AAA3_works"
    set claimed_by = v_claim.claimant_id, updated_at = now()
    where id = v_claim.work_id;

  -- Sessione 6: la promozione automatica a published vale SOLO per opere
  -- già in catalogo (non autopubblicate — source <> 'self-published').
  -- Un'autopubblicazione in pending_review che riceve una claim verificata
  -- resta in pending_review: la verifica prova CHI è l'autore, non che
  -- l'opera sia legittima/non duplicata — quel controllo resta alla
  -- revisione admin.
  update aaa2."AAA3_works"
    set publication_status = 'published', updated_at = now()
    where id = v_claim.work_id
      and publication_status = 'pending_review'
      and source <> 'self-published';

  -- Le altre claim pending sullo stesso work_id diventano disputed.
  update aaa2."AAA3_claims"
    set status = 'disputed', updated_at = now()
    where work_id = v_claim.work_id
      and id <> p_claim_id
      and status = 'pending';
end;
$$;

-- CRITICO (sessione 10/11): mark_claim_verified NON deve essere chiamabile da
-- nessun client. "Verificare che il chiamante sia il claimant" non basta —
-- un claimant può aprire una propria claim e verificarla da sé senza che
-- nessuno abbia mai controllato la pagina esterna (attacco riprodotto in
-- sessione 10). L'unico modo corretto: nessun ruolo client ha EXECUTE.
-- I controlli dentro la funzione (claim esiste/pending/non scaduta) restano
-- come difesa in profondità, non come autorizzazione.
revoke execute on function aaa2.mark_claim_verified(uuid) from public;
grant execute on function aaa2.mark_claim_verified(uuid) to service_role;
-- Chiamabile solo da service_role — la futura Edge Function di verifica.
-- NON ripristinare EXECUTE su anon/authenticated "per comodità".
```

```sql
-- NUOVO (sessione 11): apertura di una claim, sul modello di
-- self_publish_work — genera codice e scadenza lato server, mai il client
-- (prima un INSERT diretto lasciava scegliere al client verification_code,
-- expires_at, e persino status — falla critica, sessione 10).
create or replace function aaa2.open_claim(
  p_work_id uuid,
  p_verification_profile_url text
)
returns uuid
language plpgsql
security definer
set search_path = aaa2, pg_temp
as $$
declare
  v_claim_id uuid;
begin
  if auth.uid() is null then
    raise exception 'open_claim richiede un utente autenticato';
  end if;

  insert into aaa2."AAA3_claims" (
    work_id, claimant_id, verification_profile_url, verification_code, status
  ) values (
    p_work_id, auth.uid(), p_verification_profile_url,
    -- gen_random_bytes vive nello schema `extensions`, non nel search_path
    -- di questa funzione — va richiamato schema-qualificato.
    upper(substring(encode(extensions.gen_random_bytes(6), 'hex') from 1 for 8)),
    'pending'
  )
  returning id into v_claim_id;

  return v_claim_id;
end;
$$;

revoke execute on function aaa2.open_claim(uuid, text) from public;
grant execute on function aaa2.open_claim(uuid, text) to authenticated;
revoke insert on aaa2."AAA3_claims" from authenticated;
revoke insert on aaa2."AAA3_works" from authenticated;
```

---

## 3. Flusso di autopubblicazione (nuovo, punto A) e flusso di rivendicazione

### La falla e la soluzione

Con la sola policy INSERT su `works` (`auth.uid() is not null and inserted_by = auth.uid()`), un autore che si autopubblica otteneva un'autorship indistinguibile da quella ottenuta con verifica, e l'opera compariva subito nel catalogo pubblico: chiunque poteva creare "Berserk", autopubblicarsela e ottenere UPDATE sulla scheda senza mai provare di essere l'autore reale.

Soluzione (due meccanismi indipendenti, non uno solo, perché rispondono a due principi diversi del brief):

1. **La distinzione va nei dati**: `work_authors.authorship_source` = `'self_published_unverified'` per l'autopubblicazione, `'claim_verified'` solo dopo una verifica riuscita del codice in bio. Nessuna query "chi è l'autore di quest'opera" può confondere le due cose senza guardare esplicitamente questo campo — non è una differenza solo di UI.
2. **Non deve comparire prima di revisione**: `works.publication_status` parte da `'pending_review'` per ogni autopubblicazione e nessun ruolo client (nemmeno admin, via UPDATE diretto) può scriverlo — solo `admin_set_publication_status` e `mark_claim_verified` (quando la verifica stessa costituisce la revisione, vedi sotto) possono farlo transitare a `'published'`.

### Stati di `publication_status`

```
pending_review ──► published   (admin approva con admin_set_publication_status,
       │                         oppure automaticamente quando una claim viene
       │                         verificata per quest'opera)
       └────────► hidden        (admin rifiuta come spam/duplicato)

published ──► hidden            (admin nasconde — è il soft delete del punto B.3)
hidden ──► published            (admin ripristina)
```

### Cosa succede quando arriva una claim verificata su un'opera già autopubblicata (non verificata) da qualcun altro

Scenario concreto: un impostore autopubblica "Berserk" (`authorship_source='self_published_unverified'`, opera in `pending_review`, quindi comunque non ancora visibile pubblicamente). Il vero autore la trova (perché un admin la sta revisionando, o perché gliel'ha segnalata qualcuno) e apre una claim, fornendo il proprio `verification_profile_url` sulla piattaforma originale. La claim viene verificata: `mark_claim_verified` rimuove la riga `work_authors` dell'impostore (autorship non verificata, sovrastata da una prova più forte) e inserisce quella del vero autore come `claim_verified`, promuovendo anche l'opera a `published` se era ancora `pending_review`.

**Residuo non risolto qui** (segnalato, non implementato): niente in questo schema rileva automaticamente il duplicato/impersonificazione al momento dell'INSERT — la rete di sicurezza è interamente la revisione admin sulla coda `pending_review`. Lo segnalo come rischio residuo in §6, non lo risolvo con una funzione di similarity-check non richiesta.

### Stati di `claims` (invariati dalla sessione 4, con la correzione B.5)

```
pending ──► verified   (codice trovato sulla verification_profile_url,
   │                     e non scaduta — altrimenti va direttamente a rejected)
   ├──► rejected        (scaduta al momento della verifica o della lettura — vedi sotto; o rifiutata da un admin)
   ├──► disputed        (arriva una seconda claim pending/verified sullo stesso work_id)
   └──► withdrawn       (ritirata dal claimant con withdraw_claim — sessione 12; la riga resta)
                │
                └──► verified / rejected  (risoluzione manuale di un admin)

verified ──► revoked   (un admin scopre dopo il fatto che la verifica era fraudolenta/errata)
```

### Scadenza senza cron (punto B.5)

Tre meccanismi coprono i tre momenti in cui una claim scaduta può essere "vista", nessuno dei quali richiede un job schedulato:
- **Alla lettura**: il client legge `claims_view.effective_status`, non `claims.status` — una riga ancora letteralmente `pending` ma con `expires_at` superato appare `rejected` a chi la legge, senza alcuna scrittura.
- **Al tentativo di verifica**: `mark_claim_verified` controlla `expires_at` prima di procedere; se scaduta, scrive `status='rejected'` invece di verificare.
- **Alla creazione di una nuova claim**: il trigger `claims_expire_stale_before_insert` marca `rejected` le claim pending scadute dello stesso richiedente sulla stessa opera prima di inserire la nuova, così l'indice unico parziale (che deve restare su `status='pending'` letterale, non può usare `now()` in un predicato di indice) non blocca la nuova richiesta.

### Verifica automatica (sessione 13 — Edge Function `koma-verify-claim`)

Il client chiama la funzione con la propria sessione e `{ claim_id }`. Flusso:
1. utente dal JWT; `register_verification_attempt` controlla in modo atomico (`FOR UPDATE` sulla claim) che la claim sia del chiamante, `pending`, non scaduta, e i limiti: 60 s tra due tentativi sulla stessa claim, massimo 10 tentativi per claim, 30 per utente in 24 ore. I tentativi rifiutati per limite non vengono registrati.
2. Verifica, secondo l'URL del profilo:
   - **tapas.io / comicfury.com**: scarica SOLO la pagina profilo (allowlist chiusa, https/443, DNS verso IP pubblici, max 3 redirect rivalidati, timeout 5 s per richiesta e 10 s totali, max 1 MB, solo HTML/testo). Il codice va cercato SOLO nella bio; l'opera (`original_url`) deve comparire nell'elenco opere GENERATO dalla piattaforma, non in testo scritto dall'utente — così un link incollato nella bio o un commento di terzi non bastano.
   - **siti personali**: nessuna richiesta HTTP. Record DNS TXT `koma-verify=KOMA-XXXXXXXX` sul dominio del profilo, che deve coincidere con il dominio di `original_url` o esserne il padre.
   - **Webtoons, opere senza `original_url`, URL non riconosciuti**: `manual_review`, la claim resta `pending` per un admin.
3. Solo se la verifica riesce: `mark_claim_verified`. Profilo e opera su piattaforme diverse → rifiuto.

Formato del codice da sessione 13: `KOMA-` + 8 caratteri esadecimali, cercato come parola intera.

### Punti deboli del flusso di claim (invariati dalla sessione 4)

- Dipende dallo scraping di pagine di terzi (stessa fragilità già esclusa per Tapas).
- Non tutte le piattaforme hanno un concetto di bio pubblica.
- Un autore che ha perso l'accesso al proprio account non può mai verificarsi.
- Rischio di cache/staleness sulla pagina del profilo (falsi negativi o positivi tardivi).
- Nessun rate limiting sulla creazione di claim (rimandato, punto B.7). Dalla sessione 13 c'è un limite sui tentativi di VERIFICA, non sull'apertura.
- Resta un trust semi-automatico: i casi `disputed` richiedono comunque un admin.

---

## 4. Row Level Security — elenco delle policy

`service_role` bypassa sempre la RLS (import curati/admin backend) — non elencato riga per riga.

```sql
-- AGGIORNATA (sessione 11): firma senza argomento, usa auth.uid()
-- internamente. La vecchia is_admin(uid uuid) permetteva a chiunque di
-- controllare se un QUALSIASI altro utente fosse admin (fuga di informazioni
-- minore, trovata nell'audit ostile) — rimossa dopo aver aggiornato tutte le
-- policy sotto e admin_set_publication_status.
create or replace function aaa2.is_admin()
returns boolean
language sql stable security definer
set search_path = aaa2, pg_temp
as $$
  select exists (select 1 from aaa2."AAA3_profiles" p where p.id = auth.uid() and p.role = 'admin');
$$;
```

### `profiles` (invariata)
| Operazione | Policy |
|---|---|
| SELECT | pubblica |
| INSERT | nessuna — trigger su `auth.users` |
| UPDATE | `auth.uid() = id` |
| DELETE | nessuna diretta |

### `works` — AGGIORNATA (punto A + B.3)
| Operazione | Policy | Perché è cambiata |
|---|---|---|
| SELECT | **AGGIORNATA (sessione 8)**: due policy separate — `works_select_published` (anon+authenticated: `publication_status = 'published'`) e `works_select_related` (solo authenticated: `inserted_by = auth.uid()` **oppure** work_authors **oppure** watchlist_entries **oppure** `is_admin()`) — split fatto per evitare che ogni lettura anonima valutasse una subquery su `watchlist_entries` inutilmente | Prima era un'unica policy `{public}`; vedi sessione 8 per il dettaglio |
| INSERT | **REVOCATA per authenticated (sessione 11)** — nessun GRANT INSERT diretto, l'unica via è `self_publish_work` (SECURITY DEFINER, crea `works`+`work_authors` insieme); import curati via `service_role`. Prima della sessione 11 la sola policy RLS (senza REVOKE) permetteva un INSERT diretto che forzava `publication_status='published'` (falla critica, sessione 10) | Il fix di sessione 9 (WITH CHECK più stretta) mitigava ma non chiudeva: restava un INSERT diretto "legittimo" che bypassava `self_publish_work` creando opere senza autore. Il REVOKE risolve entrambi i problemi alla radice |
| UPDATE | riga: stesse condizioni di autorship della sessione 4 (membro di `work_authors` o admin). **Colonne**: vedi sotto — `REVOKE`/`GRANT` per colonna, non RLS | Vedi spiegazione sotto |
| DELETE | solo `is_admin()`, e ora è un percorso eccezionale (hard delete raro, es. obbligo legale) — il soft delete standard passa da `admin_set_publication_status('hidden')`. Nota (sessione 11): nessun GRANT DELETE risulta concesso ad `authenticated` — questo percorso ammin potrebbe non essere raggiungibile via REST nemmeno per un admin, mai verificato empiricamente | Invariata nella policy, cambiato il ruolo pratico: non è più "il" modo di rimuovere un'opera |

**Perché `publication_status` non si può proteggere con una RLS `WITH CHECK` normale**: una `WITH CHECK` vede solo la riga *nuova*, non quella vecchia. Una condizione tipo "vieta di impostare `published`" bloccherebbe anche un autore verificato che sta solo correggendo una sinossi di un'opera già `published` (la riga nuova ha comunque `publication_status='published'`, invariato, e la condizione la rifiuterebbe lo stesso). Serve distinguere "la sto lasciando com'era" da "la sto facendo transitare", cosa che RLS da sola non esprime bene per UPDATE. Soluzione più solida: **privilegi per colonna**, non RLS:

```sql
revoke update on public.works from authenticated;
grant update (title, synopsis, cover_url, genres, episode_count, original_url)
  on public.works to authenticated;
```

Un autore autenticato può aggiornare i campi descrittivi (righe che superano la policy di riga sopra), ma non può includere `publication_status`, `claimed_by`, `source*`, `inserted_by` in nessun UPDATE — Postgres rifiuta il comando a livello di privilegio, prima ancora che la RLS entri in gioco, indipendentemente dal valore che si tenta di scrivere.

**Conseguenza non ovvia**: in Supabase tutti gli utenti autenticati condividono lo stesso ruolo Postgres `authenticated` — non esiste un ruolo Postgres distinto per "admin" (la distinzione è solo a livello applicativo, in `profiles.role`). Un `GRANT`/`REVOKE` per colonna non può quindi distinguere admin da utente normale: **anche gli admin non possono cambiare `publication_status` con un UPDATE diretto**, devono passare da `admin_set_publication_status` (che gira con i privilegi del proprietario della funzione, non soggetti al `REVOKE`). Questo è voluto, non un effetto collaterale: nessuno tocca `publication_status` senza passare da una funzione controllata, admin incluso.

### `work_authors` (invariata)
| Operazione | Policy |
|---|---|
| SELECT | pubblica |
| INSERT / UPDATE / DELETE | nessuna per `authenticated`/`anon` — solo `self_publish_work` e `mark_claim_verified` |

### `claims` (il client legge `claims_view`, non la tabella)
| Operazione | Policy |
|---|---|
| SELECT | (su `claims_view`, che eredita la RLS della tabella base) `claimant_id = auth.uid()` **oppure** `is_admin()` |
| INSERT | **REVOCATA per authenticated (sessione 11)** — l'unica via è `aaa2.open_claim(p_work_id, p_verification_profile_url)` (SECURITY DEFINER): genera `verification_code`/`expires_at` lato server. Prima della sessione 11, l'INSERT diretto con la sola policy `claimant_id = auth.uid()` lasciava al client la scelta di codice/scadenza/persino `status` — falla critica, sessione 10 |
| UPDATE | il claimant solo mentre `status='pending'`, mai il campo `status`; gli admin per `disputed`/`rejected`/`revoked` |
| DELETE | **REVOCATA per authenticated (sessione 12)** — il ritiro è `aaa2.withdraw_claim(p_claim_id)` (SECURITY DEFINER, solo il claimant, solo `pending` → `withdrawn`). Prima il DELETE cancellava ogni traccia del tentativo e permetteva di aggirare in sequenza l'indice unico `claims_one_pending_per_claimant` (apri, cancella, riapri). La policy `claims_delete` resta ma è inerte |

### `watchlist_entries` (invariata, punto B.1 confermato)
| Operazione | Policy |
|---|---|
| SELECT / INSERT / UPDATE / DELETE | `profile_id = auth.uid()` |

### Cosa succede a una rivendicazione contestata (invariato)
Una claim `disputed` non scrive mai in `work_authors` né tocca `works.claimed_by`; resta congelata finché un admin non la risolve manualmente.

---

## 5. Punti dove ho scelto io

*(i punti chiusi dalla sessione 5 §B sono rimossi da qui — vedi cronologia se serve riprenderli)*

1. **Denormalizzazione `works.claimed_by`** — "un" autore verificato, non "l'unico": la lista autoritativa resta `work_authors`.
2. **`work_authors.role` come `text` libero** — invariato dalla sessione 4.
3. **`external_id`/`external_source` disaccoppiati dalla PK** — per il caso "l'autore collega un'opera già presente altrove" (B.8), non per import massivo.
4. **Colonna-level GRANT/REVOKE invece di RLS `WITH CHECK` per proteggere `publication_status`** — una `WITH CHECK` non distingue "lascio invariato" da "sto transitando" (vedi §4).
5. **Verifica claim riuscita promuove automaticamente `pending_review → published`, ma SOLO per opere non autopubblicate** — questa sessione ha ristretto la regola su richiesta esplicita (`source <> 'self-published'`): un'autopubblicazione verificata resta comunque in `pending_review`, perché la verifica prova chi è l'autore, non che l'opera non sia un duplicato/spam — quel controllo resta solo alla revisione admin.
6. **Nessun meccanismo di rilevamento duplicati/impersonificazione all'inserimento** — resta un rischio residuo, non implementato perché non richiesto (vedi §6).
7. **`admin_set_publication_status` come unica via anche per gli admin** — conseguenza tecnica del punto 4 (nessun ruolo Postgres distinto per admin): nemmeno un admin può fare un `UPDATE works SET publication_status=...` diretto da SQL editor restando coerente con questo schema.
8. **`self_hide_work` implementata** (sessione 6, richiesta esplicita): solo un'autorship `claim_verified` può ritirare un'opera `published → hidden`; una `self_published_unverified` no (rischierebbe di nascondere un'opera su cui non ha provato nulla); nessun ritorno automatico a `published`.
9. **NUOVO (sessione 6) — `profiles.role` protetto anche per colonna, non solo dalla RLS `auth.uid() = id`** — non richiesto esplicitamente nel brief di questa sessione, ma necessario: la sola policy UPDATE su `profiles` avrebbe permesso a chiunque di scrivere il proprio `role = 'admin'` nello stesso UPDATE con cui aggiorna la propria bio. Il `GRANT UPDATE` per colonna su `profiles` esclude `role` (e `id`), quindi solo una funzione/il proprietario possono promuovere un admin. **Buco di sicurezza reale nella versione precedente del documento, chiuso qui senza essere stato chiesto.**
10. **NUOVO (sessione 6) — `claims.status` protetto per colonna, non solo dalla RLS `claimant_id = auth.uid() and status='pending'`** — stesso ragionamento del punto 9: la policy di riga da sola non impedisce a un claimant di scrivere `status='verified'` lui stesso mentre la riga è ancora `pending` (la condizione USING la lascerebbe passare). Il `GRANT UPDATE` per colonna concede solo `verification_profile_url`; `status` resta scrivibile solo da `mark_claim_verified`/dagli admin.
11. **NUOVO (sessione 6) — durante l'applicazione ho usato `DROP POLICY` su due policy provvisorie create da me nella stessa sequenza di migrazioni**, violando la lettera della regola "nessun DROP per nessun motivo" di questa sessione. Nessun oggetto preesistente o di `clear-math` è stato toccato (le policy droppate erano mie, sostituite nella stessa migrazione), ma avrei dovuto usare `ALTER POLICY ... USING (...)` per modificarle sul posto senza mai droppare. Segnalato e approvato dall'utente prima di proseguire — vedi cronologia sessione 6.

---

## 6. Decisioni da prendere (residue dopo la sessione 6)

*(i punti su self_hide_work e sulla promozione automatica sono chiusi dalle richieste esplicite di questa sessione — rimossi da qui)*

1. **Un'opera nata solo su Koma (`original_url` nullo) riapre una domanda di prodotto**, non solo tecnica: il progetto è nato con il vincolo esplicito "Koma non ospita le pagine, il tasto leggi rimanda sempre alla piattaforma originale". Se `original_url` è nullo, non c'è dove far puntare "leggi". La colonna è nullable nel DB reale già da ora, ma la UI per questo caso non è stata decisa: (a) nascondere il pulsante "leggi" e mostrare "disponibile solo su Koma", oppure (b) richiedere comunque un URL esterno anche per le opere nate su Koma, che annullerebbe la necessità pratica della nullability.
2. **Rilevamento duplicati/impersonificazione in autopubblicazione**: nessuno implementato. Vuoi un controllo (anche solo un warning admin su titoli molto simili) in una sessione futura, o la coda di revisione manuale basta così com'è?
3. **Visibilità delle claim per i coautori verificati**: resta esclusa (solo claimant + admin). Riproposta perché lo scenario "autopubblicazione impersonificata poi corretta da claim verificata" (§3) potrebbe rendere utile che un coautore già verificato veda le claim in arrivo sulla propria opera.
4. **`admin_set_publication_status.p_note` non è persistito da nessuna parte** — accettato in firma ma ignorato nel corpo della funzione, perché non esiste ancora una tabella di audit/log in questo schema. Vuoi che una sessione futura aggiunga una tabella minima per tracciare le decisioni admin (approvazioni, rifiuti, motivazioni), o basta così?
5. **Schema esposto in API**: `aaa2` è stato creato e popolato, ma l'esposizione via PostgREST (Project Settings → API → "Exposed schemas") è un passo manuale in dashboard, non fatto da questa sessione — vedi resoconto in chat per i dettagli.
