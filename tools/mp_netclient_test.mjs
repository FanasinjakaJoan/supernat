// ─── SUPERNAT · NetClient E2E test (js/net.js ↔ live Python server) ────────
// Run:  python server.py &
//       node tools/mp_netclient_test.mjs
// NetClient (js/net.js) end-to-end test against the live Python server.
import { NetClient } from '../js/net.js';

let fails = 0;
const ok = (c, l) => { console.log((c ? '  PASS ' : '  FAIL ') + l); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const URL = process.env.SUPERNAT_WS || 'ws://127.0.0.1:8080/ws';
const host = new NetClient();
const guest = new NetClient();

const hw = await host.connect({ name: 'NODEHOST', create: true, url: URL });
ok(hw.room && host.isHost, `host created room ${hw.room}`);
await guest.connect({ name: 'NODEGUEST', room: hw.room, url: URL });
ok(!guest.isHost && guest.roomCode === hw.room, 'guest joined via NetClient');

// state upload + interpolation
for (let i = 0; i < 12; i++) {
  host.sendState({ x: 1000 + i * 10, y: 900, vx: 300, vy: 0, ang: 1.0, hp: 90, maxHp: 100,
    dashT: 0, iframes: 0, firing: true, mult: 2, score: 100 + i, kills: 3, walkPhase: i,
    moveAng: 0, isMoving: true, alive: true, buffs: { rapid: 0, spread: 0, pierce: 0, shield: 0 } });
  guest.update(); host.update();
  await sleep(40);
}
const remotes = guest.getRemotePlayers();
const rh = remotes.get(host.id);
ok(rh && rh.name === 'NODEHOST' && rh.interp, `guest interpolates host (${rh && rh.interp}, x=${rh && Math.round(rh.x)})`);
ok(rh && rh.x >= 1000 && rh.x <= 1120, 'interpolated position tracks movement');
ok(rh && rh.firing === true && rh.hp === 90, 'action state + hp synced');

// world snapshot
host.forceWorldSend({ wave: 5, intermission: 0, spawnLeft: 2, running: true,
  enemies: [{ id: 3, type: 'hound', x: 10, y: 20, hp: 26, maxHp: 26, rot: 0, state: 'charge',
    telegraphed: false, alpha: 1, walkPhase: 0, vx: 0, vy: 0 }],
  portals: [], pickups: [], ebullets: [], deaths: [] });
await sleep(400);
const w = guest.getWorld();
ok(w && w.wave === 5 && w.enemies[0].type === 'hound', 'guest getWorld() returns host snapshot');

// roster
const roster = guest.rosterList();
ok(roster.length === 2 && roster.some((p) => p.self), `roster has 2 hunters (${roster.map((p) => p.name).join(',')})`);

// ping
guest.update();
await sleep(300);
ok(guest.pingMs != null && guest.pingMs < 500, `ping tracked (${guest.pingMs}ms)`);

// hit routing through real clients
let hitGot = null;
host.onHit = (m) => { hitGot = m; };
guest.sendHit(3, 24, false, 0.5, 2);
await sleep(300);
ok(hitGot && hitGot.enemy === 3, 'host NetClient receives guest hit');

// host migration through real clients
let migrated = null;
guest.onHostChanged = (m) => { migrated = m; };
host.disconnect();
await sleep(500);
ok(migrated && guest.isHost, 'guest promoted to host on disconnect');
guest.disconnect();
await sleep(200);

console.log(fails ? `${fails} FAILURES` : 'NETCLIENT E2E: ALL PASSED');
process.exit(fails ? 1 : 0);
