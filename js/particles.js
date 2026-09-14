// ─── SUPERNAT · particles, floating text, cached glow sprites ──────────────
import { CFG } from './config.js';
import { rand, TAU } from './utils.js';

const glowCache = new Map();
/** Cheap tinted radial glow sprite, cached per color. */
export function getGlow(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rad.addColorStop(0, color);
  rad.addColorStop(0.35, color);
  rad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

export function drawGlow(ctx, x, y, color, radius, alpha = 1) {
  const s = getGlow(color);
  const ga = ctx.globalAlpha;
  const gc = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = ga * alpha;
  ctx.drawImage(s, x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = ga;
  ctx.globalCompositeOperation = gc;
}

export class ParticleSys {
  constructor() { this.p = []; }
  clear() { this.p.length = 0; }

  add(o) {
    if (this.p.length >= CFG.particles.max) this.p.splice(0, 6);
    this.p.push(o);
  }

  /** Directional burst of sparks. */
  burst(x, y, color, n = 10, spd = 200, life = 0.5, size = 2.6, ang = null, arc = TAU) {
    for (let i = 0; i < n; i++) {
      const a = ang === null ? rand(TAU) : ang + rand(-arc / 2, arc / 2);
      const s = spd * rand(0.3, 1);
      const l = life * rand(0.55, 1.15);
      this.add({
        kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: l, max: l, size: size * rand(0.6, 1.3), color, drag: 3.2, grav: 0,
      });
    }
  }

  smoke(x, y, color, n = 5, spd = 40, life = 0.9, size = 9) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), s = spd * rand(0.2, 1);
      const l = life * rand(0.6, 1.2);
      this.add({
        kind: 'smoke', x: x + rand(-4, 4), y: y + rand(-4, 4),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 12,
        life: l, max: l, size: size * rand(0.6, 1.4), color, drag: 1.6, grav: -14,
      });
    }
  }

  ring(x, y, color, size = 46, life = 0.35) {
    this.add({ kind: 'ring', x, y, vx: 0, vy: 0, life, max: life, size, color, drag: 0, grav: 0 });
  }

  shell(x, y, ang) {
    const a = ang + Math.PI / 2 + rand(-0.4, 0.4);
    this.add({
      kind: 'shell', x, y, vx: Math.cos(a) * rand(70, 130), vy: Math.sin(a) * rand(70, 130) - 60,
      life: 0.55, max: 0.55, size: 2.2, color: '#d9a441', drag: 2.2, grav: 620,
    });
  }

  update(dt) {
    const p = this.p;
    for (let i = p.length - 1; i >= 0; i--) {
      const o = p[i];
      o.life -= dt;
      if (o.life <= 0) { p.splice(i, 1); continue; }
      if (o.drag) { const d = Math.max(0, 1 - o.drag * dt); o.vx *= d; o.vy *= d; }
      if (o.grav) o.vy += o.grav * dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
    }
  }

  draw(ctx) {
    const p = this.p;
    // pass 1: soft smoke (normal blend)
    for (let i = 0; i < p.length; i++) {
      const o = p[i];
      if (o.kind !== 'smoke') continue;
      const a = (o.life / o.max) * 0.26;
      ctx.globalAlpha = a;
      ctx.fillStyle = o.color;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.size * (1.6 - o.life / o.max), 0, TAU);
      ctx.fill();
    }
    // pass 2: additive sparks / rings / shells
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < p.length; i++) {
      const o = p[i];
      const k = o.life / o.max;
      if (o.kind === 'spark') {
        ctx.globalAlpha = k;
        ctx.strokeStyle = o.color;
        ctx.lineWidth = Math.max(0.6, o.size * k);
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(o.x - o.vx * 0.02, o.y - o.vy * 0.02);
        ctx.stroke();
      } else if (o.kind === 'ring') {
        ctx.globalAlpha = k * 0.9;
        ctx.strokeStyle = o.color;
        ctx.lineWidth = 2.4 * k + 0.6;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.size * (1.35 - k), 0, TAU);
        ctx.stroke();
      } else if (o.kind === 'shell') {
        ctx.globalAlpha = k;
        ctx.fillStyle = o.color;
        ctx.fillRect(o.x - 1.4, o.y - 1, 2.8, 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

export class FloatText {
  constructor() { this.list = []; }
  clear() { this.list.length = 0; }
  add(x, y, txt, color = '#fff', size = 13) {
    if (this.list.length > 40) this.list.shift();
    this.list.push({ x, y, txt, color, size, life: 0.9, max: 0.9, vy: -46 });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      t.life -= dt;
      if (t.life <= 0) { this.list.splice(i, 1); continue; }
      t.y += t.vy * dt;
      t.vy *= 1 - 1.6 * dt;
    }
  }
  draw(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.list) {
      const k = t.life / t.max;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.font = `700 ${t.size}px Rajdhani, 'Segoe UI', sans-serif`;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(t.txt, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.txt, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
