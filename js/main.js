// ─── SUPERNAT · boot & main loop (offline-first, multiplayer-ready) ─────────
import { Game } from './game.js';
import { Input } from './input.js';
import { initUI, uiUpdate } from './ui.js';
import { NetClient } from './net.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('game');

const game = new Game(canvas);
// Network client: stays dormant until the hunter creates/joins a room.
// Solo play never touches the network — zero overhead, fully backwards compatible.
const net = new NetClient();
try { game.setNet(net); } catch (e) { console.error('[net] attach failed', e); }
Input.init(stage, canvas);
initUI(game, net);
window.__supernat = game; // debug/test hook
window.__supernatNet = net;

// ?room=AB12&name=ASH pre-fills the multiplayer panel (shareable hunt links)
try {
  const q = new URLSearchParams(location.search || '');
  const pr = (q.get('room') || '').toUpperCase().slice(0, 8);
  const pn = (q.get('name') || '').toUpperCase().slice(0, 12);
  if (pr) { const el = document.getElementById('mp-code'); if (el) el.value = pr; }
  if (pn) { const el = document.getElementById('mp-name'); if (el) el.value = pn; }
} catch (e) { /* headless */ }

// keep the battlefield matched to the viewport
let resizeTO = null;
addEventListener('resize', () => {
  clearTimeout(resizeTO);
  resizeTO = setTimeout(() => game.resize(), 120);
});
addEventListener('orientationchange', () => setTimeout(() => game.resize(), 200));

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  game.frame(dt);
  uiUpdate(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
