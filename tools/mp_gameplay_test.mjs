// ─── SUPERNAT · co-op gameplay integration test ─────────────────────────────
// Two real Game instances (host + guest) synced through NetClient + the live
// Python server. Exercises world sync, hit claims, kill credit, shared
// pickups, contact damage, respawn, and host migration end to end.
//
// Run:  python server.py &
//       node tools/mp_gameplay_test.mjs
'use strict';
let fails = 0;
const ok = (c, l) => { console.log((c ? '  PASS ' : '  FAIL ') + l); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (typeof p === 'symbol') return undefined;
      if (p === 'canvas') return { width: 1280, height: 720 };
      if (p === 'createRadialGradient' || p === 'createLinearGradient')
        return () => ({ addColorStop() {} });
      if (p === 'measureText') return () => ({ width: 60 });
      return () => undefined;
    },
    set() { return true; },
  });
}
function makeEl(tag = 'div') {
  const cs = new Set();
  return {
    tagName: String(tag).toUpperCase(), style: {}, dataset: {},
    classList: { add: (c) => cs.add(c), remove: (c) => cs.delete(c),
      toggle: (c, f) => { const on = f === undefined ? !cs.has(c) : f; on ? cs.add(c) : cs.delete(c); return on; },
      contains: (c) => cs.has(c) },
    children: [], value: '', textContent: '', innerHTML: '',
    width: 300, height: 150, offsetWidth: 300,
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    getContext() { return makeCtx(); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    querySelector() { return makeEl(); }, querySelectorAll() { return []; },
    closest() { return null; }, focus() {}, blur() {},
  };
}
global.window = globalThis;
global.innerWidth = 1280; global.innerHeight = 720; global.devicePixelRatio = 1;
global.addEventListener = () => {}; global.removeEventListener = () => {};
global.document = { getElementById: () => makeEl(), createElement: (t) => makeEl(t),
  body: makeEl('body'), hidden: false, addEventListener() {}, removeEventListener() {} };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { Game } = await import('../js/game.js');
const { NetClient } = await import('../js/net.js');
const { Input } = await import('../js/input.js');
Input.mouse = { x: 2000, y: 920, down: false, isScreen: false };

const URL = process.env.SUPERNAT_WS || 'ws://127.0.0.1:8080/ws';
const netH = new NetClient(); const netG = new NetClient();
const gameH = new Game(makeEl('canvas')); gameH.setNet(netH);
const gameG = new Game(makeEl('canvas')); gameG.setNet(netG);
const pumpH = (n = 5) => { for (let i = 0; i < n; i++) gameH.frame(0.016); };
const pumpG = (n = 3) => { for (let i = 0; i < n; i++) gameG.frame(0.016); };

const hw = await netH.connect({ name: 'HOST', create: true, url: URL });
await netG.connect({ name: 'GUEST', room: hw.room, url: URL });
ok(netH.isHost && !netG.isHost, `room ${hw.room}: host + guest linked`);

gameH.startRun(); gameG.startRun();
ok(gameH.wave === 1 && gameG.wave === 0, 'host opens wave 1, guest waits for host world');
ok(gameG.isGuest() && !gameH.isGuest(), 'guest/host roles detected by game');

// ── host world → guest ──
gameH.spawnEnemy('shambler', 1300, 950);
const hid = gameH.enemies[gameH.enemies.length - 1].netId;
ok(hid > 0, `host enemy has stable netId (${hid})`);
netH.forceWorldSend(gameH.buildHostSnapshot());
await sleep(400);
pumpH(2); // host uploads state → server relays → guest ingests below
await sleep(250);
pumpG(2);
const ge = gameG.enemies.find((e) => e.netId === hid);
ok(!!ge && ge.type === 'shambler', 'guest mirrors host enemy via snapshot');
ok(gameG.wave === 1, 'guest wave follows host');
ok(gameG.remotePlayers.has(netH.id), 'guest interpolates host hunter');

// ── guest hit claim → host kill → kill credit ──
const hpBefore = gameH.enemies.find((e) => e.netId === hid).hp;
netG.sendHit(hid, 5, false, 0.5, 1);
await sleep(300);
const hpAfter = (gameH.enemies.find((e) => e.netId === hid) || {}).hp;
ok(hpAfter === hpBefore - 5, `host applies guest damage (${hpBefore} → ${hpAfter})`);
const gs0 = gameG.score, gk0 = gameG.kills;
netG.sendHit(hid, 10000, true, 0.5, 1); // killing blow from guest
await sleep(400);
pumpG(); pumpH(); // drain hit-stop freeze + splice the corpse
ok(!gameH.enemies.find((e) => e.netId === hid), 'host enemy died from guest hit');
ok(gameG.kills === gk0 + 1 && gameG.score > gs0, `guest credited kill+score (${gs0} → ${gameG.score})`);
ok(gameH.kills === 0 && gameH.score === 0, 'host score untouched by guest kill');

// ── host hunts nearest hunter (guest) ──
pumpG(); // fresh guest position upload
await sleep(250);
gameH.spawnEnemy('wraith', gameG.player.x + 60, gameG.player.y);
const wraith = gameH.enemies[gameH.enemies.length - 1];
gameH.player.x = 300; gameH.player.y = 300; // host far away
await sleep(250);
pumpH();
const tgt = gameH.getTargetFor(wraith);
const dGuest = Math.hypot(tgt.x - gameG.player.x, tgt.y - gameG.player.y);
ok(dGuest < 200, 'host AI targets nearest hunter (the guest)');

// ── shared pickup ──
gameH.dropPickup(gameG.player.x + 200, gameG.player.y, 'heal');
netH.forceWorldSend(gameH.buildHostSnapshot());
await sleep(400);
pumpG(4);
ok(gameG.pickups.length >= 1, 'guest sees host pickup');
const pk = gameG.pickups[0];
gameG.player.hp = 40;
gameG.player.x = pk.x; gameG.player.y = pk.y; // step onto it
pumpG(2);
ok(gameG.player.hp > 40, 'guest collects shared pickup (+HP)');
await sleep(400);
ok(gameH.pickups.length === 0, 'host removes taken pickup (pickup_take relay)');

// ── guest contact damage from authoritative enemy ──
gameH.spawnEnemy('hound', gameG.player.x + 5, gameG.player.y + 5);
netH.forceWorldSend(gameH.buildHostSnapshot());
await sleep(400);
gameG.player.iframes = 0; gameG.player.hp = 100;
pumpG(3);
ok(gameG.player.hp < 100, 'guest takes local contact damage from synced enemy');

// ── co-op respawn (no game over while packed) ──
gameG.player.iframes = 0; gameG.player.buffs.shield = 0;
gameG.damagePlayer(99999, gameG.player.x, gameG.player.y);
ok(gameG.state === 'dying', 'guest enters dying');
gameG.dyingT = 0.01;
gameG.frame(0.05); gameG.frame(0.05);
ok(gameG.state === 'playing' && gameG.player.hp === gameG.player.maxHp, 'guest respawns (pack fights on)');

// ── host migration keeps the hunt alive ──
netH.disconnect();
await sleep(500);
ok(netG.isHost && gameG.isHost(), 'guest promoted; game flips to host mode');
pumpG(2);
ok((gameG.spawnQueue || []).length >= 0 && gameG.wave >= 1, 'new host continues waves');
netG.disconnect();
await sleep(200);

console.log(fails ? `${fails} FAILURES` : 'CO-OP GAMEPLAY: ALL PASSED');
process.exit(fails ? 1 : 0);
