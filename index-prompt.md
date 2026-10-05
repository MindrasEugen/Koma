# Koma — indice dei prompt di sviluppo

Motore di scoperta per webcomic e manga indipendenti. Stack: Vite + React,
React Router, React Query, Supabase (schema `aaa2` nel progetto
`cinema-vicino`). Sviluppo guidato da Claude Code, una sessione per prompt.

Come usare questo file: lancia i prompt nell'ordine, uno per sessione, e non
passare al successivo finché il resoconto non è stato letto e le domande
aperte chiuse. Ogni prompt dà per scontate le regole della sezione
"Regole comuni", che conviene copiare nel `CLAUDE.md` del progetto una volta
sola invece di ripeterle ogni volta.

---

## Regole comuni (da mettere nel CLAUDE.md di progetto)

```
# Koma — regole permanenti per ogni sessione

## Database
- Tutto ciò che riguarda Koma vive nello schema aaa2 del progetto Supabase
  cinema-vicino. Lo stesso progetto ospita clear-math in public: non creare,
  modificare o leggere nulla fuori da aaa2 (eccezione: il trigger
  on_auth_user_created su auth.users, già esistente).
- Nessun DROP su oggetti che non siano stati creati nella sessione corrente.
- Migrazioni applicate una per volta, riferendo l'esito di ciascuna.
- Se una migrazione fallisce a metà: FERMATI e riferisci, niente rollback
  creativi su un database condiviso.
- Cambiare la firma di una funzione richiede DROP della vecchia versione:
  CREATE OR REPLACE con parametri diversi crea un overload (errore PGRST203).

## Modello di sicurezza
- Principio: ogni scrittura sensibile passa da una funzione SECURITY DEFINER.
  Se non deve essere il client a scrivere qualcosa, si REVOCA il privilegio;
  non si aggiunge un controllo su chi chiama.
- Colonne protette da REVOKE per colonna (invisibili leggendo solo le policy
  RLS): works.publication_status e le colonne di provenienza, profiles.role,
  claims.status e colonne correlate. Non ripristinare questi privilegi.
- mark_claim_verified è eseguibile SOLO da service_role, di proposito.
- L'unica tabella con scrittura diretta completa dal client è
  watchlist_entries.
- Mai la service_role key nel frontend. Chiavi in .env, .env mai committato.

## Codice
- Formato normalizzato unico per tutte le fonti in src/api/. Se per una
  modifica devi toccare hook, componenti o pagine per adattarli a una fonte,
  FERMATI e riferisci: significa che il formato ha un difetto.
- Valori mancanti = null, mai 0 o stringa vuota. "Zero episodi" e "numero
  sconosciuto" sono informazioni diverse.
- Nessuna funzionalità non richiesta nel prompt.

## Resoconto di fine sessione
- Cosa hai fatto, cosa hai verificato e come (browser, REST, SQL).
- Ogni punto in cui hai dovuto decidere al posto mio.
- Cosa è rimasto aperto.
- Aggiorna docs/schema.md se lo schema è cambiato.
```

---

## Sessioni completate

| # | Contenuto | Esito |
|---|---|---|
| 1 | Scaffolding Vite + React, formato normalizzato, fonte mock | Tapas senza API pubblica → mock |
| 2 | Verifica React Query, ricognizione fonti | `retry` bloccato dal focus nel browser automatizzato; MangaDex non filtrabile per opere originali |
| 3 | `mangadexSource.js` come test del formato | Formato regge; poi archiviato |
| 4 | Progettazione schema (`docs/schema.md`) | 5 tabelle, flusso claim, RLS |
| 5 | Revisione schema, falla autopubblicazione | `publication_status`, `authorship_source`, REVOKE per colonna |
| 6 | Migrazioni su Supabase, schema `aaa2` | Deploy completo, `public` intatto |
| 7 | Test RLS + `komaSource.js` | 7/7 test, terza fonte senza attriti |
| 8 | Autenticazione e watchlist | Isolamento verificato a due utenti |
| 9 | Autopubblicazione, rivendicazione, rimozione MangaDex | Buco su `works_insert` chiuso |
| 10 | Audit ostile | 2 difetti critici, 2 minori |
| 11 | Chiusura difetti + passata sistematica | Tutti chiusi, overload rimosso |

---

## Sessione 12 — rifiniture del backend

```
# Sessione 12 — rifiniture emerse dall'audit

Tre correzioni piccole prima di passare alle funzionalità visibili.

1. Ritiro delle claim come cambio di stato, non come cancellazione.
   Oggi il claimant può fare DELETE della propria claim pending: così
   sparisce ogni traccia dei tentativi e l'indice unico che impedisce due
   claim contemporanee è aggirabile in sequenza (apri, cancella, riapri).
   - aggiungi il valore 'withdrawn' all'enum claim_status
   - crea withdraw_claim(p_claim_id) SECURITY DEFINER: solo il claimant, solo
     da pending a withdrawn
   - REVOKE DELETE su aaa2.claims da authenticated
   - adegua la UI (/le-mie-rivendicazioni)
   - verifica con un DELETE diretto che ora fallisca

2. Chi ha già autorship su un'opera non deve vedere il form di
   rivendicazione su quell'opera. È un bug di interfaccia, una condizione.

3. In docs/schema.md, in testa al file, una sezione "Da sapere prima di
   toccare lo schema" con: l'elenco delle colonne protette da REVOKE, la
   funzione eseguibile solo da service_role, la nota su CREATE OR REPLACE e
   gli overload. Chi legge solo le policy RLS deve trovare lì ciò che
   altrimenti non vedrebbe.

Resoconto: esito di ciascun punto e del test di DELETE diretto.
```

---

## Sessione 13 — verifica reale delle claim (Edge Function)

```
# Sessione 13 — Edge Function di verifica delle claim

Obiettivo: sostituire lo stub di "Verifica ora" con una verifica vera.

## Architettura (non negoziabile)
- Edge Function Supabase che il client chiama con la propria sessione.
- La funzione legge la claim, controlla che appartenga a chi chiama, che sia
  pending e non scaduta.
- Scarica verification_profile_url e cerca verification_code nel testo.
- Solo se trovato, chiama mark_claim_verified con la service_role key
  (variabile d'ambiente della funzione, mai nel frontend).

## Sicurezza — il punto critico di questa sessione
La funzione scarica un URL fornito dall'utente dal lato server. È un vettore
SSRF classico. Prima di scrivere il codice, riferiscimi come intendi:
- limitare i domini ammessi: allowlist delle piattaforme supportate
  (tapas.io, webtoons.com, comicfury.com / cfw.me, e i siti personali?
  — su questi ultimi proponi una soluzione e dimmi i rischi)
- impedire richieste verso IP privati, localhost, metadata endpoint
- porre limiti di timeout, dimensione della risposta e redirect
- limitare la frequenza di tentativi per claim e per utente
FERMATI dopo questa proposta e aspetta la mia approvazione.

## Dopo l'approvazione
- Implementa la funzione e collegala al pulsante.
- Messaggi d'errore utili all'utente ("codice non trovato nella pagina",
  "piattaforma non supportata", "claim scaduta") senza esporre dettagli
  interni.
- Testa con una pagina reale che controlli tu, con e senza il codice.
- Testa i rifiuti: URL non in allowlist, IP privato, claim altrui, claim
  scaduta.

## Resoconto
Esito di ogni test, e i limiti noti del meccanismo (cache delle pagine,
contenuti renderizzati via JavaScript non visibili a un fetch semplice).
```

---

## Sessione 14 — coda di revisione admin

```
# Sessione 14 — area admin

1. Rotta /admin accessibile solo se is_admin() è vero. La protezione vera
   resta nel database: la UI nascosta è solo comodità, verifica che un non
   admin che forza la rotta non ottenga dati.
2. Coda delle opere in pending_review: anteprima completa della scheda,
   azioni pubblica / rifiuta, con nota obbligatoria in caso di rifiuto.
   Tutto tramite admin_set_publication_status.
3. Coda delle claim disputed: le due claim in conflitto affiancate, con
   verification_profile_url e date. Azioni: verifica l'una, rifiuta l'altra.
   Serve una funzione admin dedicata, SECURITY DEFINER con controllo
   is_admin(): mark_claim_verified resta riservata a service_role.
4. Opere hidden: possibilità di ripubblicarle.
5. Lo stato di un'opera rifiutata deve essere visibile al suo autore su
   /le-mie-opere, con la nota. Proponi come rappresentarlo nello schema
   (nuovo stato? campo nota?) e FERMATI prima di migrare.

Test: Alice promossa admin per la sessione, riportata a user alla fine.
Resoconto con conferma del ripristino.
```

---

## Sessione 15 — direzione visiva e componenti base

```
# Sessione 15 — design: direzione e componenti

Fino a qui l'interfaccia è stata grezza di proposito. Ora diventa il
prodotto.

## Prima di scrivere CSS
Proponimi una direzione visiva in tre righe e una palette, con la
motivazione. Vincoli:
- Koma significa il riquadro della tavola di un fumetto: il riquadro, la
  griglia, il bordo netto sono il linguaggio naturale del progetto.
- Le copertine sono il contenuto: l'interfaccia deve farsi da parte.
- Pochi effetti ben fatti, niente decorazione gratuita.
- Tema chiaro e scuro fin dall'inizio.
- Mobile first: la maggior parte della scoperta avviene da telefono.
FERMATI e aspetta la mia scelta.

## Dopo l'approvazione
- Design token in un unico file CSS (colori, spaziature, tipografia, raggi).
- Componenti: card opera, griglia, scheda dettaglio, header, form, badge di
  stato, stati vuoti, stati di caricamento e d'errore.
- Gestione esplicita dei campi null (cover mancante, sinossi assente,
  episodi sconosciuti, pulsante "leggi" assente per le opere native).
- Accessibilità: contrasto, focus visibile, navigazione da tastiera, alt
  text delle copertine.
- Nessuna libreria di componenti: CSS modules o CSS semplice.

Resoconto con screenshot di catalogo, dettaglio e watchlist, mobile e desktop.
```

---

## Sessione 16 — scoperta: ricerca, filtri, pagine autore

```
# Sessione 16 — ricerca e scoperta

1. Ricerca per titolo (lato database, non filtraggio client).
2. Filtri per genere e tipo, usando l'indice GIN su genres. Verifica con
   EXPLAIN che l'indice venga davvero usato.
3. Paginazione (non caricare tutto il catalogo). Proponi offset o cursore,
   motivando.
4. Pagina autore: profilo pubblico, opere con autorship verificata. Le opere
   con authorship_source = 'self_published_unverified' vanno distinte
   visivamente da quelle verificate tramite claim.
5. Stato nell'URL (ricerca, filtri, pagina) così che una ricerca sia
   condivisibile con un link.
```

---

## Sessione 17 — raccomandazioni AI

```
# Sessione 17 — raccomandazioni

## Principio
Le raccomandazioni devono far scoprire opere che l'utente non avrebbe
trovato, non riproporre quelle popolari. Si ragiona sul contenuto (temi,
tono, ritmo narrativo), non su "chi ha letto X ha letto Y": sui titoli di
nicchia i dati di lettura non esistono.

## Prima di implementare, proponi e FERMATI:
- Serve un voto nella watchlist? Oggi non c'è. Proponi il campo e la scala.
- Da quali dati parte la raccomandazione: voti, generi, sinossi?
- Architettura: la chiamata al modello avviene in una Edge Function (chiave
  API mai nel frontend), i risultati vengono salvati in una tabella di cache
  in aaa2 con una scadenza, e ricalcolati solo quando la watchlist cambia.
- Controllo dei costi: limite per utente, cosa succede quando si supera.
- Il modello deve raccomandare SOLO opere presenti in aaa2.works con
  publication_status = 'published': come lo garantisci? (Suggerimento: passa
  i candidati al modello e fagli scegliere, non lasciargli inventare titoli.)

## Dopo l'approvazione
- Ogni raccomandazione mostra una motivazione di una riga, specifica
  ("stessi protagonisti ambigui e ritmo lento di X"), non generica.
- Stato vuoto per chi ha meno di N opere in watchlist, con invito a
  aggiungerne.
```

---

## Sessione 18 — sezione anime (AniList)

```
# Sessione 18 — sezione anime informativa

1. src/api/anilistSource.js via GraphQL, stesso formato normalizzato,
   type = 'anime'. Stessa regola di sempre: se devi toccare qualcosa fuori da
   src/api/, FERMATI.
2. Sezione separata nella navigazione, distinta dal catalogo indie: Koma è
   un progetto sugli autori indipendenti, gli anime sono un complemento.
3. Decisione da prendere, proponi e FERMATI: la watchlist richiede una riga
   in aaa2.works. Per salvare un anime, importiamo i metadati AniList in
   works al primo salvataggio (source 'anilist', external_id valorizzato,
   escluso dal catalogo indie)? Oppure la watchlist anime resta separata?
   Valuta anche i termini d'uso di AniList sul salvataggio dei dati.
4. Rispetta i rate limit AniList: cache con React Query, nessuna chiamata
   per singola card.
```

---

## Sessione 19 — messa online e portfolio

```
# Sessione 19 — deploy e presentazione

## Prima del deploy
- SMTP proprio al posto del mailer integrato di Supabase (condiviso con
  clear-math, limiti bassissimi). "Confirm email" riattivato.
- URL di redirect dell'autenticazione configurati per il dominio di
  produzione.
- retry di React Query: verifica che in produzione sia attivo.
- Utenti di test (Alice, Bruno) e dati di prova: elenco di cosa rimuovere,
  FERMATI e aspetta conferma.
- Credenziali di test fuori da qualunque file che finisca nel repository.

## Deploy
- Build statica Vite su hosting a scelta (proponimi le opzioni), variabili
  d'ambiente configurate lì, nessun segreto nel bundle: verifica cercando
  la service_role key nei file generati.
- Riscrittura delle rotte per il router lato client (altrimenti il refresh
  su /opera/... restituisce 404).

## README per il portfolio
- Il problema prima della tecnologia.
- Le scelte tecniche significative: formato normalizzato, MangaDex testato e
  poi scartato (e perché), modello di sicurezza basato su REVOKE e funzioni
  SECURITY DEFINER, audit ostile e cosa ha trovato.
- Screenshot, link alla demo, istruzioni di avvio locale con .env.example.
- Quello che non funziona ancora, dichiarato.
```

---

## Decisioni già prese (da non riaprire senza motivo)

- MangaDex fuori dal prodotto: piattaforma di redistribuzione, incompatibile
  con il posizionamento. Codice archiviato in `src/api/_archived/`.
- Nessuno scraping come fonte del catalogo: fonti primarie sono gli autori
  registrati e l'inserimento manuale curato.
- Koma non ospita le tavole. Per le opere senza `original_url` il pulsante
  "leggi" non compare.
- Watchlist privata. Ruoli solo `user` / `admin`. Soft delete, mai hard
  delete. Scadenza delle claim valutata al momento della lettura, senza cron.
- Qualità del catalogo prima del volume.
