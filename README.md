# Koma

**Un motore di scoperta per webcomic e manga di autori indipendenti.**

*Koma* (コマ) è la vignetta di una tavola a fumetti. Il progetto parte da un problema concreto: chi pubblica da solo su Tapas, Webtoons Canvas o ComicFury è sommerso dai titoli più seguiti, e chi legge non ha un posto dove scoprirlo. Koma raccoglie queste opere in un catalogo curato, dà agli autori un modo per dimostrare che un'opera è davvero loro e manda il lettore a leggerla dove l'autore l'ha pubblicata. Koma non ospita le tavole: porta traffico all'originale.

> Progetto personale realizzato durante il mio percorso di riconversione professionale, dopo vent'anni nella ristorazione, con il corso Boolean *Web Developer + AI*.

**Demo:** non ancora online (vedi [Stato del progetto](#stato-del-progetto)).

---

## Cosa fa

**Per chi legge**
- Catalogo con ricerca per titolo, filtri per genere e tipo, paginazione. Tutto lo stato sta nell'URL, quindi una ricerca si condivide con un link.
- Scheda dell'opera con link diretto alla piattaforma originale.
- Watchlist privata con stato di lettura e progresso.
- Pagina autore che distingue le opere con autorship **verificata** da quelle solo **dichiarate**.

**Per chi crea**
- Autopubblicazione di un'opera, che entra nel catalogo solo dopo una revisione.
- **Rivendicazione** di un'opera già in catalogo: Koma genera un codice da inserire nella bio del proprio profilo su Tapas o ComicFury (o in un record DNS TXT del proprio sito) e lo verifica automaticamente.

**Per chi amministra**
- Coda di revisione delle opere (pubblica o rifiuta, con nota obbligatoria visibile all'autore).
- Risoluzione delle rivendicazioni contese, affiancate, e revisione manuale dove la verifica automatica non è possibile.
- Opere nascoste: chi le ha nascoste e perché, con la possibilità di ripubblicarle.

---

## Stack

| Livello | Tecnologie |
|---|---|
| Frontend | React 19, Vite, React Router 7, TanStack React Query 5, CSS Modules (nessuna libreria di componenti) |
| Backend | Supabase: Postgres con Row Level Security, Auth, Edge Functions (Deno) |
| AI | Claude Haiku 4.5 via API Anthropic, per le raccomandazioni (in sviluppo) |

---

## Le scelte tecniche che contano

### Un formato dati unico per tutte le fonti
Ogni fonte di opere (`src/api/`) restituisce lo stesso formato normalizzato, con una regola rigida: un valore mancante è `null`, mai `0` o una stringa vuota. "Zero episodi" e "numero di episodi sconosciuto" sono informazioni diverse, e l'interfaccia le mostra in modo diverso. Se per aggiungere una fonte bisognasse toccare componenti o pagine, il formato avrebbe un difetto.

### MangaDex: provato e scartato
MangaDex è stato integrato come prova del formato normalizzato, e il formato ha retto senza modifiche. Poi è stato tolto dal prodotto: è una piattaforma di redistribuzione di opere pubblicate altrove, incompatibile con l'obiettivo di portare visibilità e traffico agli autori originali. Il codice resta in `src/api/_archived/` come traccia della decisione.

### Sicurezza: revocare privilegi, non aggiungere controlli
Il modello di sicurezza sta nel database, non nell'interfaccia:
- **Ogni scrittura sensibile passa da una funzione `SECURITY DEFINER`.** Il client non può fare `INSERT` sulle opere né sulle rivendicazioni: deve chiamare la funzione, che decide stato, codice e scadenza.
- **Le colonne sensibili sono protette con `REVOKE` per colonna**: stato di pubblicazione, provenienza, ruolo dell'utente, stato delle rivendicazioni. È una protezione che non si vede leggendo solo le policy RLS, per questo è documentata in testa a [`docs/schema.md`](docs/schema.md).
- **La funzione che verifica una rivendicazione è eseguibile solo dal ruolo di servizio.** La chiama solo la Edge Function, che tiene la chiave lato server.

### Un audit ostile
A metà progetto ho fatto un audit da attaccante: scritture dirette sul database, non attraverso l'app, provando a fare ciò che l'interfaccia non permette. Ha trovato quattro difetti, tutti della stessa forma: una scrittura del client che sarebbe dovuta passare da una funzione. Il più grave permetteva a chiunque di autoverificarsi come autore di **qualsiasi** opera. Ogni difetto è stato chiuso togliendo un privilegio, non aggiungendo un controllo. Da allora ogni sessione verifica anche il percorso ostile, non solo quello previsto.

### Verificare un URL scelto dall'utente senza aprire la porta all'SSRF
La verifica delle rivendicazioni scarica una pagina indicata dall'utente: è un vettore SSRF classico. Le contromisure:
- solo domini in un elenco chiuso, rivalidato a ogni redirect;
- solo https sulla porta 443, e DNS che deve risolvere verso IP pubblici;
- timeout, dimensione massima della risposta, solo HTML;
- limite di tentativi per rivendicazione e per utente.

I siti personali **non vengono mai scaricati**: si verificano con un record DNS TXT. Il codice va cercato solo nella bio, e l'opera solo nell'elenco generato dalla piattaforma. Così un commento o un link incollato da altri non bastano a superare la verifica.

### La RLS che spegneva gli indici
Verificando con `EXPLAIN` su 20.000 righe sintetiche, ho scoperto che per gli utenti normali Postgres non usava mai gli indici GIN su generi e titolo. Con la RLS attiva, gli operatori non *leakproof* (`@>` sugli array, `@@` del full-text) non possono diventare condizioni di indice. La ricerca passa quindi da una funzione che applica esplicitamente la stessa regola di visibilità pubblica e poi usa gli indici.

### Design: «La tavola»
L'interfaccia è una pagina di fumetto: vignette con bordo d'inchiostro e angoli vivi, separate dal canalino. È in bianco e nero, con un solo colore d'accento, perché il colore lo portano le copertine. Le copertine mancanti diventano una vignetta di retino a mezzatinta. Tema chiaro e scuro, mobile first, contrasti verificati WCAG AA, navigazione completa da tastiera. I design token stanno in un unico file: [`src/styles/tokens.css`](src/styles/tokens.css).

---

## Come è stato sviluppato

Koma è stato sviluppato con **Claude Code**, una sessione per obiettivo, seguendo una scaletta di prompt ([`index-prompt.md`](index-prompt.md)) con regole permanenti ([`CLAUDE.md`](CLAUDE.md)): migrazioni una alla volta, stop e proposta prima di ogni decisione di architettura o sicurezza, resoconto a fine sessione di cosa è stato verificato e come (browser, REST, SQL).

Le sfide più istruttive sono state quelle in cui la cosa "ovvia" era sbagliata:
- una policy RLS scritta per un client che si comporta bene, invece che per uno ostile;
- un `CREATE OR REPLACE FUNCTION` che, cambiando i parametri, creava un secondo overload invece di sostituire la funzione;
- un ruolo di servizio a cui era stato riservato un permesso ma che non poteva raggiungere lo schema, quindi nessuno poteva verificare una rivendicazione.

---

## Avvio in locale

Requisiti: Node.js 20.19+ o 22.12+ (richiesto da Vite), pnpm e un progetto Supabase.

```bash
pnpm install
cp .env.example .env   # inserisci URL e chiave anon del tuo progetto Supabase
pnpm dev
```

`.env` contiene solo la chiave **anon** (pubblica per costruzione). La chiave di servizio non va mai nel frontend: la usano solo le Edge Functions, come variabile d'ambiente lato server.

Il catalogo legge lo schema `aaa2` descritto in [`docs/schema.md`](docs/schema.md).

La logica di verifica delle rivendicazioni ha test eseguibili con Node:

```bash
node --test supabase/functions/koma-verify-claim/verify.test.ts
```

---

## Stato del progetto

Funziona: catalogo, ricerca e filtri, schede, watchlist, autenticazione, autopubblicazione, rivendicazioni con verifica automatica, area admin, pagina autore, design system.

Dichiaro apertamente cosa **non** funziona ancora o ha dei limiti:
- **Demo online:** non ancora pubblicata.
- **Raccomandazioni AI:** in sviluppo. Database pronto, Edge Function e interfaccia in corso.
- **Migrazioni del database:** sono state applicate direttamente al progetto Supabase e non sono ancora versionate in questo repository. Lo schema è documentato in `docs/schema.md`, ma non si ricrea con un solo comando.
- **Verifica delle rivendicazioni:**
  - Webtoons (profili caricati via JavaScript) e le opere senza link originale passano dalla revisione manuale;
  - su Tapas la posizione della bio nell'HTML non è stata confermata su un profilo reale;
  - la verifica positiva completa non è stata ancora provata con un account reale.
- **Ricerca:** trova le parole che *iniziano* con quanto digitato e distingue gli accenti. Per fare di meglio servirebbero estensioni Postgres a livello di database condiviso.
- **Opere rifiutate:** l'autore non può ancora ripresentarle.
- **Dati di prova:** il database contiene ancora utenti e opere di test, da rimuovere prima della messa online.
- **Test automatici:** coprono solo la logica di verifica. Il resto è stato verificato a mano, nel browser e in SQL.
