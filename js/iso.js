// ─── SUPERNAT · 2.5D Isometric Engine & Madagascar Environment ─────────────
// Reconstructs the authentic geometry, architecture, and vegetation of
// Cimetière d'Anjanahary & Ampasapito in Antananarivo, Madagascar
// (OpenStreetMap ways 45810357, 76181286, 45980202, 1291650717, 301637375).

import { TAU, clamp, lerp, rand, chance, pick, dist2 } from './utils.js';
import { ANJANAHARY_GEO } from './data/anjanaharyMapData.js';

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

// ─── Anjanahary Cemetery & Ampasapito Props Generator ───────────────────────
// Generates semi-realistic Madagascar necropolis structures:
// - Malagasy family vaults ('fasana') across the 66 historical lots
// - Carré Militaire war monument ('monument') & military crosses ('military_grave')
// - Traditional clay & stone perimeter walls ('tamboho')
// - Monumental cemetery iron gate ('vavahady')
// - Ampasapito artisanal stonecutters' benches ('stonemason_bench')
// - Malagasy public transport ('taxi_be', 'taxi_ville')
// - Highland flora (Jacaranda with violet blossoms, Italian Cypress, Lemon Eucalyptus)
export function createCityProps(arenaW, arenaH) {
  const props = [];
  const W = arenaW || 2400;
  const H = arenaH || 2200;

  // ── 1. North Perimeter & Vavahady Lehibe (Làlana Rasoamiaramanana) ────────
  // Brick & clay perimeter walls ('tamboho')
  const northWalls = [
    { x: 260, y: 290, w: 220, l: 14, h: 26 },
    { x: 520, y: 290, w: 240, l: 14, h: 26 },
    { x: 780, y: 290, w: 220, l: 14, h: 26 },
    { x: 1360, y: 290, w: 220, l: 14, h: 26 },
    { x: 1620, y: 290, w: 240, l: 14, h: 26 },
    { x: 1880, y: 290, w: 220, l: 14, h: 26 },
  ];
  for (const w of northWalls) {
    props.push({ kind: 'tamboho', x: w.x, y: w.y, w: w.w, l: w.l, h: w.h, r: 18, rot: 0 });
  }

  // Grand North Gate ('Vavahady Lehibe') on Làlana Rasoamiaramanana
  props.push({
    kind: 'vavahady',
    x: 1080, y: 290,
    w: 96, l: 20, h: 54, r: 28,
    name: 'Vavahady Lehibe (North Gate)',
  });

  // Guard Pavilion / Keeper's office
  props.push({
    kind: 'fasana',
    style: 'colonial',
    x: 960, y: 340,
    w: 48, l: 32, h: 32, r: 22,
    inscription: 'FIAMBENANA · BMH',
    hasFlowers: false,
    hasCross: false,
  });

  // Flower and candle vendors' tables outside the gate
  props.push({
    kind: 'crate',
    subType: 'wood',
    x: 1020, y: 340,
    w: 26, l: 18, h: 16, r: 14,
    name: 'Flower Stalls',
  });

  // ── 2. Allée Centrale Pavée (OSM Way 45980202) ────────────────────────────
  // Flanked on left & right by tall Italian Cypress sentinels and iron lanterns
  const avenueRows = [480, 720, 960, 1200, 1440, 1680, 1920];
  for (const ay of avenueRows) {
    // West flanking cypress
    props.push({ kind: 'tree', treeType: 'cypress', x: 1010, y: ay, h: 76, r: 12 });
    // East flanking cypress
    props.push({ kind: 'tree', treeType: 'cypress', x: 1190, y: ay, h: 76, r: 12 });
  }

  // Ornate cemetery lampposts along the central avenue
  const lanterns = [
    { x: 1030, y: 600 },
    { x: 1170, y: 840 },
    { x: 1030, y: 1320 },
    { x: 1170, y: 1560 },
    { x: 1040, y: 1800 },
  ];
  for (const l of lanterns) {
    props.push({ kind: 'lamppost', x: l.x, y: l.y, h: 72, r: 10 });
  }

  // Stately Jacaranda trees blooming with purple canopies along the avenue
  props.push({ kind: 'tree', treeType: 'jacaranda', x: 950, y: 840, h: 62, r: 22 });
  props.push({ kind: 'tree', treeType: 'jacaranda', x: 1260, y: 640, h: 64, r: 22 });
  props.push({ kind: 'tree', treeType: 'jacaranda', x: 960, y: 1520, h: 60, r: 22 });
  props.push({ kind: 'tree', treeType: 'jacaranda', x: 1270, y: 1380, h: 62, r: 22 });

  // ── 3. Carré Militaire d'Anjanahary (Lots 38, 38bis, 39) ──────────────────
  // Central War Memorial Obelisk ('Tsangambato ho an\'ireo Mahery Fo')
  props.push({
    kind: 'monument',
    x: 1680, y: 920,
    h: 96, r: 26,
    name: 'Monument aux Morts (Tsangambato)',
  });

  // 4 Rows of aligned military war graves (Tirailleurs Malgaches & French soldiers)
  const graveXs = [1510, 1570, 1630, 1730, 1790, 1850];
  const graveYs = [800, 860, 980, 1040];
  for (const gy of graveYs) {
    for (const gx of graveXs) {
      props.push({
        kind: 'military_grave',
        x: gx, y: gy,
        h: 22, r: 8,
      });
    }
  }

  // Formal cypress trees framing the Carré Militaire
  props.push({ kind: 'tree', treeType: 'cypress', x: 1450, y: 770, h: 74, r: 12 });
  props.push({ kind: 'tree', treeType: 'cypress', x: 1910, y: 770, h: 74, r: 12 });
  props.push({ kind: 'tree', treeType: 'cypress', x: 1450, y: 1070, h: 74, r: 12 });
  props.push({ kind: 'tree', treeType: 'cypress', x: 1910, y: 1070, h: 74, r: 12 });

  // ── 4. Faritra Fasana Nentin-drazana (66 Parcels / Family Vaults) ─────────
  // West Labyrinth (Lots 1 through 35): dense multi-tiered granite family vaults
  const westVaults = [
    // Patriarchal grand vaults ('fasana' style: 'grand', multi-tier granite plinths)
    { x: 400, y: 520, w: 58, l: 38, h: 36, r: 30, style: 'grand', ins: 'RANDRIANARISOA', flow: true },
    { x: 740, y: 560, w: 56, l: 36, h: 34, r: 28, style: 'grand', ins: 'RAZAFINDRAKOTO', flow: false },
    { x: 360, y: 880, w: 60, l: 40, h: 38, r: 30, style: 'grand', ins: 'ANDRIAMAHAZO', flow: true },
    { x: 700, y: 920, w: 58, l: 38, h: 36, r: 28, style: 'grand', ins: 'RATSIMBAZAFY', flow: true },
    { x: 420, y: 1240, w: 62, l: 40, h: 38, r: 30, style: 'grand', ins: 'RABEMANANJARA', flow: true },
    { x: 760, y: 1280, w: 58, l: 38, h: 36, r: 28, style: 'grand', ins: 'RAVELOSON', flow: false },
    { x: 380, y: 1600, w: 60, l: 40, h: 38, r: 30, style: 'grand', ins: 'RAJAONARIVELO', flow: true },
    { x: 720, y: 1680, w: 58, l: 38, h: 36, r: 28, style: 'grand', ins: 'RAMANANTSOA', flow: false },

    // Standard Merina family vaults (style: 'standard')
    { x: 560, y: 480, w: 46, l: 32, h: 28, r: 24, style: 'standard', ins: 'RAKOTOMALALA', flow: true },
    { x: 280, y: 680, w: 44, l: 30, h: 26, r: 22, style: 'standard', ins: 'ANDRIANINA', flow: false },
    { x: 560, y: 720, w: 46, l: 32, h: 28, r: 24, style: 'standard', ins: 'RANDRIAMAMONJY', flow: true },
    { x: 860, y: 740, w: 44, l: 30, h: 26, r: 22, style: 'standard', ins: 'RASOARIMALALA', flow: false },
    { x: 260, y: 1060, w: 46, l: 32, h: 28, r: 24, style: 'standard', ins: 'RAKOTOVAO', flow: true },
    { x: 530, y: 1080, w: 46, l: 32, h: 28, r: 24, style: 'standard', ins: 'ANDRIAMAMPIANINA', flow: false },
    { x: 850, y: 1100, w: 44, l: 30, h: 26, r: 22, style: 'standard', ins: 'RAZANAKOLONA', flow: true },
    { x: 280, y: 1420, w: 44, l: 30, h: 26, r: 22, style: 'standard', ins: 'RANAIVOSON', flow: false },
    { x: 560, y: 1460, w: 46, l: 32, h: 28, r: 24, style: 'standard', ins: 'RAHARINOSY', flow: true },
    { x: 860, y: 1480, w: 44, l: 30, h: 26, r: 22, style: 'standard', ins: 'RAMAMONJISOA', flow: false },
    { x: 540, y: 1820, w: 46, l: 32, h: 28, r: 24, style: 'standard', ins: 'ANDRIANARIVO', flow: true },
    { x: 840, y: 1860, w: 44, l: 30, h: 26, r: 22, style: 'standard', ins: 'RAZAFIMAHEFA', flow: false },

    // Historic 1880 Colonial mausoleums (Fasam-bahiny)
    { x: 300, y: 1260, w: 52, l: 34, h: 32, r: 26, style: 'colonial', ins: '1888 · DE COTTE', flow: false },
    { x: 460, y: 1380, w: 50, l: 34, h: 32, r: 26, style: 'colonial', ins: '1895 · DE LANUX', flow: false },
    { x: 320, y: 1500, w: 54, l: 36, h: 34, r: 28, style: 'colonial', ins: '1902 · FOSSARD', flow: false },
  ];

  for (const v of westVaults) {
    props.push({
      kind: 'fasana',
      x: v.x, y: v.y,
      w: v.w, l: v.l, h: v.h,
      r: v.r,
      style: v.style,
      inscription: v.ins,
      hasFlowers: v.flow,
      hasCross: true,
    });
  }

  // Western vegetation (Jacaranda with purple petal clusters and Lemon Eucalyptus)
  const westTrees = [
    { type: 'jacaranda', x: 540, y: 600, h: 62 },
    { type: 'jacaranda', x: 310, y: 880, h: 60 },
    { type: 'jacaranda', x: 630, y: 1180, h: 64 },
    { type: 'jacaranda', x: 340, y: 1340, h: 58 },
    { type: 'jacaranda', x: 650, y: 1560, h: 62 },
    { type: 'eucalyptus', x: 220, y: 500, h: 86 },
    { type: 'eucalyptus', x: 210, y: 960, h: 90 },
    { type: 'eucalyptus', x: 220, y: 1420, h: 88 },
    { type: 'eucalyptus', x: 210, y: 1860, h: 86 },
  ];
  for (const t of westTrees) {
    props.push({ kind: 'tree', treeType: t.type, x: t.x, y: t.y, h: t.h, r: 16 });
  }

  // Eastern & South-Eastern Family Plots (Parcels 40 to 66)
  const eastVaults = [
    { x: 1540, y: 1360, w: 58, l: 38, h: 36, r: 28, style: 'grand', ins: 'RAKOTOMANGA', flow: true },
    { x: 1880, y: 1420, w: 56, l: 36, h: 34, r: 28, style: 'grand', ins: 'ANDRIAMBOLOLONA', flow: false },
    { x: 1500, y: 1720, w: 58, l: 38, h: 36, r: 28, style: 'grand', ins: 'RASOANAIVO', flow: true },
    { x: 1840, y: 1780, w: 56, l: 36, h: 34, r: 28, style: 'grand', ins: 'RANDRIAMIFIDY', flow: false },
    { x: 1720, y: 1320, w: 46, l: 32, h: 28, r: 24, style: 'standard', ins: 'RAZANAMPARANY', flow: true },
    { x: 1440, y: 1540, w: 44, l: 30, h: 26, r: 22, style: 'standard', ins: 'RAKOTONDRASOA', flow: false },
    { x: 1700, y: 1560, w: 46, l: 32, h: 28, r: 24, style: 'standard', ins: 'ANDRIANASOLO', flow: true },
    { x: 1940, y: 1600, w: 44, l: 30, h: 26, r: 22, style: 'standard', ins: 'RATOVONJANAHARY', flow: false },
    { x: 1640, y: 1880, w: 46, l: 32, h: 28, r: 24, style: 'standard', ins: 'RABENATOANDRO', flow: true },
    { x: 1920, y: 1920, w: 44, l: 30, h: 26, r: 22, style: 'standard', ins: 'RAKOTOARISOA', flow: false },
  ];
  for (const v of eastVaults) {
    props.push({
      kind: 'fasana',
      x: v.x, y: v.y,
      w: v.w, l: v.l, h: v.h,
      r: v.r,
      style: v.style,
      inscription: v.ins,
      hasFlowers: v.flow,
      hasCross: true,
    });
  }

  // Eastern Jacaranda and Cypress trees
  props.push({ kind: 'tree', treeType: 'jacaranda', x: 1600, y: 1240, h: 62, r: 22 });
  props.push({ kind: 'tree', treeType: 'jacaranda', x: 1820, y: 1520, h: 64, r: 22 });
  props.push({ kind: 'tree', treeType: 'jacaranda', x: 1690, y: 1720, h: 60, r: 22 });
  props.push({ kind: 'tree', treeType: 'cypress', x: 1450, y: 1380, h: 74, r: 12 });
  props.push({ kind: 'tree', treeType: 'cypress', x: 1980, y: 1480, h: 74, r: 12 });
  props.push({ kind: 'tree', treeType: 'cypress', x: 1470, y: 1860, h: 74, r: 12 });

  // ── 5. Terminus Ampasapito & Artisanal Stonemasons (East Border) ──────────
  // Eastern gate opening toward Ampasapito
  props.push({
    kind: 'vavahady',
    x: 2160, y: 340,
    w: 80, l: 18, h: 48, r: 26,
    name: 'Vavahady Ampasapito (East Gate)',
  });

  // Artisanal Stonemason workshops sculpting funerary steles
  props.push({
    kind: 'stonemason_bench',
    x: 2200, y: 420,
    w: 44, l: 30, h: 20, r: 20,
    name: 'Mpanao Vato Fasana (Stonecutters)',
  });
  props.push({
    kind: 'stonemason_bench',
    x: 2270, y: 480,
    w: 42, l: 28, h: 20, r: 18,
    name: 'Stonecutters Bench 2',
  });

  // Raw granite slabs and cut cross blanks awaiting delivery
  props.push({
    kind: 'crate',
    subType: 'stone_slabs',
    x: 2140, y: 460,
    w: 28, l: 24, h: 22, r: 18,
    name: 'Raw Granite Blocks',
  });
  props.push({
    kind: 'crate',
    subType: 'stone_slabs',
    x: 2240, y: 540,
    w: 26, l: 22, h: 18, r: 16,
    name: 'Carved Headstone Blanks',
  });

  // Authentic Malagasy public transport vehicles parked along the Ampasapito road:
  // 1) Taxi-Be (Mercedes 207D minibus, Line 154: Ampasapito - Anjanahary)
  props.push({
    kind: 'taxi_be',
    x: 2260, y: 230,
    rot: -0.15,
    w: 92, l: 44, h: 42, r: 36,
    line: '154',
    name: 'Taxi-Be 154 (Mercedes 207D)',
  });

  // 2) Taxi-Ville (Madagascar cream Renault 4L City Taxi)
  props.push({
    kind: 'taxi_ville',
    x: 2080, y: 220,
    rot: 0.2,
    w: 68, l: 34, h: 30, r: 24,
    name: 'Taxi-Ville 4L',
  });

  // Roadside eucalyptus near Ampasapito
  props.push({ kind: 'tree', treeType: 'eucalyptus', x: 2030, y: 150, h: 84, r: 16 });
  props.push({ kind: 'tree', treeType: 'eucalyptus', x: 2330, y: 150, h: 86, r: 16 });

  // ── 6. South Perimeter & HOMI Soavinandriana Military Hospital Border ──────
  const southWalls = [
    { x: 300, y: 2100, w: 260, l: 14, h: 26 },
    { x: 600, y: 2100, w: 260, l: 14, h: 26 },
    { x: 900, y: 2100, w: 260, l: 14, h: 26 },
    { x: 1440, y: 2100, w: 260, l: 14, h: 26 },
    { x: 1740, y: 2100, w: 260, l: 14, h: 26 },
    { x: 2040, y: 2100, w: 260, l: 14, h: 26 },
  ];
  for (const w of southWalls) {
    props.push({ kind: 'tamboho', x: w.x, y: w.y, w: w.w, l: w.l, h: w.h, r: 18, rot: 0 });
  }

  // Row of tall boundary eucalyptus trees bordering the hospital
  const southTrees = [380, 680, 980, 1420, 1720, 2020];
  for (const sx of southTrees) {
    props.push({ kind: 'tree', treeType: 'eucalyptus', x: sx, y: 2060, h: 84, r: 16 });
  }

  return props;
}

// ─── Drawing 2.5D Isometric Props ───────────────────────────────────────────
export function drawProp(ctx, p, camX, camY, screenW, screenH, time) {
  const sc = worldToScreen(p.x, p.y, 0, camX, camY, screenW, screenH);
  const sx = sc.x, sy = sc.y;

  // Frustum culling
  if (sx < -160 || sx > screenW + 160 || sy < -180 || sy > screenH + 180) return;

  ctx.save();
  ctx.translate(sx, sy);

  switch (p.kind) {
    case 'fasana': {
      // 3D Isometric Malagasy Family Vault (Caveau Familial Merina)
      const pw = p.w * 0.6;
      const pl = p.l * 0.35;
      const ph = p.h;
      const isGrand = p.style === 'grand';
      const isColonial = p.style === 'colonial';

      // 1) Soft ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.46)';
      ctx.beginPath();
      ctx.ellipse(2, 6, pw * 1.35, pl * 1.35, 0, 0, TAU);
      ctx.fill();

      // 2) Granite Stepped Plinth Base
      const stepOut = isGrand ? 12 : 7;
      const stepH = isGrand ? 8 : 5;
      const bw = pw + stepOut;
      const bl = pl + stepOut * 0.55;

      // Base left face
      ctx.fillStyle = isColonial ? '#323630' : '#3c3644';
      ctx.beginPath();
      ctx.moveTo(-bw, 0); ctx.lineTo(0, bl); ctx.lineTo(0, bl - stepH); ctx.lineTo(-bw, -stepH);
      ctx.closePath(); ctx.fill();

      // Base right face
      ctx.fillStyle = isColonial ? '#242822' : '#2c2732';
      ctx.beginPath();
      ctx.moveTo(0, bl); ctx.lineTo(bw, 0); ctx.lineTo(bw, -stepH); ctx.lineTo(0, bl - stepH);
      ctx.closePath(); ctx.fill();

      // Base top step surface
      ctx.fillStyle = isColonial ? '#454c42' : '#524b5c';
      ctx.beginPath();
      ctx.moveTo(0, -bl - stepH); ctx.lineTo(bw, -stepH); ctx.lineTo(0, bl - stepH); ctx.lineTo(-bw, -stepH);
      ctx.closePath(); ctx.fill();

      // 3) Main Chamber
      const ch = ph - stepH;
      const y0 = -stepH;

      // Stone Colors
      const colLeft = isColonial ? '#4d554a' : (isGrand ? '#686072' : '#5e5666');
      const colRight = isColonial ? '#363d34' : (isGrand ? '#4a4352' : '#423c48');
      const colTop = isColonial ? '#626d5e' : (isGrand ? '#847a90' : '#786e82');

      // Left Face
      ctx.fillStyle = colLeft;
      ctx.beginPath();
      ctx.moveTo(-pw, y0); ctx.lineTo(0, y0 + pl); ctx.lineTo(0, y0 + pl - ch); ctx.lineTo(-pw, y0 - ch);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();

      // Laterite red dust accumulation at base of left face
      const dustGrad = ctx.createLinearGradient(0, y0 + pl, 0, y0 + pl - 14);
      dustGrad.addColorStop(0, 'rgba(164, 68, 52, 0.4)');
      dustGrad.addColorStop(1, 'rgba(164, 68, 52, 0)');
      ctx.fillStyle = dustGrad;
      ctx.beginPath();
      ctx.moveTo(-pw, y0); ctx.lineTo(0, y0 + pl); ctx.lineTo(0, y0 + pl - 14); ctx.lineTo(-pw, y0 - 14);
      ctx.closePath(); ctx.fill();

      // Small inset iron entrance hatch ('varavaran-kely') on left face
      ctx.fillStyle = '#16131c';
      const doorW = pw * 0.35;
      const doorH = ch * 0.42;
      const doorX = -pw * 0.55;
      const doorY = y0 + pl * 0.45;
      ctx.beginPath();
      ctx.moveTo(doorX, doorY);
      ctx.lineTo(doorX + doorW, doorY - doorW * (pl / pw));
      ctx.lineTo(doorX + doorW, doorY - doorW * (pl / pw) - doorH);
      ctx.lineTo(doorX, doorY - doorH);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#2b2336'; ctx.lineWidth = 1.2; ctx.stroke();

      // Right Face
      ctx.fillStyle = colRight;
      ctx.beginPath();
      ctx.moveTo(0, y0 + pl); ctx.lineTo(pw, y0); ctx.lineTo(pw, y0 - ch); ctx.lineTo(0, y0 + pl - ch);
      ctx.closePath(); ctx.fill();
      ctx.stroke();

      // Top Roof Slab
      ctx.fillStyle = colTop;
      ctx.beginPath();
      ctx.moveTo(0, y0 - ch - pl); ctx.lineTo(pw, y0 - ch); ctx.lineTo(0, y0 - ch + pl); ctx.lineTo(-pw, y0 - ch);
      ctx.closePath(); ctx.fill();
      ctx.stroke();

      // 4) Second tier for grand patriarchal vaults
      if (isGrand) {
        const tw = pw * 0.55;
        const tl = pl * 0.55;
        const th = 12;
        const ty = y0 - ch;

        // Tier left
        ctx.fillStyle = '#7a7084';
        ctx.beginPath();
        ctx.moveTo(-tw, ty); ctx.lineTo(0, ty + tl); ctx.lineTo(0, ty + tl - th); ctx.lineTo(-tw, ty - th);
        ctx.closePath(); ctx.fill();

        // Tier right
        ctx.fillStyle = '#544c5c';
        ctx.beginPath();
        ctx.moveTo(0, ty + tl); ctx.lineTo(tw, ty); ctx.lineTo(tw, ty - th); ctx.lineTo(0, ty + tl - th);
        ctx.closePath(); ctx.fill();

        // Tier top
        ctx.fillStyle = '#948a9e';
        ctx.beginPath();
        ctx.moveTo(0, ty - th - tl); ctx.lineTo(tw, ty - th); ctx.lineTo(0, ty - th + tl); ctx.lineTo(-tw, ty - th);
        ctx.closePath(); ctx.fill();
      }

      // 5) Malagasy Inscription Stele Tablet
      if (p.inscription) {
        ctx.fillStyle = '#2a2432';
        ctx.fillRect(-18, y0 - ch + 2, 36, 8);
        ctx.fillStyle = '#d4cacf';
        ctx.font = 'bold 5.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.inscription.length > 10 ? p.inscription.slice(0, 10) : p.inscription, 0, y0 - ch + 6);
      }

      // 6) Stone Cross atop roof
      if (p.hasCross) {
        const cyApex = isGrand ? (y0 - ch - 12) : (y0 - ch);
        ctx.fillStyle = isColonial ? '#707a6c' : '#9c92a6';
        // Vertical post
        ctx.fillRect(-2, cyApex - 14, 4, 14);
        // Horizontal crossbeam
        ctx.fillRect(-7, cyApex - 11, 14, 3.5);
      }

      // 7) Porcelain / bead floral wreath ('fehezam-boninkazo')
      if (p.hasFlowers) {
        ctx.save();
        ctx.fillStyle = '#2b65bd'; // Malagasy royal blue wreath beads
        ctx.beginPath();
        ctx.ellipse(-pw * 0.4, y0 + pl * 0.65, 8, 5.5, -0.3, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke();
        // Inner rose cluster
        ctx.fillStyle = '#d83852';
        ctx.beginPath();
        ctx.arc(-pw * 0.4, y0 + pl * 0.65, 2.8, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      break;
    }

    case 'monument': {
      // Carré Militaire Monument aux Morts (Tsangambato)
      const mh = p.h;

      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
      ctx.beginPath();
      ctx.ellipse(3, 8, 44, 22, 0, 0, TAU);
      ctx.fill();

      // Tier 1 Plinth (Granite Base)
      const b1w = 36, b1l = 18, b1h = 8;
      ctx.fillStyle = '#423d4c';
      ctx.beginPath();
      ctx.moveTo(-b1w, 0); ctx.lineTo(0, b1l); ctx.lineTo(0, b1l - b1h); ctx.lineTo(-b1w, -b1h);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#302c38';
      ctx.beginPath();
      ctx.moveTo(0, b1l); ctx.lineTo(b1w, 0); ctx.lineTo(b1w, -b1h); ctx.lineTo(0, b1l - b1h);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#564f62';
      ctx.beginPath();
      ctx.moveTo(0, -b1l - b1h); ctx.lineTo(b1w, -b1h); ctx.lineTo(0, b1l - b1h); ctx.lineTo(-b1w, -b1h);
      ctx.closePath(); ctx.fill();

      // Tier 2 Plinth
      const b2w = 26, b2l = 13, b2h = 7;
      const y2 = -b1h;
      ctx.fillStyle = '#504a5a';
      ctx.beginPath();
      ctx.moveTo(-b2w, y2); ctx.lineTo(0, y2 + b2l); ctx.lineTo(0, y2 + b2l - b2h); ctx.lineTo(-b2w, y2 - b2h);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#3b3644';
      ctx.beginPath();
      ctx.moveTo(0, y2 + b2l); ctx.lineTo(b2w, y2); ctx.lineTo(b2w, y2 - b2h); ctx.lineTo(0, y2 + b2l - b2h);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#645d70';
      ctx.beginPath();
      ctx.moveTo(0, y2 - b2h - b2l); ctx.lineTo(b2w, y2 - b2h); ctx.lineTo(0, y2 - b2h + b2l); ctx.lineTo(-b2w, y2 - b2h);
      ctx.closePath(); ctx.fill();

      // Tapering Central Stone Obelisk
      const oy = y2 - b2h;
      const obBaseW = 16, obBaseL = 8;
      const obTopW = 7, obTopL = 3.5;
      const obH = mh - 15;

      // Obelisk Left Face
      ctx.fillStyle = '#726a7e';
      ctx.beginPath();
      ctx.moveTo(-obBaseW, oy);
      ctx.lineTo(0, oy + obBaseL);
      ctx.lineTo(0, oy + obTopL - obH);
      ctx.lineTo(-obTopW, oy - obH);
      ctx.closePath(); ctx.fill();

      // Obelisk Right Face
      ctx.fillStyle = '#4c4554';
      ctx.beginPath();
      ctx.moveTo(0, oy + obBaseL);
      ctx.lineTo(obBaseW, oy);
      ctx.lineTo(obTopW, oy - obH);
      ctx.lineTo(0, oy + obTopL - obH);
      ctx.closePath(); ctx.fill();

      // Obelisk Pyramidion Cap
      ctx.fillStyle = '#968ca2';
      ctx.beginPath();
      ctx.moveTo(-obTopW, oy - obH);
      ctx.lineTo(0, oy + obTopL - obH);
      ctx.lineTo(obTopW, oy - obH);
      ctx.lineTo(0, oy - obTopL - obH);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#baaecd';
      ctx.beginPath();
      ctx.moveTo(0, oy + obTopL - obH);
      ctx.lineTo(0, oy - obH - 10);
      ctx.lineTo(-obTopW, oy - obH);
      ctx.closePath(); ctx.fill();

      // Bronze Commemorative Plaque on front face
      ctx.fillStyle = '#a67c30';
      ctx.fillRect(-6, oy - obH * 0.45, 12, 16);
      ctx.strokeStyle = '#c49a42'; ctx.lineWidth = 1; ctx.strokeRect(-6, oy - obH * 0.45, 12, 16);

      // Bronze War Cross on Plaque
      ctx.fillStyle = '#e8be5c';
      ctx.fillRect(-1.5, oy - obH * 0.45 + 3, 3, 9);
      ctx.fillRect(-4, oy - obH * 0.45 + 5.5, 8, 2.5);
      break;
    }

    case 'military_grave': {
      // Carré Militaire War Grave Cross / Stele
      const gh = p.h;

      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath(); ctx.ellipse(1, 2, 7, 3.5, 0, 0, TAU); ctx.fill();

      // Clean white stone cross (Tirailleurs Malgaches & French soldiers)
      ctx.fillStyle = '#dedad2';
      // Vertical post
      ctx.beginPath();
      ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0); ctx.lineTo(2.5, -gh); ctx.lineTo(-2.5, -gh);
      ctx.closePath(); ctx.fill();

      // Shaded right edge
      ctx.fillStyle = '#b0aba0';
      ctx.beginPath();
      ctx.moveTo(2.5, 0); ctx.lineTo(3.8, 1); ctx.lineTo(3.8, 1 - gh); ctx.lineTo(2.5, -gh);
      ctx.closePath(); ctx.fill();

      // Crossbeam
      ctx.fillStyle = '#dedad2';
      ctx.fillRect(-6.5, -gh * 0.72, 13, 3.5);
      ctx.fillStyle = '#b0aba0';
      ctx.fillRect(6.5, -gh * 0.72 + 1, 1.2, 3.5);

      // Small stone base border
      ctx.strokeStyle = 'rgba(120, 110, 100, 0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-4.5, 0, 9, 3);
      break;
    }

    case 'tamboho': {
      // Malagasy Clay & Stone Perimeter Wall
      const ww = p.w * 0.55;
      const wl = p.l * 0.35;
      const wh = p.h;

      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 3, ww * 1.1, wl * 1.2, 0, 0, TAU);
      ctx.fill();

      // Wall front face (Sun-baked laterite red clay)
      ctx.fillStyle = '#823426';
      ctx.beginPath();
      ctx.moveTo(-ww, 0); ctx.lineTo(0, wl); ctx.lineTo(0, wl - wh); ctx.lineTo(-ww, -wh);
      ctx.closePath(); ctx.fill();

      // Wall side face
      ctx.fillStyle = '#5c2217';
      ctx.beginPath();
      ctx.moveTo(0, wl); ctx.lineTo(ww, 0); ctx.lineTo(ww, -wh); ctx.lineTo(0, wl - wh);
      ctx.closePath(); ctx.fill();

      // Wall coping tiles (Terracotta capping)
      ctx.fillStyle = '#9e4232';
      ctx.beginPath();
      ctx.moveTo(0, -wh - wl); ctx.lineTo(ww + 2, -wh); ctx.lineTo(0, -wh + wl); ctx.lineTo(-ww - 2, -wh);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#4e1b12'; ctx.lineWidth = 1; ctx.stroke();

      // Terracotta tile ridge marks
      ctx.strokeStyle = 'rgba(230, 140, 120, 0.35)';
      ctx.lineWidth = 1.2;
      for (let tx = -ww + 8; tx < ww; tx += 14) {
        ctx.beginPath();
        ctx.moveTo(tx, -wh);
        ctx.lineTo(tx + 4, -wh + wl * 0.8);
        ctx.stroke();
      }
      break;
    }

    case 'vavahady': {
      // Monumental Cemetery Gate (Pillars & Wrought Iron Gates)
      const gw = p.w * 0.55;
      const gh = p.h;
      const pw = 14, pl = 8; // pillar dimensions

      // Shadows for both pillars
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      ctx.beginPath(); ctx.ellipse(-gw, 3, 16, 9, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(gw, 3, 16, 9, 0, 0, TAU); ctx.fill();

      // Helper: Draw Red Brick Pillar with Stone Quoins & Capital
      const drawPillar = (px) => {
        // Left face
        ctx.fillStyle = '#923a2a';
        ctx.beginPath();
        ctx.moveTo(px - pw, 0); ctx.lineTo(px, pl); ctx.lineTo(px, pl - gh); ctx.lineTo(px - pw, -gh);
        ctx.closePath(); ctx.fill();

        // Right face
        ctx.fillStyle = '#6a261a';
        ctx.beginPath();
        ctx.moveTo(px, pl); ctx.lineTo(px + pw, 0); ctx.lineTo(px + pw, -gh); ctx.lineTo(px, pl - gh);
        ctx.closePath(); ctx.fill();

        // White cut-stone capital on top
        ctx.fillStyle = '#d4cec5';
        ctx.beginPath();
        ctx.moveTo(px, -gh - pl - 3); ctx.lineTo(px + pw + 3, -gh); ctx.lineTo(px, -gh + pl + 3); ctx.lineTo(px - pw - 3, -gh);
        ctx.closePath(); ctx.fill();

        // Lantern atop the pillar
        ctx.fillStyle = '#1c1822';
        ctx.fillRect(px - 3, -gh - pl - 11, 6, 8);
        const flick = 0.85 + 0.15 * Math.sin(time * 14 + px);
        ctx.fillStyle = `rgba(255, 220, 130, ${flick})`;
        ctx.fillRect(px - 2, -gh - pl - 9, 4, 5);
      };

      drawPillar(-gw);
      drawPillar(gw);

      // Wrought Iron Gates between pillars
      ctx.save();
      ctx.strokeStyle = '#1a1820';
      ctx.lineWidth = 1.8;
      // Horizontal gate rails
      const r1 = -gh * 0.25, r2 = -gh * 0.55, r3 = -gh * 0.82;
      ctx.beginPath(); ctx.moveTo(-gw + pw, r1); ctx.lineTo(gw - pw, r1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-gw + pw, r2); ctx.lineTo(gw - pw, r2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-gw + pw, r3); ctx.lineTo(gw - pw, r3); ctx.stroke();

      // Vertical pickets with spear finials
      const pStep = 9;
      for (let x = -gw + pw + 6; x < gw - pw; x += pStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, r3 - 6);
        ctx.stroke();
        // Spearhead finial
        ctx.fillStyle = '#c8a846';
        ctx.beginPath();
        ctx.moveTo(x - 2, r3 - 4); ctx.lineTo(x, r3 - 10); ctx.lineTo(x + 2, r3 - 4);
        ctx.closePath(); ctx.fill();
      }

      // Malagasy decorative arch sign
      ctx.fillStyle = '#221e28';
      ctx.fillRect(-28, r3 - 12, 56, 8);
      ctx.fillStyle = '#f0d880';
      ctx.font = 'bold 5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ANJANAHARY', 0, r3 - 6);
      ctx.restore();
      break;
    }

    case 'taxi_be': {
      // Malagasy Mercedes 207D Minibus (Line 154: Ampasapito - Anjanahary)
      const vw = p.w * 0.55;
      const vl = p.l * 0.45;
      const vh = p.h;

      // Ground Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
      ctx.beginPath();
      ctx.ellipse(0, 6, vw * 1.25, vl * 1.3, 0, 0, TAU);
      ctx.fill();

      // Lower Hull
      ctx.fillStyle = '#221a10';
      ctx.beginPath();
      ctx.moveTo(-vw, 0); ctx.lineTo(0, vl); ctx.lineTo(vw, 0); ctx.lineTo(0, -vl);
      ctx.closePath(); ctx.fill();

      // Van Body - Left Face (Front)
      // Iconic Malagasy Taxi-Be: Warm Cream/Yellow with bold Deep Navy Blue stripe
      ctx.fillStyle = '#deb43e';
      ctx.beginPath();
      ctx.moveTo(-vw, 0); ctx.lineTo(0, vl); ctx.lineTo(0, vl - vh * 0.65); ctx.lineTo(-vw, -vh * 0.65);
      ctx.closePath(); ctx.fill();

      // Navy Blue Stripe across body
      ctx.fillStyle = '#18284c';
      ctx.beginPath();
      ctx.moveTo(-vw, -vh * 0.25); ctx.lineTo(0, vl - vh * 0.25);
      ctx.lineTo(0, vl - vh * 0.42); ctx.lineTo(-vw, -vh * 0.42);
      ctx.closePath(); ctx.fill();

      // Van Body - Right Face (Side)
      ctx.fillStyle = '#c49e32';
      ctx.beginPath();
      ctx.moveTo(0, vl); ctx.lineTo(vw, 0); ctx.lineTo(vw, -vh * 0.65); ctx.lineTo(0, vl - vh * 0.65);
      ctx.closePath(); ctx.fill();

      // Navy Blue stripe side
      ctx.fillStyle = '#121f3c';
      ctx.beginPath();
      ctx.moveTo(0, vl - vh * 0.25); ctx.lineTo(vw, -vh * 0.25);
      ctx.lineTo(vw, -vh * 0.42); ctx.lineTo(0, vl - vh * 0.42);
      ctx.closePath(); ctx.fill();

      // Cabin Roof
      ctx.fillStyle = '#deb43e';
      ctx.beginPath();
      ctx.moveTo(-vw * 0.85, -vh);
      ctx.lineTo(0, vl * 0.8 - vh);
      ctx.lineTo(vw * 0.85, -vh);
      ctx.lineTo(0, -vl * 0.8 - vh);
      ctx.closePath(); ctx.fill();

      // Windshield Glass (Front cyan reflection)
      ctx.fillStyle = 'rgba(100, 190, 220, 0.45)';
      ctx.beginPath();
      ctx.moveTo(-vw * 0.75, -vh * 0.95);
      ctx.lineTo(0, vl * 0.7 - vh * 0.95);
      ctx.lineTo(0, vl * 0.85 - vh * 0.65);
      ctx.lineTo(-vw * 0.85, -vh * 0.65);
      ctx.closePath(); ctx.fill();

      // Route marquee board above windshield: "154 · AMPASAPITO"
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-18, -vh - 7, 36, 7);
      ctx.fillStyle = '#d22222';
      ctx.font = 'bold 5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('154 · AMPASAPITO', 0, -vh - 2);

      // Roof luggage rack with cargo bundles and spare tire
      ctx.strokeStyle = '#18141e'; ctx.lineWidth = 1.4;
      ctx.strokeRect(-vw * 0.6, -vh - 5, vw * 1.2, 5);

      // Green canvas cargo tarpaulin on roof rack
      ctx.fillStyle = '#2d4c38';
      ctx.fillRect(-vw * 0.45, -vh - 9, vw * 0.9, 5);
      break;
    }

    case 'taxi_ville': {
      // Classic Antananarivo Renault 4L / 2CV City Taxi
      const vw = p.w * 0.55;
      const vl = p.l * 0.45;
      const vh = p.h;

      // Ground Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      ctx.beginPath();
      ctx.ellipse(0, 4, vw * 1.2, vl * 1.2, 0, 0, TAU);
      ctx.fill();

      // Cream-Yellow Body
      ctx.fillStyle = '#e4be52';
      ctx.beginPath();
      ctx.moveTo(-vw, 0); ctx.lineTo(0, vl); ctx.lineTo(0, vl - vh * 0.6); ctx.lineTo(-vw, -vh * 0.6);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#c8a442';
      ctx.beginPath();
      ctx.moveTo(0, vl); ctx.lineTo(vw, 0); ctx.lineTo(vw, -vh * 0.6); ctx.lineTo(0, vl - vh * 0.6);
      ctx.closePath(); ctx.fill();

      // Roof
      ctx.fillStyle = '#f0cc60';
      ctx.beginPath();
      ctx.moveTo(-vw * 0.7, -vh); ctx.lineTo(0, vl * 0.6 - vh); ctx.lineTo(vw * 0.7, -vh); ctx.lineTo(0, -vl * 0.6 - vh);
      ctx.closePath(); ctx.fill();

      // Red illuminated "TAXI" box on roof
      ctx.fillStyle = '#d42838';
      ctx.fillRect(-6, -vh - 5, 12, 4);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 3.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, -vh - 2);
      break;
    }

    case 'stonemason_bench': {
      // Artisanal Stonecutters' Workshop (Mpanao Vato Fasana)
      const bw = p.w * 0.55;
      const bl = p.l * 0.35;
      const bh = p.h;

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath(); ctx.ellipse(0, 4, bw * 1.2, bl * 1.2, 0, 0, TAU); ctx.fill();

      // Wooden Workbench Plinth
      ctx.fillStyle = '#3c2b1e';
      ctx.fillRect(-bw * 0.7, 0, 4, -bh);
      ctx.fillRect(bw * 0.7 - 4, 0, 4, -bh);

      // Bench Top
      ctx.fillStyle = '#563e2c';
      ctx.beginPath();
      ctx.moveTo(-bw, -bh); ctx.lineTo(0, -bh + bl); ctx.lineTo(bw, -bh); ctx.lineTo(0, -bh - bl);
      ctx.closePath(); ctx.fill();

      // Half-carved granite headstone on the bench
      ctx.fillStyle = '#827a8c';
      ctx.fillRect(-bw * 0.4, -bh - 14, 16, 14);
      ctx.strokeStyle = '#4e4856'; ctx.lineWidth = 1;
      ctx.strokeRect(-bw * 0.4, -bh - 14, 16, 14);

      // Stonecutters' hammer & chisel
      ctx.fillStyle = '#d8d4cf';
      ctx.fillRect(4, -bh - 4, 8, 2);
      ctx.fillStyle = '#222026';
      ctx.fillRect(2, -bh - 5, 3, 4);
      break;
    }

    case 'tree': {
      // Highland Madagascar Trees
      const th = p.h;
      const treeType = p.treeType || 'jacaranda';

      if (treeType === 'cypress') {
        // Slender Dark Green Italian Cypress ('Sipreso')
        // Ground shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.44)';
        ctx.beginPath(); ctx.ellipse(0, 2, 12, 6, 0, 0, TAU); ctx.fill();

        // Dark trunk base
        ctx.fillStyle = '#221a14';
        ctx.fillRect(-2, 0, 4, -10);

        // Tall conical evergreen spire
        const grad = ctx.createLinearGradient(-10, 0, 10, 0);
        grad.addColorStop(0, '#102414');
        grad.addColorStop(0.5, '#1e3c22');
        grad.addColorStop(1, '#0c1a0e');
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.moveTo(0, -th);
        ctx.quadraticCurveTo(11, -th * 0.5, 9, -10);
        ctx.lineTo(-9, -10);
        ctx.quadraticCurveTo(-11, -th * 0.5, 0, -th);
        ctx.closePath();
        ctx.fill();

        // Subtle foliage tufts
        ctx.fillStyle = 'rgba(46, 88, 52, 0.35)';
        ctx.beginPath(); ctx.ellipse(-3, -th * 0.4, 5, 8, -0.2, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(3, -th * 0.65, 4, 7, 0.2, 0, TAU); ctx.fill();

      } else if (treeType === 'jacaranda') {
        // Blooming Jacaranda Tree with Violet / Purple Petal Clusters
        const sway = Math.sin(time * 1.8 + p.x * 0.05) * 3;

        // Ground shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath(); ctx.ellipse(0, 4, 32, 16, 0, 0, TAU); ctx.fill();

        // Fallen violet petals on ground
        ctx.fillStyle = 'rgba(154, 98, 214, 0.55)';
        for (let i = 0; i < 9; i++) {
          const px = Math.sin(i * 1.7) * 22;
          const py = Math.cos(i * 2.3) * 11 + 4;
          ctx.beginPath(); ctx.arc(px, py, 1.8, 0, TAU); ctx.fill();
        }

        // Gnarled twisting trunk
        ctx.fillStyle = '#2c221c';
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.quadraticCurveTo(-1, -th * 0.4, -5 + sway * 0.3, -th * 0.6);
        ctx.lineTo(3 + sway * 0.3, -th * 0.6);
        ctx.quadraticCurveTo(4, -th * 0.4, 4, 0);
        ctx.closePath();
        ctx.fill();

        // Major branches
        ctx.strokeStyle = '#221a14';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-2 + sway * 0.3, -th * 0.6);
        ctx.lineTo(-14 + sway, -th * 0.78);
        ctx.moveTo(2 + sway * 0.3, -th * 0.6);
        ctx.lineTo(16 + sway, -th * 0.82);
        ctx.stroke();

        // Rich Multi-layered Violet/Lavender Flower Clusters
        const clusters = [
          { x: sway - 14, y: -th * 0.78, rx: 18, ry: 13, col: '#764ba8' },
          { x: sway + 16, y: -th * 0.82, rx: 20, ry: 14, col: '#6d42a0' },
          { x: sway, y: -th * 0.95, rx: 24, ry: 16, col: '#8e5cc6' },
          { x: sway - 8, y: -th * 0.98, rx: 16, ry: 12, col: '#a776e0' },
          { x: sway + 8, y: -th * 1.02, rx: 15, ry: 11, col: '#b88aed' },
        ];
        for (const c of clusters) {
          ctx.fillStyle = c.col;
          ctx.beginPath();
          ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, TAU);
          ctx.fill();
        }

      } else {
        // Lemon Eucalyptus ('Kinina') with Pale Peeling Bark
        const sway = Math.sin(time * 1.5 + p.y * 0.05) * 2.5;

        // Ground shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
        ctx.beginPath(); ctx.ellipse(0, 3, 20, 10, 0, 0, TAU); ctx.fill();

        // Very tall pale trunk with peeling bark shreds
        ctx.fillStyle = '#8f9490';
        ctx.beginPath();
        ctx.moveTo(-3, 0);
        ctx.lineTo(-2 + sway * 0.5, -th);
        ctx.lineTo(2 + sway * 0.5, -th);
        ctx.lineTo(3, 0);
        ctx.closePath();
        ctx.fill();

        // Peeling papery bark strips
        ctx.fillStyle = '#5a5e5a';
        ctx.fillRect(-3, -th * 0.3, 2.5, 12);
        ctx.fillRect(0.5, -th * 0.6, 2.5, 14);

        // Airy sage-green weeping foliage puffs
        const ecPuffs = [
          { x: sway - 12, y: -th - 4, rx: 14, ry: 9 },
          { x: sway + 10, y: -th - 8, rx: 15, ry: 10 },
          { x: sway, y: -th - 16, rx: 16, ry: 11 },
        ];
        for (const puf of ecPuffs) {
          ctx.fillStyle = '#4c6454';
          ctx.beginPath(); ctx.ellipse(puf.x, puf.y, puf.rx, puf.ry, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#65826f';
          ctx.beginPath(); ctx.ellipse(puf.x - 2, puf.y - 2, puf.rx * 0.7, puf.ry * 0.7, 0, 0, TAU); ctx.fill();
        }
      }
      break;
    }

    case 'lamppost': {
      // 2.5D Ornate Cemetery Lantern
      const h = p.h;

      // Base
      ctx.fillStyle = '#1c1626';
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 4, 0, 0, TAU); ctx.fill();

      // Pole
      ctx.strokeStyle = '#2d253c';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -h);
      ctx.stroke();

      // Ornate bracket
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, -h + 8);
      ctx.quadraticCurveTo(6, -h + 4, 12, -h - 2);
      ctx.stroke();

      // Lantern housing
      ctx.fillStyle = '#3c3248';
      ctx.fillRect(8, -h - 6, 8, 7);

      // Warm glowing bulb
      const flick = 0.85 + 0.15 * Math.sin(time * 16 + p.x);
      ctx.fillStyle = `rgba(255, 230, 160, ${flick})`;
      ctx.beginPath(); ctx.arc(12, -h - 2, 3.5, 0, TAU); ctx.fill();

      // Warm ground light puddle
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(12, 8, 0, 12, 8, 48);
      gr.addColorStop(0, `rgba(255, 205, 100, ${0.16 * flick})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.ellipse(12, 8, 55, 28, 0, 0, TAU); ctx.fill();
      ctx.restore();
      break;
    }

    case 'crate': {
      // 3D Isometric Wooden Crate / Granite Slabs
      const cw = p.w * 0.6;
      const cl = p.l * 0.35;
      const ch = p.h;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath(); ctx.ellipse(2, 4, cw * 1.2, cl * 1.2, 0, 0, TAU); ctx.fill();

      const isSlabs = p.subType === 'stone_slabs';
      const colTop = isSlabs ? '#746e80' : '#4d3b26';
      const colLeft = isSlabs ? '#524c5c' : '#382a1b';
      const colRight = isSlabs ? '#3c3644' : '#271c12';

      ctx.fillStyle = colLeft;
      ctx.beginPath();
      ctx.moveTo(-cw, 0); ctx.lineTo(0, cl); ctx.lineTo(0, cl - ch); ctx.lineTo(-cw, -ch);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = colRight;
      ctx.beginPath();
      ctx.moveTo(0, cl); ctx.lineTo(cw, 0); ctx.lineTo(cw, -ch); ctx.lineTo(0, cl - ch);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = colTop;
      ctx.beginPath();
      ctx.moveTo(0, -ch - cl); ctx.lineTo(cw, -ch); ctx.lineTo(0, -ch + cl); ctx.lineTo(-cw, -ch);
      ctx.closePath(); ctx.fill();
      break;
    }

    case 'barricade': {
      // Concrete Barrier (compatibility)
      const bw = p.w * 0.65;
      const bl = p.l * 0.55;
      const bh = p.h;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath(); ctx.ellipse(0, 4, p.w * 0.7, p.l * 0.6, 0, 0, TAU); ctx.fill();

      ctx.fillStyle = '#262230';
      ctx.beginPath();
      ctx.moveTo(-bw, -bl); ctx.lineTo(bw, bl); ctx.lineTo(bw, bl - bh); ctx.lineTo(-bw, -bl - bh);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#443c54';
      ctx.beginPath();
      ctx.moveTo(-bw, -bl - bh); ctx.lineTo(bw, bl - bh);
      ctx.lineTo(bw * 0.6, bl * 0.6 - bh - 6); ctx.lineTo(-bw * 0.6, -bl * 0.6 - bh - 6);
      ctx.closePath(); ctx.fill();
      break;
    }

    case 'vehicle': {
      // Generic tactical vehicle (compatibility)
      const vw = p.w * 0.55, vl = p.l * 0.45, vh = p.h;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
      ctx.beginPath(); ctx.ellipse(0, 6, vw * 1.25, vl * 1.3, 0, 0, TAU); ctx.fill();

      ctx.fillStyle = p.color || '#1a1824';
      ctx.beginPath();
      ctx.moveTo(-vw, 0); ctx.lineTo(0, vl); ctx.lineTo(vw, 0); ctx.lineTo(0, -vl);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#161420';
      ctx.beginPath();
      ctx.moveTo(-vw, 0); ctx.lineTo(0, vl); ctx.lineTo(0, vl - vh * 0.6); ctx.lineTo(-vw, -vh * 0.6);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#221e2c';
      ctx.beginPath();
      ctx.moveTo(-vw, -vh * 0.6); ctx.lineTo(0, vl - vh * 0.6); ctx.lineTo(vw, -vh * 0.6); ctx.lineTo(0, -vl - vh * 0.6);
      ctx.closePath(); ctx.fill();
      break;
    }
  }

  ctx.restore();
}

// ─── Pre-rendered Isometric Background (compatibility) ──────────────────────
export function buildIsoBackground(arenaW, arenaH, dpr) {
  const bg = document.createElement('canvas');
  bg.width = Math.round(arenaW * dpr);
  bg.height = Math.round(arenaH * dpr);
  const g = bg.getContext('2d');
  g.scale(dpr, dpr);

  // Malagasy red laterite soil base
  g.fillStyle = '#180c09';
  g.fillRect(0, 0, arenaW, arenaH);
  return bg;
}
