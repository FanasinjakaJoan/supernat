// ─── SUPERNAT · DOM UI: screens, HUD, bestiary, local high scores ──────────
import { SFX } from './audio.js';
import { Input } from './input.js';
import { ENEMY_TYPES, ENEMY_LIST } from './enemies.js';
import { drawEnemy } from './enemies.js';
import { getAnjanaharySector } from './data/anjanaharyMapData.js';

const $ = (id) => document.getElementById(id);
const LS_KEY = 'supernat.highscores.v1';
const MAX_SCORES = 8;

let game = null;
let els = {};
let lastState = '';
let buffCache = '';
let displayScore = 0;
let pendingName = null; // awaiting high-score name entry

// ── high scores ─────────────────────────────────────────────────────────────
function loadScores() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function saveScores(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch (e) { /* private mode */ }
}
function qualifies(score) {
  const s = loadScores();
  return score > 0 && (s.length < MAX_SCORES || score > s[s.length - 1].s);
}
function addScore(entry) {
  const s = loadScores();
  s.push(entry);
  s.sort((a, b) => b.s - a.s);
  const trimmed = s.slice(0, MAX_SCORES);
  saveScores(trimmed);
  return trimmed.indexOf(entry);
}
function scoreRows(list, highlight = -1) {
  if (!list.length)
    return '<div class="empty">No hunters have fallen yet in Anjanahary. Be the first.</div>';
  return list.map((e, i) => `
    <div class="srow ${i === highlight ? 'hl' : ''}">
      <span class="rank r${Math.min(i, 3)}">${String(i + 1).padStart(2, '0')}</span>
      <span class="sname">${escapeHtml(e.n)}</span>
      <span class="smeta">W${e.w} · ${e.k} kills</span>
      <span class="sscore">${e.s.toLocaleString()}</span>
    </div>`).join('');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ── bestiary ────────────────────────────────────────────────────────────────
function buildBestiary() {
  const grid = els.bestGrid;
  grid.innerHTML = '';
  for (const key of ENEMY_LIST) {
    const def = ENEMY_TYPES[key];
    const card = document.createElement('div');
    card.className = 'bcard';
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    cv.className = 'bicon';
    card.appendChild(cv);
    const info = document.createElement('div');
    info.className = 'binfo';
    info.innerHTML = `
      <h3 style="color:${def.color}">${def.name} <span class="epithet">· ${def.epithet}</span></h3>
      <div class="threat" title="Threat level">${'◆'.repeat(def.threat)}<span class="dim">${'◇'.repeat(4 - def.threat)}</span></div>
      <p>${def.lore}</p>`;
    card.appendChild(info);
    grid.appendChild(card);
    // render the creature with the game's own painter
    const ctx = cv.getContext('2d');
    const isAbo = key === 'abomination';
    ctx.translate(64, isAbo ? 98 : 92);
    const sc = isAbo ? 1.4 : 2.3;
    ctx.scale(sc, sc);
    const fake = {
      type: key, def, r: def.r, t: 0.9, phase: 0, alpha: 0.85,
      rot: Math.PI * 0.5, state: 'stalk', telegraphed: false, hp: 1, maxHp: 1,
      walkPhase: 0.6,
    };
    ctx.globalAlpha = key === 'wraith' ? 0.9 : 1;
    drawEnemy(ctx, fake, 0);
  }
}

// ── banners & feedback ──────────────────────────────────────────────────────
function showBanner(title, sub, cls = '') {
  const b = els.banner;
  els.bannerTitle.textContent = title;
  els.bannerSub.textContent = sub;
  b.className = cls;
  void b.offsetWidth; // restart CSS animation
  b.classList.add('show');
}
function flashHurt() {
  const el = els.hurt;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}

function show(el, on) { el.classList.toggle('hidden', !on); }

function setPanel(name) {
  show(els.menuMain, name === 'main');
  show(els.panelBest, name === 'best');
  show(els.panelScores, name === 'scores');
  if (name === 'scores') els.scoresList.innerHTML = scoreRows(loadScores());
  if (name === 'main') renderMenuTop();
}

function renderMenuTop() {
  const top = loadScores().slice(0, 3);
  els.menuTop.innerHTML = top.length
    ? top.map((e, i) => `<span class="mt"><b>${escapeHtml(e.n)}</b> ${e.s.toLocaleString()}</span>`).join('')
    : '<span class="mt dim">No records yet — Anjanahary awaits.</span>';
}

function fmtTime(s) {
  const m = (s / 60) | 0, ss = (s % 60) | 0;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

// ── boot ────────────────────────────────────────────────────────────────────
export function initUI(g) {
  game = g;
  els = {
    stage: $('stage'), hud: $('hud'), hurt: $('hurt'),
    scoreVal: $('score-val'), multVal: $('mult-val'), comboFill: $('combo-fill'),
    waveVal: $('wave-val'), sectorVal: $('sector-val'), hpFill: $('hp-fill'), hpText: $('hp-text'), buffs: $('buffs'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    menu: $('menu'), menuMain: $('menu-main'), menuTop: $('menu-top'),
    panelBest: $('panel-best'), bestGrid: $('best-grid'),
    panelScores: $('panel-scores'), scoresList: $('scores-list'),
    over: $('over'), overScore: $('over-score'), newbest: $('newbest'),
    statWave: $('stat-wave'), statKills: $('stat-kills'), statTime: $('stat-time'), statMult: $('stat-mult'),
    nameRow: $('name-row'), nameInput: $('name-input'), overScores: $('over-scores'),
    pause: $('pause'),
    stickBase: $('stick-base'), stickKnob: $('stick-knob'),
    aimBase: $('aim-base'), aimKnob: $('aim-knob'),
    btnDash: $('btn-dash'),
    btnSound: $('btn-sound'), btnHudMute: $('btn-hud-mute'),
  };

  buildBestiary();
  setPanel('main');
  syncSoundLabel();

  // game → ui hooks
  game.onGameOver = (stats) => {
    els.overScore.textContent = stats.score.toLocaleString();
    els.statWave.textContent = stats.wave;
    els.statKills.textContent = stats.kills;
    els.statTime.textContent = fmtTime(stats.time);
    els.statMult.textContent = 'x' + stats.bestMult;
    pendingName = qualifies(stats.score);
    show(els.nameRow, pendingName);
    els.nameInput.value = '';
    els.newbest.classList.add('hidden');
    els.overScores.innerHTML = scoreRows(loadScores());
    if (pendingName) setTimeout(() => els.nameInput.focus(), 60);
  };

  // ── buttons (delegated) ──
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    btn.blur();
    SFX.unlock();
    SFX.click();
    const a = btn.dataset.action;
    switch (a) {
      case 'start': game.startRun(); break;
      case 'restart': game.startRun(); break;
      case 'resume': game.state = 'playing'; break;
      case 'quit': game.state = 'menu'; setPanel('main'); renderMenuTop(); break;
      case 'panel-best': setPanel('best'); break;
      case 'panel-scores': setPanel('scores'); break;
      case 'panel-back': setPanel('main'); break;
      case 'pause': game.togglePause(); break;
      case 'mute': SFX.toggleMute(); syncSoundLabel(); break;
      case 'save-name': commitName(); break;
    }
  });

  els.btnDash.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    Input.dashQueued = true;
  });

  // ── keyboard shortcuts ──
  addEventListener('keydown', (e) => {
    if (e.target === els.nameInput) {
      if (e.code === 'Enter') commitName();
      return;
    }
    if (e.code === 'KeyM') { SFX.toggleMute(); syncSoundLabel(); }
    if (e.code === 'Enter') {
      if (game.state === 'menu' || game.state === 'over') {
        if (game.state === 'over' && pendingName) return; // finish name entry first
        SFX.unlock(); game.startRun();
      } else if (game.state === 'paused') game.state = 'playing';
    }
    if (e.code === 'KeyR') {
      if (game.state === 'paused' || game.state === 'over') { SFX.unlock(); game.startRun(); }
    }
  });

  // auto-pause when the tab hides
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') game.state = 'paused';
  });
  addEventListener('blur', () => { if (game.state === 'playing') game.state = 'paused'; });
}

function commitName() {
  if (!pendingName) return;
  const name = (els.nameInput.value.trim() || 'HUNTER').toUpperCase().slice(0, 10);
  const idx = addScore({
    n: name, s: game.score, w: game.wave, k: game.kills,
    d: new Date().toISOString().slice(0, 10),
  });
  pendingName = null;
  show(els.nameRow, false);
  els.overScores.innerHTML = scoreRows(loadScores(), idx);
  if (idx === 0) els.newbest.classList.remove('hidden');
  SFX.buff();
}

function syncSoundLabel() {
  const label = SFX.muted ? '♪ OFF' : '♪ ON';
  if (els.btnSound) els.btnSound.textContent = label;
  if (els.btnHudMute) els.btnHudMute.textContent = SFX.muted ? '🔇' : '🔊';
}

// ── per-frame HUD sync ──────────────────────────────────────────────────────
export function uiUpdate(rawDt) {
  const st = game.state;

  // pause key (consume once)
  if (Input.pauseQueued) {
    Input.pauseQueued = false;
    if (st === 'playing' || st === 'paused') game.togglePause();
  }

  // screens
  if (st !== lastState) {
    lastState = st;
    const inRun = st === 'playing' || st === 'paused' || st === 'dying';
    show(els.hud, inRun);
    show(els.menu, st === 'menu');
    show(els.pause, st === 'paused');
    show(els.over, st === 'over');
    document.body.classList.toggle('in-run', inRun);
    if (st === 'menu') renderMenuTop();
    if (st === 'playing') { displayScore = game.score; buffCache = ''; }
  }

  // game event queue
  for (const ev of game.events.splice(0)) {
    if (ev.type === 'wave') showBanner(`WAVE ${ev.data.n}`, ev.data.flavor);
    else if (ev.type === 'waveClear') showBanner('WAVE CLEARED', 'The street goes quiet… +10 HP', 'clear');
    else if (ev.type === 'hurt') flashHurt();
  }

  const inRun = st === 'playing' || st === 'paused' || st === 'dying';
  if (inRun && game.player) {
    const p = game.player;
    displayScore += (game.score - displayScore) * Math.min(1, rawDt * 12);
    els.scoreVal.textContent = Math.round(displayScore).toLocaleString();
    els.multVal.textContent = 'x' + game.mult;
    els.multVal.classList.toggle('hot', game.mult >= 3);
    els.comboFill.style.width = (game.mult > 1 ? (game.comboTimer / 3) * 100 : 0) + '%';
    els.waveVal.textContent = 'WAVE ' + game.wave;
    if (els.sectorVal) {
      els.sectorVal.textContent = '📍 ' + getAnjanaharySector(p.x, p.y);
    }
    const hpFrac = Math.max(0, p.hp / p.maxHp);
    els.hpFill.style.width = (hpFrac * 100) + '%';
    els.hpFill.classList.toggle('low', hpFrac < 0.3);
    els.hpText.textContent = Math.ceil(p.hp);
    // buffs
    let bhtml = '';
    if (p.buffs.shield > 0) bhtml += `<span class="chip c-shield">◈ ${Math.ceil(p.buffs.shield)}s</span>`;
    if (p.buffs.rapid > 0) bhtml += `<span class="chip c-rapid">⚡ ${Math.ceil(p.buffs.rapid)}s</span>`;
    if (p.buffs.spread > 0) bhtml += `<span class="chip c-spread">⇉ ${Math.ceil(p.buffs.spread)}s</span>`;
    if (p.buffs.pierce > 0) bhtml += `<span class="chip c-pierce">✦ ${Math.ceil(p.buffs.pierce)}s</span>`;
    if (bhtml !== buffCache) { buffCache = bhtml; els.buffs.innerHTML = bhtml; }
  }

  // touch stick visuals
  if (Input.touchMode) {
    placeStick(els.stickBase, els.stickKnob, Input.moveStick);
    placeStick(els.aimBase, els.aimKnob, Input.aimStick);
  }
}

function placeStick(base, knob, stick) {
  if (stick) {
    base.classList.add('on');
    base.style.transform = `translate(${stick.ox}px, ${stick.oy}px)`;
    const kx = (stick.cx || stick.ox) - stick.ox;
    const ky = (stick.cy || stick.oy) - stick.oy;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
  } else {
    base.classList.remove('on');
    knob.style.transform = 'translate(0px, 0px)';
  }
}
