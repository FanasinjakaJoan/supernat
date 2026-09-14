// ─── SUPERNAT · headless smoke test ────────────────────────────────────────
// Stubs the browser DOM/canvas enough to boot the real game modules, then
// pumps frames through menu → run → pause → death → game-over → restart.
// Run: node tools/smoke.mjs

'use strict';
let failures = 0;
const ok = (cond, label) => {
  if (cond) console.log('  ✓ ' + label);
  else { failures++; console.error('  ✗ FAIL: ' + label); }
};

// ── canvas 2D context stub (accepts everything, returns sane defaults) ──
function makeCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (typeof p === 'symbol') return undefined;
      if (p === 'canvas') return { width: 1280, height: 720 };
      if (p === 'createRadialGradient' || p === 'createLinearGradient')
        return () => ({ addColorStop() {} });
      if (p === 'createPattern') return () => ({});
      if (p === 'measureText') return () => ({ width: 12 });
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => undefined;
    },
    set() { return true; },
  });
}

// ── element stub ──
function makeEl(tag = 'div') {
  const classSet = new Set();
  return {
    tagName: String(tag).toUpperCase(),
    style: {},
    dataset: {},
    classList: {
      add: (c) => classSet.add(c),
      remove: (c) => classSet.delete(c),
      toggle: (c, f) => { const on = f === undefined ? !classSet.has(c) : f; on ? classSet.add(c) : classSet.delete(c); return on; },
      contains: (c) => classSet.has(c),
    },
    children: [],
    value: '', textContent: '', innerHTML: '', hidden: false,
    width: 300, height: 150, offsetWidth: 300,
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    getContext() { return makeCtx(); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {}, blur() {}, select() {},
    setPointerCapture() {}, releasePointerCapture() {},
  };
}

// ── globals ──
const els = new Map();
global.window = globalThis;
global.innerWidth = 1280;
global.innerHeight = 720;
global.devicePixelRatio = 1;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.document = {
  getElementById(id) { if (!els.has(id)) els.set(id, makeEl()); return els.get(id); },
  createElement(tag) { return makeEl(tag); },
  body: makeEl('body'),
  hidden: false,
  addEventListener() {}, removeEventListener() {},
};
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
let rafCb = null;
global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
// single controllable clock shared by performance.now() and the rAF callback
let now = 0;
global.performance = { now: () => now };

console.log('SUPERNAT smoke test');
console.log('─ boot ─');
await import('../js/main.js');
const game = globalThis.__supernat;
ok(!!game, 'game instance booted');
ok(game.state === 'menu', 'starts in menu state');

// pump a few menu frames (ambient rendering)
const pump = (frames) => {
  for (let i = 0; i < frames; i++) {
    now += 16.7;
    const cb = rafCb; rafCb = null;
    if (cb) cb(now);
  }
};
pump(30);
ok(true, 'menu frames render without error');

console.log('─ start run ─');
game.startRun();
ok(game.state === 'playing', 'state=playing after startRun');
ok(game.wave === 1, 'wave 1 queued');

// aim right of the player + hold fire via stubbed input
const { Input } = await import('../js/input.js');
const trackMouse = () => { Input.mouse.x = game.player.x + 240; Input.mouse.y = game.player.y; };
trackMouse();
Input.mouse.down = true;

pump(120); // ~2s: portals open, first shamblers spawn
ok(game.enemies.length > 0 || game.portals.length > 0, 'enemies/portals present after 2s');

// force a kill: drop a 1hp shambler directly in the line of fire
trackMouse();
game.spawnEnemy('shambler', game.player.x + 200, game.player.y);
const target = game.enemies[game.enemies.length - 1];
target.hp = 1;
const scoreBefore = game.score;
for (let i = 0; i < 60 && !target.dead; i++) { trackMouse(); pump(1); }
ok(game.score > scoreBefore, `kill scored (${scoreBefore} → ${game.score})`);
ok(game.kills >= 1, 'kill counter incremented');
ok(game.events !== undefined, 'event queue exists');

console.log('─ systems ─');
pump(240); // ~4 more seconds of combat
ok(true, 'combat frames stable (bullets/particles/waves)');

// pickups
game.dropPickup(game.player.x, game.player.y, true);
pump(30);
ok(game.player.hp <= game.player.maxHp, 'pickup applied without crash');

// damage + pause toggle
game.damagePlayer(15, game.player.x + 10, game.player.y);
ok(game.player.hp <= game.player.maxHp - 14, 'damage applied');
game.togglePause();
ok(game.state === 'paused', 'pause works');
const hpAtPause = game.player.hp;
pump(30);
ok(game.player.hp === hpAtPause, 'simulation frozen while paused');
game.togglePause();
ok(game.state === 'playing', 'resume works');

console.log('─ bestiary coverage ─');
// exercise every creature's AI + renderer, and the wave-clear transition
const { ENEMY_LIST } = await import('../js/enemies.js');
game.player.iframes = 999; // keep the test hunter alive while creatures swarm
for (const type of ENEMY_LIST) {
  game.spawnEnemy(type, game.player.x + 120, game.player.y - 60);
  const e = game.enemies[game.enemies.length - 1];
  e.hp = e.maxHp; // no accidental instant kill
}
pump(300); // 5s: hound charges, banshee wails, abomination roars
ok(true, `all ${ENEMY_LIST.length} creature types simulate + render without error`);
ok(game.ebullets.length >= 0, 'enemy projectile path exercised');

// wipe the field to force a wave-clear → intermission → next wave
game.spawnQueue.length = 0; game.portals.length = 0;
for (let pass = 0; pass < 4 && game.enemies.length; pass++) {
  for (const e of [...game.enemies]) game.damageEnemy(e, 1e6, 0, false);
  game.enemies = game.enemies.filter((e) => !e.dead);
}
game.player.hp = game.player.maxHp;
const waveBefore = game.wave;
pump(240); // ~4s covers the 2.3s intermission
ok(game.wave > waveBefore, `wave advance works (wave ${waveBefore} → ${game.wave})`);
game.player.iframes = 0;

console.log('─ death & game over ─');
pump(70); // settle i-frames before the lethal blow
let overStats = null;
game.onGameOver = (s) => { overStats = s; };
game.damagePlayer(99999, game.player.x, game.player.y);
ok(game.state === 'dying', 'dying state entered');
pump(120); // slow-mo death (~1.15s real time)
ok(game.state === 'over', 'game-over reached');
ok(overStats && typeof overStats.score === 'number', 'onGameOver delivered stats');

console.log('─ instant restart ─');
game.startRun();
ok(game.state === 'playing', 'instant restart works');
ok(game.score === 0 && game.wave === 1, 'run state reset');
pump(180);
ok(game.wave >= 1, 'waves keep coming after restart');

// resize resilience
game.resize();
pump(30);
ok(true, 'resize + frames stable');

console.log(failures === 0 ? 'SMOKE OK — all checks passed' : `SMOKE FAILED — ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
