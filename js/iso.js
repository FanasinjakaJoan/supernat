// ─── SUPERNAT · 2.5D Isometric Engine & City Environment ───────────────────
import { TAU, clamp, lerp, rand, chance, pick, dist2 } from './utils.js';

export const ISO_SCALE = 0.95;
export const ISO_Y_RATIO = 0.5; // standard 2:1 isometric ratio

/** Converts 3D world ground coordinates (wx, wy, wz) to screen coordinates. */
export function worldToScreen(wx, wy, wz = 0, camX = 0, camY = 0, screenW = 1280, screenH = 720) {
  const dx = wx - camX;
  const dy = wy - camY;
  const sx = screenW * 0.5 + (dx - dy) * ISO_SCALE;
  const sy = screenH * 0.5 + (dx + dy) * (ISO_SCALE * ISO_Y_RATIO) - wz;
  return { x: sx, y: sy };
}

/** Converts screen coordinates (sx, sy) to 3D world ground coordinates (wx, wy) at height wz. */
export function screenToWorld(sx, sy, wz = 0, camX = 0, camY = 0, screenW = 1280, screenH = 720) {
  const rx = (sx - screenW * 0.5) / ISO_SCALE;
  const ry = (sy + wz - screenH * 0.5) / (ISO_SCALE * ISO_Y_RATIO);
  const dx = (rx + ry) * 0.5;
  const dy = (ry - rx) * 0.5;
  return { x: camX + dx, y: camY + dy };
}

/** Converts screen directional vector (sx, sy) to uniform ground movement vector (wx, wy). */
export function screenDirToWorld(sx, sy) {
  const mag = Math.hypot(sx, sy);
  if (mag < 1e-4) return { x: 0, y: 0, mag: 0 };
  const nx = sx / mag;
  const ny = sy / mag;
  // Invert 2:1 isometric projection for directional vectors
  const wx = (nx + ny / ISO_Y_RATIO) * 0.5;
  const wy = (ny / ISO_Y_RATIO - nx) * 0.5;
  const wLen = Math.hypot(wx, wy);
  if (wLen < 1e-4) return { x: 0, y: 0, mag: 0 };
  return { x: (wx / wLen) * mag, y: (wy / wLen) * mag, mag };
}

/** Converts world ground angle to screen projected angle. */
export function worldAngleToScreen(angle) {
  const wx = Math.cos(angle);
  const wy = Math.sin(angle);
  const sx = (wx - wy) * ISO_SCALE;
  const sy = (wx + wy) * (ISO_SCALE * ISO_Y_RATIO);
  return Math.atan2(sy, sx);
}

// ─── Isometric City Props & Architecture ────────────────────────────────────
// Generates static urban props for Meridian City (barricades, crates, street lamps, ruined cars)
export function createCityProps(arenaW, arenaH) {
  const props = [];
  const cx = arenaW * 0.5;
  const cy = arenaH * 0.5;

  // Concrete Jersey Barricades around combat sectors
  const barricades = [
    { x: cx - 240, y: cy - 140, rot: 0 },
    { x: cx - 180, y: cy - 140, rot: 0 },
    { x: cx + 180, y: cy + 140, rot: 0 },
    { x: cx + 240, y: cy + 140, rot: 0 },
    { x: cx - 160, y: cy + 220, rot: Math.PI / 2 },
    { x: cx + 160, y: cy - 220, rot: Math.PI / 2 },
    { x: cx - 360, y: cy + 60, rot: 0 },
    { x: cx + 360, y: cy - 60, rot: 0 },
  ];
  for (const b of barricades) {
    props.push({
      kind: 'barricade',
      x: b.x, y: b.y, rot: b.rot,
      w: 48, l: 18, h: 22,
      r: 16,
    });
  }

  // Supply Crates & Weapon Cache Lockers
  const crates = [
    { x: cx - 290, y: cy - 160, size: 26, h: 26, type: 'military' },
    { x: cx - 290, y: cy - 130, size: 22, h: 20, type: 'wood' },
    { x: cx + 290, y: cy + 160, size: 28, h: 28, type: 'military' },
    { x: cx + 320, y: cy + 150, size: 20, h: 18, type: 'wood' },
    { x: cx - 180, y: cy + 260, size: 24, h: 22, type: 'metal' },
    { x: cx + 200, y: cy - 250, size: 26, h: 24, type: 'military' },
  ];
  for (const c of crates) {
    props.push({
      kind: 'crate',
      x: c.x, y: c.y,
      w: c.size, l: c.size, h: c.h,
      r: c.size * 0.6,
      subType: c.type,
    });
  }

  // Street Lampposts with Halogen Glow
  const lamps = [
    { x: cx - 220, y: cy - 260 },
    { x: cx + 220, y: cy - 260 },
    { x: cx - 220, y: cy + 260 },
    { x: cx + 220, y: cy + 260 },
    { x: cx - 440, y: cy },
    { x: cx + 440, y: cy },
  ];
  for (const l of lamps) {
    props.push({
      kind: 'lamppost',
      x: l.x, y: l.y,
      h: 80,
      r: 10,
    });
  }

  // Burned-out Tactical Vehicles
  props.push({
    kind: 'vehicle',
    x: cx - 340, y: cy - 220,
    rot: -0.3,
    w: 80, l: 42, h: 36,
    r: 32,
    color: '#1a1824',
    name: 'Interceptor APC',
  });
  props.push({
    kind: 'vehicle',
    x: cx + 350, y: cy + 220,
    rot: 0.5,
    w: 74, l: 38, h: 32,
    r: 28,
    color: '#281a18',
    name: 'Wrecked Sedan',
  });

  return props;
}

// ─── Pre-rendered Isometric City Ground & Decals ────────────────────────────
export function buildIsoBackground(arenaW, arenaH, dpr) {
  const bg = document.createElement('canvas');
  bg.width = Math.round(arenaW * dpr);
  bg.height = Math.round(arenaH * dpr);
  const g = bg.getContext('2d');
  g.scale(dpr, dpr);

  // Deep apocalyptic dark asphalt
  g.fillStyle = '#0a0812';
  g.fillRect(0, 0, arenaW, arenaH);

  // Subtle isometric diamond ground grid tiles (64x64 world units)
  const tileSize = 60;
  g.strokeStyle = 'rgba(38, 28, 54, 0.4)';
  g.lineWidth = 1;
  for (let x = 0; x <= arenaW; x += tileSize) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, arenaH); g.stroke();
  }
  for (let y = 0; y <= arenaH; y += tileSize) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(arenaW, y); g.stroke();
  }

  const cx = arenaW * 0.5;
  const cy = arenaH * 0.5;

  // Main Boulevard & Cross Avenues in World Coordinates
  // (In isometric projection, orthogonal world roads become diagonal isometric avenues!)
  const roadW = 200;

  // Road 1: Along X-axis
  g.fillStyle = '#120e1c';
  g.fillRect(0, cy - roadW * 0.5, arenaW, roadW);
  // Road 2: Along Y-axis
  g.fillRect(cx - roadW * 0.5, 0, roadW, arenaH);

  // Raised Concrete Sidewalks & Curbs
  g.fillStyle = '#1a1528';
  // 4 Quadrant Sidewalks
  g.fillRect(0, 0, cx - roadW * 0.5, cy - roadW * 0.5);
  g.fillRect(cx + roadW * 0.5, 0, arenaW - (cx + roadW * 0.5), cy - roadW * 0.5);
  g.fillRect(0, cy + roadW * 0.5, cx - roadW * 0.5, arenaH - (cy + roadW * 0.5));
  g.fillRect(cx + roadW * 0.5, cy + roadW * 0.5, arenaW - (cx + roadW * 0.5), arenaH - (cy + roadW * 0.5));

  // Curb border lines
  g.strokeStyle = '#322846';
  g.lineWidth = 4;
  g.strokeRect(0, 0, cx - roadW * 0.5, cy - roadW * 0.5);
  g.strokeRect(cx + roadW * 0.5, 0, arenaW - (cx + roadW * 0.5), cy - roadW * 0.5);
  g.strokeRect(0, cy + roadW * 0.5, cx - roadW * 0.5, arenaH - (cy + roadW * 0.5));
  g.strokeRect(cx + roadW * 0.5, cy + roadW * 0.5, arenaW - (cx + roadW * 0.5), arenaH - (cy + roadW * 0.5));

  // Yellow Double Centerlines (weathered)
  g.strokeStyle = 'rgba(214, 175, 75, 0.45)';
  g.lineWidth = 2.5;
  g.setLineDash([28, 22]);
  // X road
  g.beginPath(); g.moveTo(0, cy - 3); g.lineTo(cx - roadW * 0.5 - 20, cy - 3); g.stroke();
  g.beginPath(); g.moveTo(cx + roadW * 0.5 + 20, cy - 3); g.lineTo(arenaW, cy - 3); g.stroke();
  g.beginPath(); g.moveTo(0, cy + 3); g.lineTo(cx - roadW * 0.5 - 20, cy + 3); g.stroke();
  g.beginPath(); g.moveTo(cx + roadW * 0.5 + 20, cy + 3); g.lineTo(arenaW, cy + 3); g.stroke();
  // Y road
  g.beginPath(); g.moveTo(cx - 3, 0); g.lineTo(cx - 3, cy - roadW * 0.5 - 20); g.stroke();
  g.beginPath(); g.moveTo(cx - 3, cy + roadW * 0.5 + 20); g.lineTo(cx - 3, arenaH); g.stroke();
  g.beginPath(); g.moveTo(cx + 3, 0); g.lineTo(cx + 3, cy - roadW * 0.5 - 20); g.stroke();
  g.beginPath(); g.moveTo(cx + 3, cy + roadW * 0.5 + 20); g.lineTo(cx + 3, arenaH); g.stroke();
  g.setLineDash([]);

  // Pedestrian Zebra Crosswalks at intersection
  g.fillStyle = 'rgba(220, 220, 235, 0.35)';
  for (let i = -70; i <= 70; i += 22) {
    // West crosswalk
    g.fillRect(cx - roadW * 0.5 - 18, cy + i - 6, 14, 12);
    // East crosswalk
    g.fillRect(cx + roadW * 0.5 + 4, cy + i - 6, 14, 12);
    // North crosswalk
    g.fillRect(cx + i - 6, cy - roadW * 0.5 - 18, 12, 14);
    // South crosswalk
    g.fillRect(cx + i - 6, cy + roadW * 0.5 + 4, 12, 14);
  }

  // Cast iron manhole covers
  const manholes = [
    { x: cx - 90, y: cy - 80 },
    { x: cx + 110, y: cy + 70 },
    { x: cx - 220, y: cy + 120 },
    { x: cx + 240, y: cy - 110 },
  ];
  for (const m of manholes) {
    g.fillStyle = '#221a2c';
    g.beginPath(); g.arc(m.x, m.y, 14, 0, TAU); g.fill();
    g.strokeStyle = '#3e3050'; g.lineWidth = 2;
    g.beginPath(); g.arc(m.x, m.y, 14, 0, TAU); g.stroke();
    g.beginPath(); g.arc(m.x, m.y, 7, 0, TAU); g.stroke();
  }

  // Ruined asphalt cracks radiating outward
  g.strokeStyle = 'rgba(6, 4, 10, 0.8)';
  g.lineWidth = 1.8;
  for (let i = 0; i < 40; i++) {
    let x = rand(arenaW), y = rand(arenaH);
    g.beginPath(); g.moveTo(x, y);
    const segs = 3 + randInt(0, 4);
    for (let s = 0; s < segs; s++) {
      x += rand(-35, 35); y += rand(-35, 35);
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // Toxic oily water puddles
  for (let i = 0; i < 16; i++) {
    const px = rand(arenaW * 0.1, arenaW * 0.9);
    const py = rand(arenaH * 0.1, arenaH * 0.9);
    const rx = rand(24, 60);
    const ry = rand(14, 34);
    const grad = g.createRadialGradient(px, py, 0, px, py, rx);
    grad.addColorStop(0, 'rgba(20, 36, 24, 0.45)');
    grad.addColorStop(0.7, 'rgba(16, 22, 32, 0.35)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = grad;
    g.beginPath(); g.ellipse(px, py, rx, ry, rand(TAU), 0, TAU); g.fill();
  }

  // Grit & gravel speckle noise
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = chance(0.5) ? 'rgba(120, 105, 145, 0.06)' : 'rgba(0, 0, 0, 0.12)';
    g.fillRect(rand(arenaW), rand(arenaH), rand(1, 2.5), rand(1, 2.5));
  }

  return bg;
}

// ─── Drawing Isometric 3D Urban Props ───────────────────────────────────────
export function drawProp(ctx, p, camX, camY, screenW, screenH, time) {
  const sc = worldToScreen(p.x, p.y, 0, camX, camY, screenW, screenH);
  const sx = sc.x, sy = sc.y;

  // Frustum culling
  if (sx < -120 || sx > screenW + 120 || sy < -120 || sy > screenH + 120) return;

  ctx.save();
  ctx.translate(sx, sy);

  switch (p.kind) {
    case 'barricade': {
      // 3D Extruded Concrete Jersey Barrier
      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 4, p.w * 0.7, p.l * 0.6, 0, 0, TAU);
      ctx.fill();

      const bw = p.w * 0.65;
      const bl = p.l * 0.55;
      const bh = p.h;

      // Front Face
      ctx.fillStyle = '#262230';
      ctx.beginPath();
      ctx.moveTo(-bw, -bl);
      ctx.lineTo(bw, bl);
      ctx.lineTo(bw, bl - bh);
      ctx.lineTo(-bw, -bl - bh);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#181422'; ctx.lineWidth = 1.2; ctx.stroke();

      // Top Face
      ctx.fillStyle = '#443c54';
      ctx.beginPath();
      ctx.moveTo(-bw, -bl - bh);
      ctx.lineTo(bw, bl - bh);
      ctx.lineTo(bw * 0.6, bl * 0.6 - bh - 6);
      ctx.lineTo(-bw * 0.6, -bl * 0.6 - bh - 6);
      ctx.closePath();
      ctx.fill();

      // Yellow/Black warning stripes along front face
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = '#c8a832';
      ctx.lineWidth = 6;
      for (let i = -bw * 1.5; i < bw * 1.5; i += 18) {
        ctx.beginPath();
        ctx.moveTo(i, -bh);
        ctx.lineTo(i + 14, bh);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    case 'crate': {
      // 3D Isometric Wooden / Metal Supply Crate
      const cw = p.w * 0.6;
      const cl = p.l * 0.35;
      const ch = p.h;

      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath();
      ctx.ellipse(2, 4, cw * 1.2, cl * 1.2, 0, 0, TAU);
      ctx.fill();

      const isMil = p.subType === 'military';
      const colTop = isMil ? '#384628' : '#4d3b26';
      const colLeft = isMil ? '#26301a' : '#382a1b';
      const colRight = isMil ? '#1a2212' : '#271c12';

      // Left Face
      ctx.fillStyle = colLeft;
      ctx.beginPath();
      ctx.moveTo(-cw, 0);
      ctx.lineTo(0, cl);
      ctx.lineTo(0, cl - ch);
      ctx.lineTo(-cw, -ch);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();

      // Right Face
      ctx.fillStyle = colRight;
      ctx.beginPath();
      ctx.moveTo(0, cl);
      ctx.lineTo(cw, 0);
      ctx.lineTo(cw, -ch);
      ctx.lineTo(0, cl - ch);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Top Face
      ctx.fillStyle = colTop;
      ctx.beginPath();
      ctx.moveTo(0, -ch - cl);
      ctx.lineTo(cw, -ch);
      ctx.lineTo(0, -ch + cl);
      ctx.lineTo(-cw, -ch);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Stenciled Veil Order / Military Symbol on Top
      ctx.fillStyle = isMil ? '#9dff20' : '#c89d55';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(0, -ch, 4, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }

    case 'lamppost': {
      // Tall 2.5D City Lamppost with glowing halogen cone
      const h = p.h;

      // Base plate on ground
      ctx.fillStyle = '#1c1626';
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 4, 0, 0, TAU); ctx.fill();

      // Vertical steel pole extending UP
      ctx.strokeStyle = '#2d253c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -h);
      ctx.stroke();

      // Lamp arm curving out
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -h);
      ctx.quadraticCurveTo(8, -h - 8, 16, -h - 4);
      ctx.stroke();

      // Lantern housing
      ctx.fillStyle = '#3e3452';
      ctx.fillRect(12, -h - 6, 8, 5);

      // Bulb
      const flick = 0.85 + 0.15 * Math.sin(time * 18 + p.x);
      ctx.fillStyle = `rgba(255, 235, 170, ${flick})`;
      ctx.beginPath(); ctx.arc(16, -h - 1, 3.5, 0, TAU); ctx.fill();

      // Light puddle on the ground
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(16, 12, 0, 16, 12, 45);
      gr.addColorStop(0, `rgba(255, 210, 110, ${0.14 * flick})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.ellipse(16, 12, 55, 30, 0, 0, TAU); ctx.fill();
      ctx.restore();
      break;
    }

    case 'vehicle': {
      // 3D Isometric Burned-out Police Cruiser / Tactical Vehicle
      const vw = p.w * 0.55;
      const vl = p.l * 0.45;
      const vh = p.h;

      // Ground Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
      ctx.beginPath();
      ctx.ellipse(0, 6, vw * 1.25, vl * 1.3, 0, 0, TAU);
      ctx.fill();

      // Lower Hull
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(-vw, 0);
      ctx.lineTo(0, vl);
      ctx.lineTo(vw, 0);
      ctx.lineTo(0, -vl);
      ctx.closePath();
      ctx.fill();

      // Extruded Body (Front / Side faces)
      ctx.fillStyle = '#161420';
      ctx.beginPath();
      ctx.moveTo(-vw, 0); ctx.lineTo(0, vl); ctx.lineTo(0, vl - vh * 0.6); ctx.lineTo(-vw, -vh * 0.6);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#100e18';
      ctx.beginPath();
      ctx.moveTo(0, vl); ctx.lineTo(vw, 0); ctx.lineTo(vw, -vh * 0.6); ctx.lineTo(0, vl - vh * 0.6);
      ctx.closePath(); ctx.fill();

      // Hood & Cabin Top
      ctx.fillStyle = '#221e2c';
      ctx.beginPath();
      ctx.moveTo(-vw, -vh * 0.6);
      ctx.lineTo(0, vl - vh * 0.6);
      ctx.lineTo(vw, -vh * 0.6);
      ctx.lineTo(0, -vl - vh * 0.6);
      ctx.closePath();
      ctx.fill();

      // Cabin Roof
      const rw = vw * 0.6;
      const rl = vl * 0.55;
      ctx.fillStyle = '#181522';
      ctx.beginPath();
      ctx.moveTo(-rw, -vh);
      ctx.lineTo(0, rl - vh);
      ctx.lineTo(rw, -vh);
      ctx.lineTo(0, -rl - vh);
      ctx.closePath();
      ctx.fill();

      // Shattered Windshield (Cyan reflection)
      ctx.fillStyle = 'rgba(123, 233, 255, 0.25)';
      ctx.beginPath();
      ctx.moveTo(-rw, -vh);
      ctx.lineTo(0, rl - vh);
      ctx.lineTo(0, vl - vh * 0.6);
      ctx.lineTo(-vw * 0.7, -vh * 0.6);
      ctx.closePath();
      ctx.fill();

      // Flickering siren light bar
      const siren = Math.sin(time * 8 + p.x) > 0;
      ctx.fillStyle = siren ? 'rgba(255, 46, 77, 0.85)' : 'rgba(123, 233, 255, 0.85)';
      ctx.fillRect(-6, -vh - 5, 12, 3);
      break;
    }
  }

  ctx.restore();
}
