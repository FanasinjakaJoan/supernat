// ─── SUPERNAT · the supernatural bestiary ──────────────────────────────────
import { TAU, rand, angleTo } from './utils.js';
import { getGlow } from './particles.js';
import {
  updateHumanoidLocomotion,
  drawShamblerZombie,
  drawVampireHuman,
  drawBansheeHuman,
  drawAbominationColossus,
  drawHellhoundBeast,
  drawWraithPhantom,
} from './humanoid.js';

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

// ─── per-type AI with realistic displacement tracking ──────────────────────
export function updateEnemy(e, g, dt) {
  const p = g.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d, ny = dy / d;
  e.t += dt;
  e.rot = angleTo(e.x, e.y, p.x, p.y);

  const prevX = e.x, prevY = e.y;

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

  // Locomotion velocity tracking
  e.vx = (e.x - prevX) / (dt || 0.016);
  e.vy = (e.y - prevY) / (dt || 0.016);
  updateHumanoidLocomotion(e, dt, false);
}

// ─── 2.5D Humanoid & Creature Vector Renderers ─────────────────────────────
function glowUnder(ctx, e, color, r, a) {
  const s = getGlow(color);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * a;
  ctx.drawImage(s, -r, -r * 0.5, r * 2, r);
  ctx.restore();
}

export function drawEnemy(ctx, e, t) {
  switch (e.type) {
    case 'shambler':
      glowUnder(ctx, e, e.def.glow, e.r * 1.6, 0.16);
      drawShamblerZombie(ctx, e, t);
      break;
    case 'wraith':
      glowUnder(ctx, e, e.def.glow, e.r * 2.2, 0.35);
      drawWraithPhantom(ctx, e, t);
      break;
    case 'hound':
      glowUnder(ctx, e, e.def.glow, e.r * 1.8, e.state === 'charge' ? 0.45 : 0.22);
      drawHellhoundBeast(ctx, e, t);
      break;
    case 'vampire':
      glowUnder(ctx, e, e.def.glow, e.r * 1.8, 0.22);
      drawVampireHuman(ctx, e, t);
      break;
    case 'banshee':
      glowUnder(ctx, e, e.def.glow, e.r * 2.2, e.telegraphed ? 0.5 : 0.28);
      drawBansheeHuman(ctx, e, t);
      break;
    case 'abomination':
      glowUnder(ctx, e, e.def.glow, e.r * 1.8, 0.2);
      drawAbominationColossus(ctx, e, t);
      break;
  }
}
