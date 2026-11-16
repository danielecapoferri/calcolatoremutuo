(() => {
'use strict';
/* ============================================================
   CONFIG
   ============================================================ */
const CFG = {
  rrrMin: 20, rrrMax: 40, rrrDefault: 30,
  ltvStd: 0.80, soglia100: 5000,        // anticipo < 5.000€ → LTV 100%
  sogliaElevato: 10000,                 // "Usa tutto l'anticipo" se il prezzo sale di almeno 10k
  greenSconto: 0.2,                     // punti di tasso in meno per immobile green
  durataDefault: 30, tassoDefault: 3.5,
  phone: '06 40060565', phoneHref: 'tel:+390640060565', email: 'info.mutui@immobiliare.it',
  copyFeedbackMs: 2000,
};
const COMUNI = [
  { id: 'roma',   nome: 'Roma',   prov: 'RM', eurMq: 3300 },
  { id: 'milano', nome: 'Milano', prov: 'MI', eurMq: 5300 },
  { id: 'torino', nome: 'Torino', prov: 'TO', eurMq: 2000 },
];
const TIPI = [ [45,'Monolocale',1], [65,'Bilocale',2], [90,'Trilocale',3], [120,'Quadrilocale',4], [Infinity,'Plurilocale',5] ];

/* Spese accessorie — regole dell'info point */
function speseAccessorie(prezzo, mutuo, mesi) {
  return Math.min(mutuo * 0.0075, 4000)   // istruttoria
    + 350                                 // perizia
    + prezzo * 0.035                      // provvigione agenzia
    + 400                                 // polizza incendio e scoppio
    + mutuo * 0.0025                      // imposta sostitutiva
    + prezzo * 0.8 * 0.02                 // imposta di registro (2% del catastale ≈ 80% prezzo)
    + 50 + 50                             // ipotecaria + catastale
    + 2 * mesi                            // spese di incasso
    + 3000;                               // notaio
}
const r100 = v => Math.round(v / 100) * 100;
const f100 = v => Math.floor(v / 100) * 100;

function compute(inp, rrr, useAll) {
  const mesi = inp.durata * 12;
  const tan = Math.max(inp.tasso - (inp.green ? CFG.greenSconto : 0), 0.1);
  const i = tan / 100 / 12;
  const rata = inp.reddito * rrr / 100;
  const mutuo = r100(rata * (1 - Math.pow(1 + i, -mesi)) / i);   // valore attuale netto della rata
  const A = inp.anticipo || 0;
  const ltv100 = A < CFG.soglia100;
  let prezzo = ltv100 ? mutuo : r100(mutuo / CFG.ltvStd);
  let spese = r100(speseAccessorie(prezzo, mutuo, mesi));
  let anticipoCasa = prezzo - mutuo;
  let necessario = anticipoCasa + spese;
  let diff = A - necessario;
  let elevato = false, prezzoMax = prezzo;
  if (diff > 0 && !ltv100) {
    // prezzo P tale che (P - mutuo) + spese(P) = A  → le spese crescono col prezzo, si risolve per iterazione
    let p = prezzo;
    for (let k = 0; k < 30; k++) p = mutuo + A - speseAccessorie(p, mutuo, mesi);
    prezzoMax = p;
    elevato = (p - prezzo) >= CFG.sogliaElevato;
  }
  const used = !!(useAll && elevato);
  if (used) {
    // tutto l'anticipo viene usato: il residuo da arrotondamento (<200€) finisce nelle spese, così non avanza nulla
    prezzo = f100(prezzoMax);
    anticipoCasa = prezzo - mutuo;
    spese = A - anticipoCasa;
    necessario = A;
    diff = 0;
  }
  const ltv = prezzo > 0 ? Math.round(mutuo / prezzo * 100) : 0;
  return { mutuo, prezzo, spese, anticipoCasa, necessario, diff, ltv, ltv100, elevato, used, A, rrr };
}

/* ============================================================
   UTILS
   ============================================================ */
const $ = (s, el = document) => el.querySelector(s);
const IS_V2 = window.CALC_VARIANT === 'v2';
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = n => Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' }).replace(/\u00a0|\s/g, '.');
const fmtEur = n => fmt(n) + '€';
const parseIntIt = s => { const d = String(s || '').replace(/\D/g, ''); return d ? parseInt(d, 10) : null; };
const parseDec = s => { const t = String(s || '').replace(/\./g, '').replace(',', '.').trim(); return t === '' ? null : parseFloat(t); };
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const isTouch = () => matchMedia('(pointer: coarse)').matches;
const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
const ease = t => 1 - Math.pow(1 - t, 3);

function tween(el, to, { dur = 520, render = v => fmt(v), key = '_v' } = {}) {
  const from = el[key] ?? 0;
  el[key] = to;
  cancelAnimationFrame(el._raf);
  if (RM.matches || dur === 0 || from === to) { el.textContent = render(to); return; }
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = render(from + (to - from) * ease(p));
    if (p < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}
async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); return ok;
  }
}

/* ============================================================
   STATE
   ============================================================ */
const S = {
  durata: CFG.durataDefault, rrr: CFG.rrrDefault, unit: 'eur', useAll: false,
  applied: null, result: null, showErrors: false,
};
const els = {
  form: $('#form'), reddito: $('#reddito'), anticipo: $('#anticipo'), comune: $('#comune'), tasso: $('#tasso'), green: $('#green'),
  submit: $('#submitBtn'), grid: $('#grid'), output: $('#output'),
  big: $('#bigVal'), mutuoCard: $('#mutuoCard'), antCard: $('#antCard'), tipoCard: $('#tipoCard'), cta: $('#cta'),
};

/* ============================================================
   INPUTS — formattazione, clear, validazione
   ============================================================ */
function formatIntInput(input) {
  const raw = input.value;
  const caret = input.selectionStart ?? raw.length;
  const digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length;
  let d = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const out = d ? fmt(parseInt(d, 10)) : '';
  input.value = out;
  let pos = 0, seen = 0;
  while (pos < out.length && seen < digitsBefore) { if (/\d/.test(out[pos])) seen++; pos++; }
  try { input.setSelectionRange(pos, pos); } catch (e) {}
}
function formatDecInput(input) {
  let v = input.value.replace(/\./g, ',').replace(/[^\d,]/g, '');
  const parts = v.split(',');
  if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join('');
  const [a, b] = v.split(',');
  v = (a || '').slice(0, 2) + (b !== undefined ? ',' + b.slice(0, 2) : '');
  input.value = v;
}
function syncFilled(input) {
  const c = input.closest('.control');
  c.classList.toggle('filled', input.value.trim() !== '');
  const suf = c.querySelector('[data-suffix]');
  if (suf) suf.textContent = input.value.trim() ? '€/mese' : '/mese';
}
[els.reddito, els.anticipo].forEach(inp => inp.addEventListener('input', () => { formatIntInput(inp); onEdit(inp); }));
els.tasso.addEventListener('input', () => { formatDecInput(els.tasso); onEdit(els.tasso); });
$$('.clear').forEach(b => b.addEventListener('click', () => {
  const inp = b.closest('.control').querySelector('input');
  inp.value = ''; inp.focus(); if (inp === els.comune) { selectedComune = null; openAc(); } onEdit(inp);
}));
function onEdit(inp) { syncFilled(inp); if (S.showErrors) validate(false); markDirty(); }

function readInputs() {
  return {
    reddito: parseIntIt(els.reddito.value), anticipo: parseIntIt(els.anticipo.value),
    comune: selectedComune, tasso: parseDec(els.tasso.value), durata: S.durata, green: els.green.checked,
  };
}
const MSG = {
  reddito: v => v == null ? 'Inserisci il reddito mensile' : v < 500 ? 'Il reddito minimo deve essere di 500€' : v > 5e6 ? 'Il reddito non può superare 5.000.000€' : '',
  anticipo: v => v != null && v > 1e8 ? 'L’anticipo non può superare 100.000.000€' : '',
  comune: v => !v ? 'Inserisci un comune valido' : '',
  tasso: v => v == null || isNaN(v) ? 'Inserisci il tasso di interesse' : v < 1 ? 'Il tasso minimo deve essere 1%' : v > 10 ? 'Il tasso non può superare il 10%' : '',
};
function setErr(name, msg, shake) {
  const f = $(`.field[data-field="${name}"]`);
  const had = f.classList.contains('error');
  f.classList.toggle('error', !!msg);
  if (msg) f.querySelector('.err span').textContent = msg;
  f.querySelector('input').setAttribute('aria-invalid', msg ? 'true' : 'false');
  if (msg && shake && !RM.matches) { f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); }
  return !had && msg;
}
function validate(shake) {
  const v = readInputs();
  const errs = {};
  for (const k of Object.keys(MSG)) { const m = MSG[k](v[k]); setErr(k, m, shake); if (m) errs[k] = m; }
  return { ok: !Object.keys(errs).length, errs, v };
}

/* ---------- Comune autocomplete ---------- */
let selectedComune = null, acIdx = -1, acItems = [];
const acList = $('#acList');
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)/g, '').trim();
function openAc() {
  const q = norm(els.comune.value);
  acItems = COMUNI.filter(c => !q || norm(c.nome).startsWith(q) || norm(c.nome).includes(q));
  acIdx = acItems.length ? 0 : -1;
  acList.innerHTML = acItems.length
    ? acItems.map((c, i) => `<li role="option" id="ac-${c.id}" aria-selected="${i === acIdx}" data-id="${c.id}">${ICONS.pin24}${c.nome} (${c.prov})</li>`).join('')
    : `<li class="empty">Nessun comune trovato. Per ora puoi scegliere tra Roma, Milano e Torino.</li>`;
  acList.classList.add('open'); els.comune.setAttribute('aria-expanded', 'true');
}
function closeAc() { acList.classList.remove('open'); els.comune.setAttribute('aria-expanded', 'false'); }
function pickComune(c) {
  selectedComune = c; els.comune.value = `${c.nome} (${c.prov})`; closeAc(); onEdit(els.comune);
}
els.comune.addEventListener('focus', openAc);
els.comune.addEventListener('input', () => { selectedComune = null; openAc(); onEdit(els.comune); });
els.comune.addEventListener('keydown', e => {
  if (!acList.classList.contains('open') && (e.key === 'ArrowDown')) { openAc(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if (!acItems.length) return;
    acIdx = (acIdx + (e.key === 'ArrowDown' ? 1 : -1) + acItems.length) % acItems.length;
    $$('li', acList).forEach((li, i) => li.setAttribute('aria-selected', i === acIdx));
  } else if (e.key === 'Enter' && acList.classList.contains('open') && acIdx > -1 && !selectedComune) {
    e.preventDefault(); pickComune(acItems[acIdx]);
  } else if (e.key === 'Escape') closeAc();
});
els.comune.addEventListener('blur', () => setTimeout(() => {
  closeAc();
  if (!selectedComune) { const q = norm(els.comune.value); const m = COMUNI.find(c => norm(c.nome) === q); if (m) pickComune(m); }
}, 150));
acList.addEventListener('mousedown', e => { const li = e.target.closest('li[data-id]'); if (li) { e.preventDefault(); pickComune(COMUNI.find(c => c.id === li.dataset.id)); } });

/* ---------- Avanzato, durata, green ---------- */
const advToggle = $('#advToggle'), adv = $('#adv');
function setAdv(open) { adv.classList.toggle('open', open); advToggle.setAttribute('aria-expanded', open); }
advToggle.addEventListener('click', () => setAdv(!adv.classList.contains('open')));
const seg = $('#durata');
function setDurata(v, focus) {
  S.durata = v;
  $$('button', seg).forEach(b => { const on = +b.dataset.v === v; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
  markDirty();
}
seg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setDurata(+b.dataset.v); });
seg.addEventListener('keydown', e => {
  const vals = [10, 15, 20, 25, 30, 35, 40]; let i = vals.indexOf(S.durata);
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = Math.min(vals.length - 1, i + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = Math.max(0, i - 1); else return;
  e.preventDefault(); setDurata(vals[i], true);
});
els.green.addEventListener('change', markDirty);

/* ---------- Dirty / submit ---------- */
function inputsKey(v) { return JSON.stringify([v.reddito, v.anticipo, v.comune && v.comune.id, v.tasso, v.durata, v.green]); }
let wasDirty = false;
function markDirty() {
  if (!S.applied) return;
  const dirty = inputsKey(readInputs()) !== inputsKey(S.applied);
  if (dirty && !wasDirty) { els.submit.classList.remove('pulse'); void els.submit.offsetWidth; els.submit.classList.add('pulse'); }
  wasDirty = dirty;
}
els.form.addEventListener('submit', e => {
  e.preventDefault(); closeAc();
  S.showErrors = true;
  const { ok, errs, v } = validate(true);
  if (!ok) {
    if (errs.tasso && !adv.classList.contains('open')) setAdv(true);
    const first = ['reddito', 'anticipo', 'comune', 'tasso'].find(k => errs[k]);
    const inp = $(`.field[data-field="${first}"] input`);
    inp.focus({ preventScroll: true }); inp.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'center' });
    return;
  }
  runCalc(v, { scroll: true, autoOpen: true });
});

/* ============================================================
   CALCOLO + RENDER
   ============================================================ */
function runCalc(v, { scroll, autoOpen, fromShare } = {}) {
  const first = !S.applied;
  S.applied = { ...v }; wasDirty = false; els.submit.classList.remove('pulse');
  els.submit.textContent = 'Aggiorna';
  if (first) { S.useAll = false; }
  update({ anim: true, first });
  const r = S.result;
  if (autoOpen) {
    setAcc(els.antCard, r.diff < 0 || r.elevato);
    setAcc(els.mutuoCard, r.ltv100);
  }
  if (scroll) {
    // porta in vista i risultati: su desktop l'inizio della griglia, su mobile/tablet l'inizio dell'output
    setTimeout(() => {
      const target = window.innerWidth >= 1024 ? els.grid : $('.price-block');
      const y = Math.max(0, target.getBoundingClientRect().top + scrollY - 80);
      scrollTo({ top: y, behavior: RM.matches ? 'auto' : 'smooth' });
    }, first ? 60 : 0);
  }
  if (!fromShare) history.replaceState(null, '', shareUrl());
}

function update({ anim = false, first = false } = {}) {
  if (!S.applied) return;
  const r = S.result = compute(S.applied, S.rrr, S.useAll);
  if (S.useAll && !r.elevato) { S.useAll = false; }
  const out = els.output;
  out.classList.add('has-result');
  els.grid.classList.toggle('used-all', r.used);
  $('#unitSw').classList.remove('disabled');
  $('#rrr').classList.remove('disabled');
  $('#rrrThumb').tabIndex = 0;
  [els.mutuoCard, els.antCard].forEach(c => { c.classList.remove('disabled'); c.querySelector('.acc-head').disabled = false; });
  $$('.dash').forEach(d => d.classList.remove('dash'));
  if (first) { els.cta.classList.remove('swap-hide'); els.cta.classList.add('reveal'); }

  const dur = anim ? 650 : 0;
  // Prezzo / m²
  renderBig(r, dur);
  // Mutuo
  tween($('#mutuoVal'), r.mutuo, { dur, render: fmtEur });
  const ltvC = $('#ltvChip'); ltvC.textContent = r.ltv + '%';
  const rc = $('#rrrChip'); const rr = Math.round(S.rrr);
  rc.textContent = rr + '%'; rc.className = 'chip tnum ' + (S.rrr <= 30.05 ? 'ok' : S.rrr <= 35 ? 'warn' : 'bad');
  $('#ltv100Note').hidden = !r.ltv100;
  // Anticipo
  els.antCard.classList.toggle('is-neg', r.diff < 0);
  tween($('#antVal'), r.necessario, { dur, render: fmtEur });
  tween($('#speseVal'), r.spese, { dur, render: fmtEur });
  tween($('#acVal'), r.anticipoCasa, { dur, render: fmtEur });
  $('#acLabel').textContent = r.ltv100 ? 'Anticipo casa' : `Anticipo casa del ${100 - r.ltv}%`;
  const ab = $('#abar'); const tot = Math.max(1, r.necessario);
  ab.querySelector('.s').style.flexGrow = r.spese / tot;
  ab.querySelector('.c').style.flexGrow = r.anticipoCasa / tot;
  ab.classList.toggle('zero', r.anticipoCasa <= 0);
  ab.querySelector('.s').style.flexGrow = r.anticipoCasa > 0 ? r.spese / tot : 1;
  ab.querySelector('.c').style.flexGrow = r.anticipoCasa > 0 ? r.anticipoCasa / tot : 0;
  const neg = r.diff < 0;
  $('#scnNeg').hidden = !neg; $('#scnPos').hidden = neg;
  if (neg) tween($('#missVal'), -r.diff, { dur, render: fmtEur });
  else {
    tween($('#rimVal'), r.diff, { dur, render: fmtEur });
    const ua = $('#useAll'); ua.disabled = !r.elevato; ua.checked = r.used;
    $('#useAllRow').classList.toggle('on', r.elevato);
    $('#rimInfo').dataset.info = r.elevato ? 'rimanenteElevato' : 'rimanente';
  }
  $('#pcLabel').textContent = S.unit === 'mq' ? 'Metri quadri' : 'Prezzo casa';
  // m²
  renderUnitView(first);
  if (!dragging) placeThumb(S.rrr, anim);
}

function mqFrom(r) { const c = S.applied.comune; return Math.max(1, Math.round(r.prezzo / c.eurMq)); }
function renderBig(r, dur) {
  const big = els.big; big.classList.remove('empty');
  const num = big.querySelector('.num'), unit = big.querySelector('.unit');
  const isMq = S.unit === 'mq';
  const val = isMq ? mqFrom(r) : r.prezzo;
  unit.textContent = isMq ? 'm²' : '€';
  const len = fmt(val).length;
  big.classList.toggle('s1', len >= 10 && len < 13); big.classList.toggle('s2', len >= 13);
  if (num._unit !== S.unit) { num._v = 0; num._unit = S.unit; }
  tween(num, val, { dur, render: fmt });
}
function renderUnitView(first) {
  const isMq = S.unit === 'mq';
  const out = els.output;
  out.classList.toggle('is-mq', isMq);
  const showFin = !isMq;
  [els.mutuoCard, els.antCard].forEach(c => c.classList.toggle('swap-hide', !showFin));
  els.tipoCard.classList.toggle('swap-hide', !isMq);
  if (isMq && S.result) {
    const mq = mqFrom(S.result);
    const t = TIPI.find(x => mq <= x[0]);
    $('#tipoVal').textContent = IS_V2 && t[2] === 5 ? '5+ Locali' : t[1];
    $('#cittaVal').textContent = S.applied.comune.nome;
    $('#planIc').innerHTML = IS_V2 ? ICONS['tipo' + t[2]] : ICONS['loc' + t[2]];
  }
}

/* ---------- unit switch € / m² ---------- */
const unitSw = $('#unitSw');
unitSw.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !S.applied || S.unit === b.dataset.u) return;
  S.unit = b.dataset.u;
  $$('button', unitSw).forEach(x => x.setAttribute('aria-checked', x === b));
  unitSw.classList.toggle('is-mq', S.unit === 'mq');
  const fadeEls = S.unit === 'mq' ? [els.tipoCard] : [els.mutuoCard, els.antCard];
  update({ anim: true });
  fadeEls.forEach(el => { el.classList.remove('fade-in'); void el.offsetWidth; el.classList.add('fade-in'); });
  history.replaceState(null, '', shareUrl());
});

/* ---------- accordion ---------- */
function setAcc(card, open) {
  card.classList.toggle('open', open);
  card.querySelector('.acc-body').classList.toggle('open', open);
  card.querySelector('.acc-head').setAttribute('aria-expanded', open);
}
[els.mutuoCard, els.antCard].forEach(c => c.querySelector('.acc-head').addEventListener('click', () => setAcc(c, !c.classList.contains('open'))));

/* ---------- usa tutto l'anticipo ---------- */
$('#useAll').addEventListener('change', e => {
  S.useAll = e.target.checked;
  if (S.useAll) vibrate(10);
  update({ anim: true });
  history.replaceState(null, '', shareUrl());
});

/* ============================================================
   SLIDER RRR — corsa del pallino interna al track (come Figma),
   mappatura a tratti sulle zone colore, nessun aggancio magnetico
   ============================================================ */
const rrrEl = $('#rrr'), track = $('#rrrTrack'), thumb = $('#rrrThumb'), tip = $('#rrrTip');
const R_PTR = 20; // raggio del pointer: il centro corre da 20px a (larghezza − 20px)
function geo() {
  const W = track.clientWidth;
  const [z1, z2] = $$('.seg-z', track);
  const gap = parseFloat(getComputedStyle(track).columnGap) || 8;
  const b1 = z1.offsetWidth + gap / 2;                  // confine verde/arancio (30%)
  const b2 = z2.offsetLeft + z2.offsetWidth + gap / 2;   // confine arancio/rosso (35%)
  return [{ x0: R_PTR, x1: b1, v0: 20, v1: 30 }, { x0: b1, x1: b2, v0: 30, v1: 35 }, { x0: b2, x1: W - R_PTR, v0: 35, v1: 40 }];
}
const v2x = v => { const Z = geo(); const z = Z.find(z => v <= z.v1) || Z[2]; return z.x0 + (v - z.v0) / (z.v1 - z.v0) * (z.x1 - z.x0); };
const x2v = x => { const Z = geo(); x = Math.min(Z[2].x1, Math.max(Z[0].x0, x)); const z = Z.find(z => x <= z.x1) || Z[2]; return z.v0 + (x - z.x0) / (z.x1 - z.x0) * (z.v1 - z.v0); };
function placeThumb(v, anim) {
  rrrEl.classList.toggle('anim', !!anim && !RM.matches);
  thumb.style.left = (S.applied ? v2x(v) : R_PTR) + 'px';
  thumb.setAttribute('aria-valuenow', Math.round(v * 10) / 10);
  thumb.setAttribute('aria-valuetext', `Rata pari al ${Math.round(v)}% del reddito`);
  tip.textContent = `Rata ${Math.round(v)}% del reddito`;
  const x = S.applied ? v2x(v) : R_PTR, W = track.clientWidth;
  tip.classList.toggle('edge-l', x < 80); tip.classList.toggle('edge-r', x > W - 80);
}
let dragging = false, rafPending = false, grabOffset = 0, kbT;
const LIVE_SLIDER = window.CALC_VARIANT !== 'v2';
function setRrr(v) {
  v = Math.min(CFG.rrrMax, Math.max(CFG.rrrMin, v));
  if (Math.abs(v - S.rrr) < 1e-6) return;
  S.rrr = v;
  placeThumb(v, false);
  if (LIVE_SLIDER) {
    if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; update({ anim: false }); }); }
  } else if (!dragging) {
    // variante B: aggiorna i numeri solo quando ci si ferma (anche da tastiera)
    clearTimeout(kbT); kbT = setTimeout(() => update({ anim: true }), 280);
  }
}
const localX = e => e.clientX - track.getBoundingClientRect().left;
thumb.addEventListener('pointerdown', e => {
  if (!S.applied) return;
  e.preventDefault(); thumb.setPointerCapture(e.pointerId);
  grabOffset = localX(e) - v2x(S.rrr);   // nessun salto: il pallino resta sotto il dito
  dragging = true; rrrEl.classList.add('dragging'); rrrEl.classList.remove('anim'); thumb.focus({ preventScroll: true });
});
thumb.addEventListener('pointermove', e => { if (dragging) setRrr(x2v(localX(e) - grabOffset)); });
const endDrag = () => { if (!dragging) return; dragging = false; rrrEl.classList.remove('dragging'); if (!LIVE_SLIDER) update({ anim: true }); history.replaceState(null, '', shareUrl()); };
thumb.addEventListener('pointerup', endDrag); thumb.addEventListener('pointercancel', endDrag);
track.addEventListener('pointerdown', e => {
  if (!S.applied || e.target.closest('.thumb-rrr')) return;
  S.rrr = x2v(localX(e)); placeThumb(S.rrr, true); update({ anim: true }); history.replaceState(null, '', shareUrl());
});
thumb.addEventListener('keydown', e => {
  if (!S.applied) return;
  let v = S.rrr;
  switch (e.key) {
    case 'ArrowRight': case 'ArrowUp': v += 0.5; break;
    case 'ArrowLeft': case 'ArrowDown': v -= 0.5; break;
    case 'PageUp': v += 2.5; break;
    case 'PageDown': v -= 2.5; break;
    case 'Home': v = CFG.rrrMin; break;
    case 'End': v = CFG.rrrMax; break;
    default: return;
  }
  e.preventDefault(); setRrr(v); history.replaceState(null, '', shareUrl());
});

/* ============================================================
   INFO POINT / MODALI
   ============================================================ */
const INFO = {
  come: ['Come funziona', `<p>Ti stai chiedendo quanto mutuo puoi ottenere con il tuo stipendio? Sei nel posto giusto. Inserisci il tuo reddito mensile netto e quanto hai già messo da parte per l’anticipo e le spese di acquisto. Ti mostreremo una stima del mutuo che potresti ottenere e del prezzo della casa che puoi permetterti.</p>`],
  reddito: ['Reddito mensile netto', `<p>Inserisci il netto che ricevi ogni mese. Se percepisci la 13ª e/o la 14ª, puoi considerarle distribuendole sui 12 mesi. Se vuoi richiedere il mutuo insieme a un’altra persona, inserisci la somma dei redditi netti mensili di entrambi.</p><p>Ricorda: la presenza di eventuali finanziamenti (es. auto, prestiti, altri mutui, ecc.) abbassa l’importo di mutuo ottenibile.</p>`],
  tasso: ['Tasso di interesse', `<p>È il tasso di interesse (TAN) usato per calcolare l’importo di mutuo che potresti ottenere. Il calcolatore utilizza il miglior tasso fisso disponibile oggi tra le banche convenzionate con Immobiliare.it Mutui, scegliendo quello adatto a un immobile green o non green in base alla tua selezione.</p><p>Ricorda: più il tasso è alto, più basso sarà l’importo di mutuo che potresti ottenere.</p>`],
  green: ['Immobile Green ' + ICONS.leaf20, `<p>Attiva questa opzione se l’immobile che vuoi comprare ha una classe energetica A o B o sono previsti lavori di ristrutturazione per migliorarne l’efficienza energetica. Per i mutui green, i tassi applicati sono più bassi.</p>`],
  spese: ['Spese accessorie', `<p>È una stima di tutte le altre spese da sostenere (oltre al prezzo della casa) che non puoi coprire con il mutuo.</p><p>Il calcolatore considera un acquisto di prima casa e include:</p><ul><li>Spese di istruttoria (0,75% del mutuo, fino a 4.000 €)</li><li>Spese di perizia (stima 350 €)</li><li>Provvigione dell’agenzia (3,5% del prezzo della casa)</li><li>Polizza incendio e scoppio obbligatoria (stima 400 €)</li><li>Imposta sostitutiva (0,25% dell’importo di mutuo)</li><li>Imposta di registro (2% del valore catastale, stimato pari al 80% del prezzo dell’immobile)</li><li>Imposta ipotecaria e catastale (fisso 50€ ciascuna)</li><li>Spese di incasso (stima 2€ al mese)</li><li>Costi fissi del notaio per l’atto di mutuo e compravendita (stima 3.000 €)</li></ul><p>💡 Ricorda: è una stima. L’importo effettivo può variare in base all’immobile, alla banca, al notaio e all’agenzia immobiliare.</p>`],
  rrr: ['Rapporto rata reddito', `<p>È la percentuale del tuo reddito mensile destinata a coprire la rata del mutuo. Il calcolatore usa come valore predefinito il 30%, perché è la soglia che la maggior parte delle banche considera sostenibile per concedere un mutuo (alcune banche arrivano fino al 40%).</p><p>💡 Spostando lo slider puoi vedere come cambiano l’importo del mutuo, il prezzo della casa che puoi permetterti e l’anticipo necessario.</p>`],
  ltv: ['Percentuale di mutuo', `<p>È il rapporto tra l’importo di mutuo e il valore della casa, chiamato anche Loan to Value (LTV).</p><p>Con anticipo disponibile superiore a 5.000€, il calcolatore utilizza un LTV dell’80% perché è la soluzione più comune. La maggior parte delle banche, infatti, finanzia fino all’80% senza richiedere garanzie aggiuntive e offre tassi generalmente più convenienti.</p><p>Ricorda: con alcune banche, è possibile chiedere un mutuo superiore all’80%, ma i tassi applicati sono solitamente più alti.</p>`],
  rimanente: ['Anticipo rimanente', `<p>È l’anticipo che ti avanza rispetto a quello necessario per comprare la casa al prezzo calcolato, che si basa su un mutuo con LTV all’80% (lo standard applicato di default nel calcolatore).</p>`],
  rimanenteElevato: ['Anticipo rimanente', `<p>È l’anticipo che ti avanza rispetto a quello necessario per comprare la casa al prezzo calcolato, che si basa su un mutuo con LTV all’80% (lo standard applicato di default nel calcolatore).</p><p>Con il pulsante “Usa tutto l’anticipo” abbassi la quota coperta dal mutuo (LTV). Il prezzo della casa che puoi permetterti aumenta, di conseguenza, in base all’anticipo rimanente. Considera che per cifre basse l’aumento potrebbe essere minimo, non giustificando una diminuzione di LTV.</p>`],
  mancante: ['Anticipo mancante', `<p>L’importo di mutuo calcolato rientra nelle tue possibilità, in base a quanto guadagni al mese, ma ti servirebbe più anticipo per coprire tutti i costi relativi all’acquisto di casa al prezzo calcolato.</p><p>Questa è una stima. Prosegui per confrontare le soluzioni disponibili e trovare il mutuo più adatto a te.</p>`],
  mq: ['Metri quadri', `<p>È una stima dei metri quadri e della tipologia di immobile che puoi comprare con il prezzo casa calcolato, basata sui prezzi medi al metro quadro rilevati da Immobiliare.it per la tua città.</p><p>Il prezzo reale varia in base a zona, stato dell’immobile e altri dettagli.</p>`],
};
const overlay = $('#overlay'), sheet = $('#sheet');
let lastFocus = null;
function openSheet(title, html, cls = '') {
  lastFocus = document.activeElement;
  $('#sheetTitle').innerHTML = title; $('#sheetBody').innerHTML = html;
  sheet.className = 'sheet ' + cls; sheet.style.transform = '';
  overlay.classList.toggle('center', cls === 'share' || cls === 'app');
  overlay.setAttribute('aria-hidden', 'false'); overlay.classList.add('open'); document.body.classList.add('lock');
  setTimeout(() => (cls === 'share' ? $('#shareX') : cls === 'app' ? sheet : $('#sheetClose')).focus({ preventScroll: true }), 50);
}
function closeSheet() {
  overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true'); document.body.classList.remove('lock');
  sheet.style.transform = '';
  if (lastFocus) lastFocus.focus({ preventScroll: true });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-info]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const [t, h] = INFO[b.dataset.info]; openSheet(t, h);
});
$('#sheetClose').addEventListener('click', closeSheet);
overlay.addEventListener('click', e => { if (e.target === overlay) closeSheet(); });
document.addEventListener('keydown', e => {
  if (!overlay.classList.contains('open')) return;
  if (e.key === 'Escape') closeSheet();
  if (e.key === 'Tab') {
    const f = $$('button, a[href], input, textarea', sheet).filter(x => !x.disabled && x.offsetParent);
    if (!f.length) return; const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
});


/* ============================================================
   CONDIVIDI
   ============================================================ */
function shareUrl() {
  const base = location.origin + location.pathname;
  if (!S.applied) return base;
  const a = S.applied, p = new URLSearchParams();
  p.set('reddito', a.reddito); if (a.anticipo) p.set('anticipo', a.anticipo);
  p.set('comune', a.comune.id); p.set('durata', a.durata); p.set('tasso', String(a.tasso));
  if (a.green) p.set('green', '1');
  if (Math.abs(S.rrr - 30) > 0.01) p.set('rrr', Math.round(S.rrr * 10) / 10);
  if (S.useAll) p.set('tutto', '1');
  if (S.unit === 'mq') p.set('vista', 'mq');
  return base + '?' + p.toString();
}
$('#shareBtn').addEventListener('click', async () => {
  const url = shareUrl();
  const text = 'Ecco quanto mutuo potrei richiedere: guarda la simulazione su Immobiliare.it Mutui';
  if (isTouch() && navigator.share) {
    try { await navigator.share({ title: 'Calcolatore mutuo · Immobiliare.it Mutui', text, url }); } catch (e) {}
    return;
  }
  const enc = encodeURIComponent;
  openSheet('Condividi risultati', `<button type="button" class="share-x" id="shareX" aria-label="Chiudi">${ICONS.close24}</button>
    <div class="share-body">
      <div class="share-content">
        <div class="share-copy"><h2>Condividi risultati</h2><p>Copia il link per condividere i risultati con chi vuoi</p></div>
        <div class="urlbox"><input readonly value="${url.replace(/"/g, '&quot;')}" aria-label="Link dei risultati" onfocus="this.select()"></div>
      </div>
      <div class="share-acts">
        <a href="https://wa.me/?text=${enc(text + ' ' + url)}" target="_blank" rel="noopener"><span class="ic">${ICONS.shWa}</span>Whatsapp</a>
        <a href="mailto:?subject=${enc('Il mio calcolo mutuo')}&body=${enc(text + '\n' + url)}"><span class="ic">${ICONS.mail}</span>Email</a>
        <button type="button" id="copyLink"><span class="ic">${ICONS.shLink}</span><span class="lb">Copia Link</span></button>
      </div>
    </div>`, 'share');
  $('#shareX').addEventListener('click', closeSheet);
  $('#copyLink').addEventListener('click', async e => {
    const b = e.currentTarget; await copyText(url);
    b.querySelector('.lb').textContent = 'Copiato';
    setTimeout(() => { b.querySelector('.lb').textContent = 'Copia Link'; }, CFG.copyFeedbackMs);
  });
});
function loadFromUrl() {
  const p = new URLSearchParams(location.search);
  if (!p.has('reddito')) return false;
  const c = COMUNI.find(x => x.id === p.get('comune'));
  els.reddito.value = fmt(+p.get('reddito') || 0);
  if (p.get('anticipo')) els.anticipo.value = fmt(+p.get('anticipo'));
  if (c) pickComune(c);
  const d = +p.get('durata'); if ([10, 15, 20, 25, 30, 35, 40].includes(d)) setDurata(d);
  if (p.get('tasso')) els.tasso.value = String(p.get('tasso')).replace('.', ',');
  els.green.checked = p.get('green') === '1';
  if (p.get('rrr')) S.rrr = Math.min(CFG.rrrMax, Math.max(CFG.rrrMin, +p.get('rrr')));
  S.useAll = p.get('tutto') === '1';
  if (p.get('vista') === 'mq') { S.unit = 'mq'; $$('button', unitSw).forEach(x => x.setAttribute('aria-checked', x.dataset.u === 'mq')); unitSw.classList.add('is-mq'); }
  [els.reddito, els.anticipo, els.tasso].forEach(syncFilled);
  if (d !== CFG.durataDefault || els.green.checked || (p.get('tasso') && +p.get('tasso') !== CFG.tassoDefault)) setAdv(true);
  const { ok, v } = validate(false);
  if (!ok) { S.showErrors = true; return true; }
  const keepUse = S.useAll;
  S.applied = { ...v }; S.useAll = keepUse; wasDirty = false;
  els.submit.textContent = 'Aggiorna';
  update({ anim: true, first: true });
  setAcc(els.antCard, S.result.diff < 0 || S.result.elevato);
  setAcc(els.mutuoCard, S.result.ltv100);
  return true;
}

/* ============================================================
   FEEDBACK
   ============================================================ */
const fbText = $('#fbText');
$$('.fb-btn').forEach(b => b.addEventListener('click', () => {
  $('#fbTitle').textContent = b.dataset.fb === 'si' ? 'Cosa ti è piaciuto?' : 'Qualcosa è andato storto?';
  $('#fbQ').hidden = true; $('#fbF').hidden = false;
  setTimeout(() => fbText.focus({ preventScroll: true }), 50);
}));
$('#fbSend').addEventListener('click', () => {
  $('#fbF').hidden = true; $('#fbE').hidden = false;
  // il ringraziamento resta qualche secondo, poi il blocco si chiude (ricompare al ricaricamento)
  setTimeout(() => { const w = $('#fbWrap'); w.classList.add('gone'); setTimeout(() => w.remove(), 600); }, 2500);
});

/* ============================================================
   FAQ
   ============================================================ */
const FAQ = [
  ['Quanto posso chiedere di mutuo con il mio stipendio?', `<p>In generale, le banche considerano sostenibile una rata che non supera il 30-35% del reddito (alcune arrivano fino al 40%).</p><p>Ad esempio:</p><ul><li>Con 1.400 € di stipendio → rata sostenibile di 420-490 € al mese</li><li>Con 1.600 € di stipendio → rata sostenibile di 480-560 € al mese</li><li>Con 1.800 € di stipendio → rata sostenibile di 540-630 € al mese</li></ul><p>Da questa rata si calcola poi l’importo massimo del mutuo che la banca potrebbe concedere.</p><p>Con il calcolatore ti basta inserire il tuo reddito netto per ottenere una stima del mutuo che potresti richiedere, del prezzo della casa che puoi permetterti e dell’anticipo necessario.</p>`],
  ['Posso usare il calcolatore anche se non ho ancora trovato casa?', `<p>Sì. Ti aiuta a capire quale fascia di prezzo puoi permetterti prima di iniziare la ricerca dell’immobile.</p>`],
  ['Posso richiedere un mutuo da solo o serve un cointestatario?', `<p>Puoi richiedere un mutuo anche da solo. Se però il tuo reddito non è sufficiente, aggiungere un cointestatario può aumentare l’importo che la banca è disposta a concederti.</p>`],
  ['Il calcolatore mi dice se posso ottenere un mutuo?', `<p>No. Il risultato del calcolatore è una stima basata sui dati che hai inserito e sui criteri generalmente utilizzati dalle banche. L’approvazione del mutuo dipende sempre dalla valutazione della banca.</p><p>Con Immobiliare.it Mutui puoi scoprire gratuitamente quanto potresti ottenere di mutuo e richiedere una predelibera con una delle nostre banche convenzionate. In questo modo saprai qual è il tuo budget prima di cercare casa e potrai affrontare la ricerca con maggiore serenità.</p>`],
  ['Quanto anticipo serve per comprare casa con un mutuo?', `<p>Nella maggior parte dei casi, le banche concedono mutui fino all’80% del valore della casa. Questo significa che dovrai avere a disposizione almeno il 20% del prezzo come anticipo.</p><p>Oltre all’anticipo, considera anche le spese di acquisto (notaio, imposte, perizia e agenzia immobiliare), che non sono coperte dal mutuo e possono incidere per un ulteriore 5-10% del prezzo della casa.</p><p>In alcuni casi è possibile ottenere un mutuo fino al 100%, ma è una soluzione disponibile solo presso alcune banche e in presenza di specifici requisiti.</p>`],
  ['Quali sono tutte le spese accessorie "nascoste" quando si compra casa?', `<p>Oltre al prezzo della casa, devi mettere in conto anche le spese di acquisto, che in genere incidono per un ulteriore 5-10% del prezzo dell’immobile. Le principali sono:</p><ul><li>Spese di istruttoria, costo della banca necessaria per gestire la pratica</li><li>Perizia immobiliare, per coprire la valutazione del perito incaricato dalla banca</li><li>Imposta sostitutiva (0,25% del mutuo per la prima casa)</li><li>Imposte di registro (2% sul valore catastale se acquisti da privato)</li><li>Notaio, compreso di compravendita e contratto di mutuo (varia in base al valore dell’immobile)</li><li>Polizza incendio e scoppio, obbligatoria per legge</li><li>Polizza vita, facoltativa ma suggerita dalle banche come garanzia aggiuntiva</li></ul>`],
  ['Quali fattori influenzano l\'importo di mutuo che posso ottenere?', `<p>L’importo del mutuo dipende da diversi fattori, tra cui:</p><ul><li>Il tuo reddito mensile e la rata che puoi sostenere</li><li>La tipologia di contratto di lavoro che hai</li><li>La presenza di altri finanziamenti</li><li>La tua età</li><li>La durata del mutuo e il tasso applicato</li><li>L’anticipo che hai a disposizione</li><li>Il valore dell’immobile e la sua classe energetica</li></ul><p>Con il calcolatore puoi modificare durata, anticipo e altri parametri per vedere come cambia la stima del mutuo che potresti ottenere. Per conoscere con precisione quanto puoi richiedere richiedi una consulenza gratuita con un nostro esperto.</p>`],
];
$('#faqList').innerHTML = FAQ.map(([q, a], i) => `
  <div class="faq-item">
    <button type="button" class="faq-q" aria-expanded="false" aria-controls="faq-${i}">${q}${ICONS.chevDownFaq}</button>
    <div class="collapse faq-a" id="faq-${i}"><div class="inner"><div class="txt">${a}</div></div></div>
  </div>`).join('');
$('#faqList').addEventListener('click', e => {
  const q = e.target.closest('.faq-q'); if (!q) return;
  const it = q.parentElement, open = !it.classList.contains('open');
  $$('.faq-item.open').forEach(o => { if (o !== it) { o.classList.remove('open'); o.querySelector('.faq-a').classList.remove('open'); o.querySelector('.faq-q').setAttribute('aria-expanded', 'false'); } });
  it.classList.toggle('open', open); it.querySelector('.faq-a').classList.toggle('open', open); q.setAttribute('aria-expanded', open);
});

/* ============================================================
   CONTATTI
   ============================================================ */
let mailT;
$('#copyMail').addEventListener('click', async e => {
  const b = e.currentTarget, lbl = b.querySelector('.lbl');
  await copyText(CFG.email);
  clearTimeout(mailT);
  lbl.classList.add('swap');
  setTimeout(() => { lbl.innerHTML = '<span>Indirizzo copiato</span>'; b.classList.add('copied'); lbl.classList.remove('swap'); }, 160);
  mailT = setTimeout(() => {
    lbl.classList.add('swap');
    setTimeout(() => { lbl.innerHTML = ICONS.mail + '<span>Copia indirizzo</span>'; b.classList.remove('copied'); lbl.classList.remove('swap'); }, 160);
  }, CFG.copyFeedbackMs);
});
// Scarica l'app: su mobile apre lo store, da 768px in su apre la modale con QR
(() => {
  const STORE = { ios: 'https://apps.apple.com/it/app/immobiliare-it-mutui/id1604084002', android: 'https://play.google.com/store/apps/details?id=it.mutuiamo.app' };
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const a = $('#appLink');
  if (isIOS) a.href = STORE.ios; else if (isAndroid) a.href = STORE.android;
  a.addEventListener('click', e => {
    if (window.innerWidth < 768) return;            // mobile: link diretto allo store
    e.preventDefault();
    openSheet('Scarica l’app', `<div class="app-modal">
        <div class="app-copy"><span class="app-ic">${ICONS.appIcon}</span><h2>Scarica l'app</h2><p>Inquadra il codice QR per scaricare l’app gratuita</p></div>
        ${ICONS.qr}
      </div>`, 'app');
  });
})();

/* variante B: nuova card "Stima tipo immobile" */
if (IS_V2) {
  const tc = $('#tipoCard');
  tc.className = 'card tipo v2 swap-hide';
  tc.innerHTML = `<div class="t2-text">
      <div class="t2-blk"><p class="t2-k"><span class="lbl-m">Tipo immobile</span><span class="lbl-d">Stima tipo immobile</span></p><p class="t2-v" id="tipoVal">-</p></div>
      <div class="t2-blk"><p class="t2-k"><span class="lbl-m">Città</span><span class="lbl-d">Città immobile</span></p><p class="t2-v" id="cittaVal">-</p></div>
    </div><span class="t2-img" id="planIc" aria-hidden="true"></span>`;
}

/* ============================================================
   INIT
   ============================================================ */
els.tasso.value = String(CFG.tassoDefault).replace('.', ',');
syncFilled(els.tasso);
setDurata(CFG.durataDefault);
placeThumb(S.rrr, false);
document.fonts && document.fonts.ready.then(() => placeThumb(S.rrr, false));
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => placeThumb(S.rrr, false), 60); });
loadFromUrl();
window.__calc = { compute, CFG, S }; // utile per debug in console
})();
