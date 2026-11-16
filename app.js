(() => {
'use strict';
/* ============================================================
   CONFIG
   ============================================================ */
const CFG = {
  rrrMin: 25, rrrMax: 40, rrrDefault: 30, snaps: [30, 33, 40],
  zones: [0.57, 0.215, 0.215],          // proporzioni visive verde/arancio/rosso (dal Figma)
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
    prezzo = f100(prezzoMax);
    spese = r100(speseAccessorie(prezzo, mutuo, mesi));
    anticipoCasa = prezzo - mutuo;
    necessario = anticipoCasa + spese;
    diff = Math.max(0, A - necessario);
  }
  const ltv = prezzo > 0 ? Math.round(mutuo / prezzo * 100) : 0;
  return { mutuo, prezzo, spese, anticipoCasa, necessario, diff, ltv, ltv100, elevato, used, A, rrr };
}

/* ============================================================
   UTILS
   ============================================================ */
const $ = (s, el = document) => el.querySelector(s);
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
function setAdv(open) { adv.classList.toggle('open', open); advToggle.setAttribute('aria-expanded', open); if (open) requestAnimationFrame(posSegThumb); }
advToggle.addEventListener('click', () => setAdv(!adv.classList.contains('open')));
const seg = $('#durata');
function posSegThumb() {
  const b = seg.querySelector(`[data-v="${S.durata}"]`); const th = seg.querySelector('.thumb');
  if (!b || !b.offsetWidth) return;
  th.style.width = b.offsetWidth + 'px'; th.style.transform = `translateX(${b.offsetLeft}px)`;
}
function setDurata(v, focus) {
  S.durata = v;
  $$('button', seg).forEach(b => { const on = +b.dataset.v === v; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
  posSegThumb(); markDirty();
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
  if (scroll && window.innerWidth < 1024) {
    setTimeout(() => {
      const y = $('.price-block').getBoundingClientRect().top + scrollY - 72;
      scrollTo({ top: y, behavior: RM.matches ? 'auto' : 'smooth' });
    }, first ? 120 : 0);
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
  ab.querySelector('.c').style.display = r.anticipoCasa > 0 ? '' : 'none';
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
    $('#tipoVal').textContent = t[1];
    $('#cittaVal').textContent = S.applied.comune.nome;
    $('#planIc').innerHTML = ICONS['loc' + t[2]];
  }
}

/* ---------- unit switch € / m² ---------- */
const unitSw = $('#unitSw');
function posUnitThumb() {
  const b = unitSw.querySelector(`[data-u="${S.unit}"]`), th = unitSw.querySelector('.thumb');
  th.style.width = b.offsetWidth + 'px'; th.style.transform = `translateX(${b.offsetLeft}px)`;
}
unitSw.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !S.applied || S.unit === b.dataset.u) return;
  S.unit = b.dataset.u;
  $$('button', unitSw).forEach(x => x.setAttribute('aria-checked', x === b));
  posUnitThumb();
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
   SLIDER RRR — piecewise sulle zone colore + snap magnetico
   ============================================================ */
const rrrEl = $('#rrr'), track = $('#rrrTrack'), thumb = $('#rrrThumb'), tip = $('#rrrTip');
const [G, O] = CFG.zones;
const Z = [{ f0: 0, f1: G, v0: 25, v1: 30 }, { f0: G, f1: G + O, v0: 30, v1: 35 }, { f0: G + O, f1: 1, v0: 35, v1: 40 }];
const v2f = v => { const z = Z.find(z => v <= z.v1) || Z[2]; return z.f0 + (v - z.v0) / (z.v1 - z.v0) * (z.f1 - z.f0); };
const f2v = f => { const z = Z.find(z => f <= z.f1) || Z[2]; return z.v0 + (f - z.f0) / (z.f1 - z.f0) * (z.v1 - z.v0); };
function layoutZones() {
  const gap = window.innerWidth >= 768 ? 4 : 2; // metà gap tra segmenti
  const [z1, z2, z3] = $$('.seg-z', track);
  z1.style.left = '0'; z1.style.width = `calc(${G * 100}% - ${gap}px)`;
  z2.style.left = `calc(${G * 100}% + ${gap}px)`; z2.style.width = `calc(${O * 100}% - ${gap * 2}px)`;
  z3.style.left = `calc(${(G + O) * 100}% + ${gap}px)`; z3.style.width = `calc(${(1 - G - O) * 100}% - ${gap}px)`;
  const labs = $$('#rrrLabels span');
  labs[0].style.left = '0'; labs[1].style.left = `${G * 100}%`; labs[2].style.left = `${(G + O) * 100}%`;
}
function zoneOf(v) { return v <= 30.05 ? 1 : v <= 35 ? 2 : 3; }
function placeThumb(v, anim) {
  rrrEl.classList.toggle('anim', !!anim && !RM.matches);
  thumb.style.left = (S.applied ? v2f(v) * 100 : 0) + '%';
  const vr = Math.round(v * 10) / 10;
  thumb.setAttribute('aria-valuenow', vr);
  thumb.setAttribute('aria-valuetext', `Rata pari al ${Math.round(v)}% del reddito`);
  tip.textContent = `Rata ${String(Math.round(v)).replace('.', ',')}% del reddito`;
  const z = zoneOf(v);
  $$('#rrrLabels span').forEach(s => s.classList.toggle('on', +s.dataset.z === z && !!S.applied));
}
let dragging = false, lastSnap = null, rafPending = false;
function setRrr(v, { snap = true } = {}) {
  v = Math.min(CFG.rrrMax, Math.max(CFG.rrrMin, v));
  let snapped = null;
  if (snap) for (const s of CFG.snaps) if (Math.abs(v - s) < 0.6) { v = s; snapped = s; }
  if (snapped !== null && snapped !== lastSnap) { vibrate(8); thumb.classList.remove('snap'); void thumb.offsetWidth; thumb.classList.add('snap'); }
  lastSnap = snapped;
  if (Math.abs(v - S.rrr) < 1e-6) return;
  S.rrr = v;
  placeThumb(v, false);
  if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; update({ anim: false }); }); }
}
function fromPointer(e) {
  const rect = track.getBoundingClientRect();
  const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  setRrr(f2v(f));
}
thumb.addEventListener('pointerdown', e => {
  if (!S.applied) return;
  e.preventDefault(); thumb.setPointerCapture(e.pointerId); dragging = true; rrrEl.classList.add('dragging'); rrrEl.classList.remove('anim'); thumb.focus({ preventScroll: true });
});
thumb.addEventListener('pointermove', e => { if (dragging) fromPointer(e); });
const endDrag = () => { if (!dragging) return; dragging = false; rrrEl.classList.remove('dragging'); history.replaceState(null, '', shareUrl()); };
thumb.addEventListener('pointerup', endDrag); thumb.addEventListener('pointercancel', endDrag);
track.addEventListener('pointerdown', e => {
  if (!S.applied || e.target.closest('.thumb-rrr')) return;
  const rect = track.getBoundingClientRect();
  const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  let v = f2v(f); for (const s of CFG.snaps) if (Math.abs(v - s) < 0.6) v = s;
  S.rrr = v; placeThumb(v, true); update({ anim: true }); history.replaceState(null, '', shareUrl());
});
thumb.addEventListener('keydown', e => {
  if (!S.applied) return;
  let v = S.rrr; const next = CFG.snaps.find(s => s > v + 0.01), prev = [...CFG.snaps].reverse().find(s => s < v - 0.01);
  switch (e.key) {
    case 'ArrowRight': case 'ArrowUp': v += 0.5; break;
    case 'ArrowLeft': case 'ArrowDown': v -= 0.5; break;
    case 'PageUp': v = next ?? CFG.rrrMax; break;
    case 'PageDown': v = prev ?? CFG.rrrMin; break;
    case 'Home': v = CFG.rrrMin; break;
    case 'End': v = CFG.rrrMax; break;
    default: return;
  }
  e.preventDefault(); setRrr(v, { snap: false }); history.replaceState(null, '', shareUrl());
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
  overlay.setAttribute('aria-hidden', 'false'); overlay.classList.add('open'); document.body.classList.add('lock');
  setTimeout(() => $('#sheetClose').focus({ preventScroll: true }), 50);
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
// swipe-down per chiudere il bottom sheet (mobile)
(() => {
  let y0 = null, dy = 0;
  sheet.addEventListener('touchstart', e => { if (window.innerWidth >= 768) return; if ($('#sheetBody').scrollTop > 0 && !e.target.closest('.sheet-head,.grab')) return; y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  sheet.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 0) { sheet.classList.add('dragging'); sheet.style.transform = `translateY(${dy}px)`; } }, { passive: true });
  sheet.addEventListener('touchend', () => { if (y0 == null) return; sheet.classList.remove('dragging'); if (dy > 90) closeSheet(); else sheet.style.transform = ''; y0 = null; });
})();

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
  openSheet('Condividi risultati', `<div class="share-body">
      <p class="sub">Copia il link per condividere i risultati con chi vuoi</p>
      <div class="urlbox"><input readonly value="${url.replace(/"/g, '&quot;')}" aria-label="Link dei risultati" onfocus="this.select()"></div>
      <div class="share-acts">
        <a href="https://wa.me/?text=${enc(text + ' ' + url)}" target="_blank" rel="noopener"><span class="ic">${ICONS.shWa}</span>Whatsapp</a>
        <a href="mailto:?subject=${enc('Il mio calcolo mutuo')}&body=${enc(text + '\n' + url)}"><span class="ic">${ICONS.mail}</span>Email</a>
        <button type="button" id="copyLink"><span class="ic">${ICONS.shLink}</span><span class="lb">Copia Link</span></button>
      </div></div>`, 'share');
  $('#copyLink').addEventListener('click', async e => {
    const b = e.currentTarget; await copyText(url);
    b.classList.add('done'); b.querySelector('.lb').textContent = 'Link copiato';
    setTimeout(() => { b.classList.remove('done'); b.querySelector('.lb').textContent = 'Copia Link'; }, CFG.copyFeedbackMs);
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
  if (p.get('rrr')) S.rrr = Math.min(40, Math.max(25, +p.get('rrr')));
  S.useAll = p.get('tutto') === '1';
  if (p.get('vista') === 'mq') { S.unit = 'mq'; $$('button', unitSw).forEach(x => x.setAttribute('aria-checked', x.dataset.u === 'mq')); }
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
  posUnitThumb();
  return true;
}

/* ============================================================
   FEEDBACK
   ============================================================ */
const fbC = $('#fbCollapse'), fbText = $('#fbText'), fbSend = $('#fbSend');
$$('.fb-btn').forEach(b => b.addEventListener('click', () => {
  $$('.fb-btn').forEach(x => x.setAttribute('aria-pressed', x === b));
  $('#fbTitle').textContent = b.dataset.fb === 'si' ? 'Cosa ti è piaciuto?' : 'Qualcosa è andato storto?';
  fbC.classList.add('open'); setTimeout(() => fbText.focus({ preventScroll: true }), 300);
}));
fbText.addEventListener('input', () => { fbSend.disabled = !fbText.value.trim(); });
fbSend.addEventListener('click', () => {
  $('#fb').innerHTML = `<p class="fb-thanks reveal">Grazie per il tuo feedback!</p>`;
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
  <div class="faq-item${i === 0 ? ' open' : ''}">
    <button type="button" class="faq-q" aria-expanded="${i === 0}" aria-controls="faq-${i}">${q}${ICONS.chevDownFaq}</button>
    <div class="collapse faq-a${i === 0 ? ' open' : ''}" id="faq-${i}"><div class="inner"><div class="txt">${a}</div></div></div>
  </div>`).join('');
$('#faqList').addEventListener('click', e => {
  const q = e.target.closest('.faq-q'); if (!q) return;
  const it = q.parentElement, open = !it.classList.contains('open');
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
// Scarica l'app: store corretto in base al dispositivo
(() => {
  const ua = navigator.userAgent;
  const a = $('#appLink');
  if (/iPhone|iPad|iPod/.test(ua)) a.href = 'https://apps.apple.com/it/search?term=immobiliare.it%20mutui';
  else if (/Android/.test(ua)) a.href = 'https://play.google.com/store/search?q=immobiliare.it%20mutui&c=apps';
})();

/* ============================================================
   INIT
   ============================================================ */
els.tasso.value = String(CFG.tassoDefault).replace('.', ',');
syncFilled(els.tasso);
setDurata(CFG.durataDefault);
layoutZones(); placeThumb(S.rrr, false);
requestAnimationFrame(() => { posUnitThumb(); posSegThumb(); });
document.fonts && document.fonts.ready.then(() => { posUnitThumb(); posSegThumb(); });
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { layoutZones(); posUnitThumb(); posSegThumb(); }, 80); });
loadFromUrl();
window.__calc = { compute, CFG, S }; // utile per debug in console
})();
