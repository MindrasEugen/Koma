# Koma — regole permanenti per ogni sessione

## Database
- Tutto ciò che riguarda Koma vive nello schema aaa2 del progetto Supabase
  cinema-vicino. Lo stesso progetto ospita clear-math in public: non creare,
  modificare o leggere nulla fuori da aaa2 (eccezioni: il trigger
  on_auth_user_created su auth.users, già esistente; il bucket Storage
  privato "aaa3-previews" e le sue policy aaa3_previews_* su storage.objects,
  autorizzati in sessione 18 per le anteprime delle opere). Ogni nuova policy
  su storage.objects deve filtrare bucket_id = 'aaa3-previews' e non deve
  contenere cast che possano fallire: storage.objects è condivisa con le
  altre app del progetto.
- Tutte le tabelle (e viste) di Koma hanno il prefisso AAA3_ in MAIUSCOLO
  (es. "AAA3_works"; le esistenti rinominate in sessione 12), dentro lo
  schema aaa2. Ogni nuova tabella segue la stessa regola. Postgres porta in
  minuscolo i nomi non quotati: il nome va scritto SEMPRE tra virgolette
  doppie in SQL, policy, funzioni e indici (aaa2."AAA3_nome"), e con le
  maiuscole esatte nel client (supabase.from('AAA3_nome')).
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
  RLS): AAA3_works.publication_status e le colonne di provenienza,
  AAA3_profiles.role,
  AAA3_claims.status e colonne correlate. Non ripristinare questi privilegi.
- mark_claim_verified è eseguibile SOLO da service_role, di proposito.
- L'unica tabella con scrittura diretta completa dal client è
  AAA3_watchlist_entries.
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
