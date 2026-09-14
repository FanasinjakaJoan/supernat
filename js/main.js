// ─── SUPERNAT · boot & main loop ───────────────────────────────────────────
import { Game } from './game.js';
import { Input } from './input.js';
import { initUI, uiUpdate } from './ui.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('game');

const game = new Game(canvas);
Input.init(stage, canvas);
initUI(game);
window.__supernat = game; // debug/test hook

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
