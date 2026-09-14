// ─── SUPERNAT · the supernatural bestiary ──────────────────────────────────
import { TAU, rand, angleTo } from './utils.js';
import { getGlow } from './particles.js';

export const ENEMY_TYPES = {
  shambler: {
    key: 'shambler', name: 'Shambler', epithet: 'The Risen Dead',
    lore: 'Once citizens of Meridian. The Rift\u2019s green breath knits their bones back into hunger \u2014 slow, endless, and never alone for long.',
    threat: 1, hp: 30, speed: 74, r: 15, dmg: 10, score: 10,
    color: '#79c94a', glow: '#54d44a', unlock: 1,
  },
  wraith: {
    key: 'wraith', name: 'Wraith', epithet: 'Restless Spirit',
    lore: 'Grief given form. It drifts between steel and flesh, drinking warmth from the living. Where it passes, frost and silence remain.',
    threat: 2, hp: 20, speed: 128, r: 13, dmg: 8, score: 15,
    color: '#7be9ff', glow: '#7be9ff', unlock: 2,
  },
  hound: {
    key: 'hound', name: 'Hellhound', epithet: 'Pit Stalker',
    lore: 'A hunting thing from the places under the city. It circles in burning patience, then closes the gap in one blistering charge.',
    threat: 2, hp: 26, speed: 120, r: 13, dmg: 12, score: 20,
    color: '#ff9d3d', glow: '#ff6a2e', unlock: 3,
  },
  vampire: {
    key: 'vampire', name: 'Vampire', epithet: 'Night Aristocrat',
    lore: 'The old bloodlines survived the fall of Meridian. Centuries of duels taught them to weave between bullets \u2014 and to laugh while doing it.',
    threat: 3, hp: 55, speed: 112, r: 14, dmg: 14, score: 30,
    color: '#ff2e4d', glow: '#b06cff', unlock: 5,
  },
  banshee: {
    key: 'banshee', name: 'Banshee', epithet: 'The Wailing Echo',
    lore: 'She keeps her distance and screams shards of spirit across the street. Wherever her song lands, living flesh simply parts.',
    threat: 3, hp: 45, speed: 86, r: 14, dmg: 8, score: 40,
    color: '#cfa9ff', glow: '#b06cff', unlock: 7,
  },
  abomination: {
    key: 'abomination', name: 'Abomination', epithet: 'The Fused Colossus',
    lore: 'Many bodies stitched into one colossal hunger. It walks through gunfire, and where it finally falls, the fallen rise again beside it.',
    threat: 4, hp: 420, speed: 46, r: 30, dmg: 24, score: 150,
    color: '#6f8f3a', glow: '#9dff20', unlock: 4,
  },
};

export const ENEMY_LIST = ['shambler', 'wraith', 'hound', 'vampire', 'banshee', 'abomination'];

/** Weighted random pick of enemy types unlocked for wave n. */
export function pickWaveEnemy(n) {
  const pool = [['shambler', 10]];
  if (n >= 2) pool.push(['wraith', 3 + n * 0.8]);
  if (n >= 3) pool.push(['hound', 2.5 + n * 0.7]);
  if (n >= 5) pool.push(['vampire', 2 + n * 0.5]);
  if (n >= 7) pool.push(['banshee', 1.5 + n * 0.4]);
  let tot = 0;
  for (const p of pool) tot += p[1];
  let r = Math.random() * tot;
  for (const p of pool) { r -= p[1]; if (r <= 0) return p[0]; }
  return 'shambler';
}

// ─── per-type AI ────────────────────────────────────────────────────────────
export function updateEnemy(e, g, dt) {
  const p = g.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d, ny = dy / d;
  e.t += dt;
  e.rot = angleTo(e.x, e.y, p.x, p.y);

  switch (e.type) {
    case 'shambler': {
      const wob = Math.sin(e.t * 5 + e.phase) * 0.35;
      e.x += (nx + ny * wob * 0.4) * e.speed * dt;
      e.y += (ny - nx * wob * 0.4) * e.speed * dt;
      break;
    }
    case 'wraith': {
      e.phase += dt * 2.6;
      e.alpha = 0.5 + 0.32 * Math.sin(e.phase * 1.7);
      const drift = Math.sin(e.phase * 2.1) * 0.75;
      e.x += (nx + -ny * drift) * e.speed * dt;
      e.y += (ny + nx * drift) * e.speed * dt;
      if (Math.random() < dt * 14) {
        g.particles.add({
          kind: 'smoke', x: e.x + rand(-6, 6), y: e.y + rand(-6, 6),
          vx: rand(-8, 8), vy: rand(-16, -4), life: 0.5, max: 0.5,
          size: 6, color: 'rgba(123,233,255,0.7)', drag: 1, grav: 0,
        });
      }
      break;
    }
    case 'hound': {
      if (e.state === 'stalk') {
        e.x += nx * e.speed * 0.42 * dt;
        e.y += ny * e.speed * 0.42 * dt;
        e.chargeT -= dt;
        if (e.chargeT <= 0 && d < 400) { e.state = 'windup'; e.windT = 0.34; e.lockAng = e.rot; }
      } else if (e.state === 'windup') {
        e.windT -= dt;
        if (Math.random() < dt * 30)
          g.particles.burst(e.x, e.y, '#ff9d3d', 1, 60, 0.3, 1.8);
        if (e.windT <= 0) {
          e.state = 'charge'; e.chargeRunT = 0.5; e.lockAng = angleTo(e.x, e.y, p.x, p.y);
          g.SFX.spawn();
        }
      } else if (e.state === 'charge') {
        e.chargeRunT -= dt;
        const sp = e.speed * 2.5;
        e.x += Math.cos(e.lockAng) * sp * dt;
        e.y += Math.sin(e.lockAng) * sp * dt;
        if (Math.random() < dt * 40)
          g.particles.burst(e.x, e.y, '#ff6a2e', 1, 40, 0.25, 2);
        if (e.chargeRunT <= 0) { e.state = 'stalk'; e.chargeT = rand(1.1, 2.1); }
      }
      break;
    }
    case 'vampire': {
      const strafe = Math.sin(e.t * 2.2 + e.phase) * 0.85;
      const push = d > 90 ? 1 : 0.2;
      e.x += (nx * push + -ny * strafe) * e.speed * dt;
      e.y += (ny * push + nx * strafe) * e.speed * dt;
      break;
    }
    case 'banshee': {
      const want = d < 230 ? -1 : d > 330 ? 1 : 0;
      const orbit = Math.sin(e.t * 1.3 + e.phase) * 0.5;
      e.x += (nx * want + -ny * orbit) * e.speed * dt;
      e.y += (ny * want + nx * orbit) * e.speed * dt;
      e.shootT -= dt;
      if (e.shootT <= 0.3 && !e.telegraphed) { e.telegraphed = true; }
      if (e.shootT <= 0 && d < 560) {
        e.shootT = rand(1.7, 2.5);
        e.telegraphed = false;
        g.spawnEnemyBullet(e.x, e.y - 6, e.rot);
        g.SFX.bansheeShot();
      }
      break;
    }
    case 'abomination': {
      e.x += nx * e.speed * dt;
      e.y += ny * e.speed * dt;
      e.roarT = (e.roarT || 5) - dt;
      if (e.roarT <= 0) {
        e.roarT = rand(5, 8);
        g.shake(6, 0.3);
        g.particles.ring(e.x, e.y, '#9dff20', 60, 0.5);
        g.SFX.spawn();
      }
      break;
    }
  }
}

// ─── vector-art renderers (also used by the bestiary UI) ───────────────────
function glowUnder(ctx, e, color, r, a) {
  const s = getGlow(color);
  ctx.globalCompositeOperation = 'lighter';
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * a;
  ctx.drawImage(s, -r, -r, r * 2, r * 2);
  ctx.globalAlpha = ga;
  ctx.globalCompositeOperation = 'source-over';
}

export function drawEnemy(ctx, e, t) {
  switch (e.type) {
    case 'shambler': {
      const sway = Math.sin(e.t * 5 + e.phase) * 0.12;
      glowUnder(ctx, e, e.def.glow, e.r * 1.9, 0.16);
      ctx.rotate(e.rot + sway);
      // arms reaching forward
      const arm = Math.sin(e.t * 6 + e.phase) * 3;
      ctx.strokeStyle = '#4d7a30'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(2, -7); ctx.lineTo(e.r + 6, -6 + arm); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, 7); ctx.lineTo(e.r + 6, 6 - arm); ctx.stroke();
      // body
      ctx.fillStyle = '#577f37';
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3f5f28';
      ctx.beginPath(); ctx.arc(-4, 4, e.r * 0.55, 0, TAU); ctx.fill();
      // head
      ctx.fillStyle = '#6b9a44';
      ctx.beginPath(); ctx.arc(e.r * 0.4, 0, e.r * 0.55, 0, TAU); ctx.fill();
      // eyes
      ctx.fillStyle = '#c8ff7a';
      ctx.beginPath(); ctx.arc(e.r * 0.62, -3.4, 1.9, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(e.r * 0.62, 3.4, 1.9, 0, TAU); ctx.fill();
      break;
    }
    case 'wraith': {
      glowUnder(ctx, e, e.def.glow, e.r * 2.6, 0.4);
      ctx.rotate(e.rot + Math.PI / 2);
      const w = e.t * 6 + e.phase;
      ctx.fillStyle = 'rgba(123,233,255,0.55)';
      ctx.beginPath();
      ctx.moveTo(0, -e.r * 1.25);
      ctx.quadraticCurveTo(e.r, -e.r * 0.3, e.r * 0.75, e.r * 0.7);
      ctx.quadraticCurveTo(e.r * 0.3, e.r * (0.45 + Math.sin(w) * 0.25), 0, e.r * (1.15 + Math.sin(w * 1.3) * 0.2));
      ctx.quadraticCurveTo(-e.r * 0.3, e.r * (0.45 + Math.cos(w) * 0.25), -e.r * 0.75, e.r * 0.7);
      ctx.quadraticCurveTo(-e.r, -e.r * 0.3, 0, -e.r * 1.25);
      ctx.fill();
      ctx.fillStyle = '#06202c';
      ctx.beginPath(); ctx.arc(0, -e.r * 0.35, e.r * 0.42, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d9fbff';
      ctx.beginPath(); ctx.arc(-2.6, -e.r * 0.4, 1.7, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(2.6, -e.r * 0.4, 1.7, 0, TAU); ctx.fill();
      break;
    }
    case 'hound': {
      glowUnder(ctx, e, e.def.glow, e.r * 2.1, e.state === 'charge' ? 0.5 : 0.24);
      ctx.rotate(e.rot);
      const run = Math.sin(e.t * 16) * (e.state === 'charge' ? 4 : 1.5);
      // legs
      ctx.strokeStyle = '#5e1d10'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(-9 + run, -11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, 6); ctx.lineTo(-9 - run, 11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(9 - run, -11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(9 + run, 11); ctx.stroke();
      // body
      ctx.fillStyle = e.state === 'windup' ? '#8a2f14' : '#701f10';
      ctx.beginPath(); ctx.ellipse(0, 0, e.r * 1.2, e.r * 0.72, 0, 0, TAU); ctx.fill();
      // head
      ctx.fillStyle = '#8a2f14';
      ctx.beginPath();
      ctx.moveTo(e.r * 0.7, -5); ctx.lineTo(e.r * 1.75, 0); ctx.lineTo(e.r * 0.7, 5);
      ctx.closePath(); ctx.fill();
      // ember eyes + back cracks
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath(); ctx.arc(e.r * 1.05, -3, 1.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(e.r * 1.05, 3, 1.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,140,40,0.8)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(-2, 0); ctx.lineTo(-7, 3); ctx.stroke();
      break;
    }
    case 'vampire': {
      glowUnder(ctx, e, e.def.glow, e.r * 2, 0.22);
      ctx.rotate(e.rot + Math.PI / 2);
      // cape
      ctx.fillStyle = '#3d0f22';
      ctx.beginPath();
      ctx.moveTo(0, -e.r * 0.6);
      ctx.quadraticCurveTo(e.r * 1.5, e.r * 0.4, e.r * 0.9, e.r * 1.35);
      ctx.lineTo(-e.r * 0.9, e.r * 1.35);
      ctx.quadraticCurveTo(-e.r * 1.5, e.r * 0.4, 0, -e.r * 0.6);
      ctx.fill();
      // body
      ctx.fillStyle = '#171019';
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.8, 0, TAU); ctx.fill();
      // collar
      ctx.fillStyle = '#5c1030';
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.75, -e.r * 0.35); ctx.lineTo(-e.r * 0.2, -e.r * 0.95); ctx.lineTo(-e.r * 0.05, -e.r * 0.2);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(e.r * 0.75, -e.r * 0.35); ctx.lineTo(e.r * 0.2, -e.r * 0.95); ctx.lineTo(e.r * 0.05, -e.r * 0.2);
      ctx.closePath(); ctx.fill();
      // pale head + eyes
      ctx.fillStyle = '#d8cfc4';
      ctx.beginPath(); ctx.arc(0, -e.r * 0.42, e.r * 0.44, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff2e4d';
      ctx.beginPath(); ctx.arc(-2.4, -e.r * 0.46, 1.7, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(2.4, -e.r * 0.46, 1.7, 0, TAU); ctx.fill();
      break;
    }
    case 'banshee': {
      glowUnder(ctx, e, e.def.glow, e.r * 2.5, e.telegraphed ? 0.55 : 0.3);
      ctx.rotate(e.rot + Math.PI / 2);
      const w = e.t * 5 + e.phase;
      // trailing robe
      ctx.fillStyle = 'rgba(176,108,255,0.5)';
      ctx.beginPath();
      ctx.moveTo(0, -e.r * 1.1);
      ctx.quadraticCurveTo(e.r * 1.05, 0, e.r * 0.55, e.r * (1.3 + Math.sin(w) * 0.25));
      ctx.quadraticCurveTo(0, e.r * (0.9 + Math.cos(w * 1.2) * 0.2), -e.r * 0.55, e.r * (1.3 + Math.cos(w) * 0.25));
      ctx.quadraticCurveTo(-e.r * 1.05, 0, 0, -e.r * 1.1);
      ctx.fill();
      // hood
      ctx.fillStyle = '#2a1440';
      ctx.beginPath(); ctx.arc(0, -e.r * 0.35, e.r * 0.52, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0b0413';
      ctx.beginPath(); ctx.arc(0, -e.r * 0.28, e.r * 0.34, 0, TAU); ctx.fill();
      // wailing mouth
      const mouth = e.telegraphed ? 1.7 : 1;
      ctx.fillStyle = '#e9d5ff';
      ctx.beginPath(); ctx.ellipse(0, -e.r * 0.16, 2.2 * mouth, 3.4 * mouth, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d9b8ff';
      ctx.beginPath(); ctx.arc(-3, -e.r * 0.5, 1.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -e.r * 0.5, 1.4, 0, TAU); ctx.fill();
      break;
    }
    case 'abomination': {
      glowUnder(ctx, e, e.def.glow, e.r * 1.9, 0.2);
      ctx.rotate(e.rot + Math.PI / 2);
      const sway = Math.sin(e.t * 2.2) * 0.06;
      ctx.rotate(sway);
      // stitched bulk
      ctx.fillStyle = '#465c26';
      ctx.beginPath(); ctx.arc(-e.r * 0.3, e.r * 0.15, e.r * 0.78, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(e.r * 0.32, e.r * 0.2, e.r * 0.66, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5b7631';
      ctx.beginPath(); ctx.arc(0, -e.r * 0.15, e.r * 0.85, 0, TAU); ctx.fill();
      // stitched seam
      ctx.strokeStyle = '#241a10'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -e.r * 0.9); ctx.quadraticCurveTo(e.r * 0.2, 0, -e.r * 0.1, e.r * 0.8); ctx.stroke();
      ctx.lineWidth = 1.4;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * 6 - 3, i * 5); ctx.lineTo(i * 6 + 3, i * 5 + 4); ctx.stroke();
      }
      // many eyes
      ctx.fillStyle = '#d6ff8a';
      const eyes = [[-8, -12], [3, -16], [10, -8], [-3, -4], [7, 2]];
      for (const [ex, ey] of eyes) {
        ctx.beginPath(); ctx.arc(ex, ey, 2 + Math.sin(e.t * 3 + ex) * 0.5, 0, TAU); ctx.fill();
      }
      // hanging arms
      ctx.strokeStyle = '#3c5120'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      const arm = Math.sin(e.t * 2.2 + 1) * 4;
      ctx.beginPath(); ctx.moveTo(-e.r * 0.75, 0); ctx.lineTo(-e.r * 1.15, e.r * 0.8 + arm); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(e.r * 0.75, 0); ctx.lineTo(e.r * 1.15, e.r * 0.8 - arm); ctx.stroke();
      break;
    }
  }
}
