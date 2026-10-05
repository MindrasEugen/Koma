// Test della logica pura: `node --test supabase/functions/koma-verify-claim/`
// (Node esegue TypeScript con type stripping). Le pagine HTML sono ridotte
// alla struttura reale osservata su tapas.io e comicfury.com (ottobre 2026).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  planVerification,
  checkProfileHtml,
  containsCode,
  isPrivateIp,
  isFetchableUrl,
  parsePublicUrl,
  txtHasCode,
} from './verify.ts'

const CODE = 'KOMA-44EC1E07'

test('piattaforme: piano di verifica', () => {
  assert.deepEqual(planVerification('https://tapas.io/Mario_Rossi', 'https://tapas.io/series/vetro/info'), {
    kind: 'fetch', platform: 'tapas', profileUrl: 'https://tapas.io/Mario_Rossi', workSlug: 'vetro',
  })
  const cf = planVerification('https://comicfury.com/profile.php?username=Gage', 'https://gagecomics.thecomicseries.com/')
  assert.equal(cf.kind, 'fetch')
  assert.equal(cf.kind === 'fetch' && cf.workSlug, 'gagecomics')
  assert.equal(planVerification('https://comicfury.com/profile.php?username=Gage', 'https://comicfury.com/read/gagecomics/').kind, 'fetch')
  assert.equal(planVerification('https://comicfury.com/profile.php?username=Gage', 'https://gagecomics.cfw.me').kind, 'fetch')
})

test('piattaforme: rifiuti e revisione manuale', () => {
  const r = (p: string, o: string | null) => {
    const plan = planVerification(p, o)
    return plan.kind === 'result' ? plan.outcome : plan.kind
  }
  assert.equal(r('https://tapas.io/Mario', null), 'manual_review')
  assert.equal(r('https://www.webtoons.com/en/creator/abc', 'https://www.webtoons.com/en/canvas/x/list?title_no=1'), 'manual_review')
  assert.equal(r('https://tapas.io/Mario', 'https://comicfury.com/read/x'), 'work_link_not_found')
  assert.equal(r('https://tapas.io/series', 'https://tapas.io/series/x'), 'unsupported_platform')
  assert.equal(r('https://tapas.io/Mario', 'https://tapas.io/episode/123'), 'manual_review')
  // URL non accettabili come profilo
  assert.equal(r('http://127.0.0.1/admin', 'https://tapas.io/series/x'), 'unsupported_platform')
  assert.equal(r('https://169.254.169.254/latest/meta-data', 'https://tapas.io/series/x'), 'unsupported_platform')
  assert.equal(r('https://localhost/x', 'https://tapas.io/series/x'), 'unsupported_platform')
  assert.equal(r('https://user:pw@tapas.io/Mario', 'https://tapas.io/series/x'), 'unsupported_platform')
  assert.equal(r('https://tapas.io:8443/Mario', 'https://tapas.io/series/x'), 'unsupported_platform')
  assert.equal(r('file:///etc/passwd', 'https://tapas.io/series/x'), 'unsupported_platform')
  assert.equal(r('https://[::1]/x', 'https://tapas.io/series/x'), 'unsupported_platform')
  assert.equal(r('https://2130706433/x', 'https://tapas.io/series/x'), 'unsupported_platform')
})

test('siti personali: DNS solo su dominio dell\'opera o padre', () => {
  assert.deepEqual(planVerification('https://mariorossi.it/chi-sono', 'https://mariorossi.it/fumetto'), { kind: 'dns', host: 'mariorossi.it' })
  assert.deepEqual(planVerification('https://mariorossi.it', 'https://comic.mariorossi.it/'), { kind: 'dns', host: 'mariorossi.it' })
  const other = planVerification('https://attaccante.it', 'https://mariorossi.it/fumetto')
  assert.equal(other.kind === 'result' && other.outcome, 'work_link_not_found')
  // dominio che "finisce come" ma non è un sottodominio
  const tricky = planVerification('https://rossi.it', 'https://mariorossi.it/fumetto')
  assert.equal(tricky.kind === 'result' && tricky.outcome, 'work_link_not_found')
  const toPlatform = planVerification('https://mariorossi.it', 'https://tapas.io/series/x')
  assert.equal(toPlatform.kind === 'result' && toPlatform.outcome, 'work_link_not_found')
})

test('codice come parola intera', () => {
  assert.ok(containsCode(`<p>Ciao! ${CODE}</p>`, CODE))
  assert.ok(containsCode(`koma-44ec1e07`, CODE))
  assert.ok(!containsCode(`KOMA-44EC1E071`, CODE))
  assert.ok(!containsCode(`XKOMA-44EC1E07`, CODE))
  assert.ok(!containsCode(`44EC1E07`, CODE))
})

const tapasPage = (bio: string, series: string, extra = '') => `
<html><body>
  <div class="user-desc">
    <p class="author">Mario</p>
    ${bio}
    <p class="date">Joined Apr 2022</p>
    <ul class="stats"><li>1k</li></ul>
  </div>
  <ul><li class="item-thumb-wrap">
    <a href="/series/${series}" class="thumb-wrap rect js-fb-tracking">x</a>
  </li></ul>
  ${extra}
</body></html>`

test('tapas: verifica positiva e negativa', () => {
  assert.equal(checkProfileHtml('tapas', tapasPage(`<p>${CODE}</p>`, 'vetro'), CODE, 'vetro').outcome, 'verified')
  assert.equal(checkProfileHtml('tapas', tapasPage('<p>nessun codice</p>', 'vetro'), CODE, 'vetro').outcome, 'code_not_found')
  assert.equal(checkProfileHtml('tapas', tapasPage(`<p>${CODE}</p>`, 'altra-serie'), CODE, 'vetro').outcome, 'work_link_not_found')
})

test('tapas: codice fuori dalla bio (es. commento di terzi) non vale', () => {
  const html = tapasPage('<p>bio senza codice</p>', 'vetro', `<div class="comment">${CODE}</div>`)
  assert.equal(checkProfileHtml('tapas', html, CODE, 'vetro').outcome, 'code_not_found')
})

test('tapas: link all\'opera scritto nella bio non vale', () => {
  // Un attaccante incolla nella propria bio il link della serie altrui.
  const html = tapasPage(`<p>${CODE} https://tapas.io/series/vetro</p>`, 'mia-serie')
  assert.equal(checkProfileHtml('tapas', html, CODE, 'vetro').outcome, 'work_link_not_found')
})

test('struttura non riconosciuta = errore, non "codice assente"', () => {
  assert.equal(checkProfileHtml('tapas', '<html>nuovo layout</html>', CODE, 'x').outcome, 'error')
  assert.equal(checkProfileHtml('comicfury', '<html>nuovo layout</html>', CODE, 'x').outcome, 'error')
})

const cfPage = (about: string, comic: string) => `
<div class="profilecategory">
  <div class="pchead">About Me</div>
  <div class="pccontent">${about}</div>
</div>
<div class="profilecategory">
  <div class="pchead">Mario's Webcomics</div>
  <div class="profile-webcomic-prof-link"><a href="/comicprofile.php?url=${comic}">Webcomic Profile</a></div>
</div>
<div class="profilecategory"><div class="pchead">Stats</div></div>
<div class="postactions">${'<a href="/comicprofile.php?url=vetro">'} ${CODE}</div>`

test('comicfury: verifica e casi negativi', () => {
  assert.equal(checkProfileHtml('comicfury', cfPage(`Ciao ${CODE}`, 'vetro'), CODE, 'vetro').outcome, 'verified')
  assert.equal(checkProfileHtml('comicfury', cfPage('Ciao', 'vetro'), CODE, 'vetro').outcome, 'code_not_found')
  // il link a "vetro" e il codice compaiono solo FUORI dalle sezioni giuste
  assert.equal(checkProfileHtml('comicfury', cfPage(`Ciao ${CODE}`, 'altro'), CODE, 'vetro').outcome, 'work_link_not_found')
})

test('DNS TXT', () => {
  assert.ok(txtHasCode([['v=spf1 -all'], [`koma-verify=${CODE}`]], CODE))
  assert.ok(txtHasCode([['koma-verify=', CODE]], CODE)) // record spezzato in chunk
  assert.ok(!txtHasCode([[`koma-verify=${CODE}x`]], CODE))
  assert.ok(!txtHasCode([], CODE))
})

test('IP privati e riservati', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1',
    '::ffff:169.254.169.254', '64:ff9b::10.0.0.1', '2001:db8::1', 'garbage']) {
    assert.ok(isPrivateIp(ip), ip)
  }
  for (const ip of ['104.18.20.1', '8.8.8.8', '172.32.0.1', '2606:4700::6810:1', '::ffff:8.8.8.8']) {
    assert.ok(!isPrivateIp(ip), ip)
  }
})

test('URL scaricabili (anche dopo redirect)', () => {
  assert.ok(isFetchableUrl(new URL('https://tapas.io/Mario')))
  assert.ok(isFetchableUrl(new URL('https://comicfury.com/profile.php?username=x')))
  assert.ok(!isFetchableUrl(new URL('http://tapas.io/Mario')))
  assert.ok(!isFetchableUrl(new URL('https://tapas.io.evil.com/x')))
  assert.ok(!isFetchableUrl(new URL('https://evil.com/?tapas.io')))
  assert.ok(!isFetchableUrl(new URL('https://www.webtoons.com/x')))
  assert.ok(!isFetchableUrl(new URL('https://tapas.io:444/x')))
  assert.equal(parsePublicUrl('not a url'), null)
})
