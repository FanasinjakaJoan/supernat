// ─── SUPERNAT · Realistic Human Actors & Locomotion Kinematics ───────────────
// "Reality's Deplacement" human locomotion engine inspired by City Z & tactical 2.5D survival games.
import { TAU, clamp, lerp, rand } from './utils.js';
import { getGlow } from './particles.js';
import { worldAngleToScreen } from './iso.js';

// ─── Multiplayer Hunter Identity ────────────────────────────────────────────
// Distinct accent colors + overhead name tags for "Other Hunters" in co-op.
export const HUNTER_ACCENTS = ['#7be9ff', '#ff9d3d', '#ff5d76', '#b06cff', '#ffd23d', '#54d44a'];

/** Deterministic accent color for a remote hunter id (stable across frames). */
export function accentForHunter(id) {
  const s = String(id || '?');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return HUNTER_ACCENTS[h % HUNTER_ACCENTS.length];
}

function hexA(hex, a) {
  const h = String(hex || '#9dff20').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 157;
  const g = parseInt(h.slice(2, 4), 16) || 255;
  const b = parseInt(h.slice(4, 6), 16) || 32;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Overhead name tag + mini vitality bar for remote hunters. Drawn in actor space. */
export function drawHunterTag(ctx, name, accent, hpFrac) {
  const label = String(name || 'HUNTER').slice(0, 12);
  ctx.save();
  ctx.font = '700 10px Rajdhani, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const w = ctx.measureText ? ctx.measureText(label).width : label.length * 7;
  const y = -72;
  // pill backdrop
  ctx.fillStyle = 'rgba(8, 5, 14, 0.72)';
  ctx.strokeStyle = hexA(accent, 0.55);
  ctx.lineWidth = 1;
  ctx.beginPath();
  const pw = Math.max(44, w + 14);
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(-pw / 2, y - 15, pw, 15, 3);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(-pw / 2, y - 15, pw, 15);
  }
  ctx.fillStyle = accent || '#9dff20';
  ctx.fillText(label, 0, y - 3.5);
  // mini HP bar under the name
  if (typeof hpFrac === 'number') {
    const bw = Math.max(40, w + 10);
    ctx.fillStyle = 'rgba(8,4,14,0.8)';
    ctx.fillRect(-bw / 2, y + 1.5, bw, 3);
    ctx.fillStyle = hpFrac < 0.3 ? '#ff2e4d' : accent;
    ctx.fillRect(-bw / 2, y + 1.5, bw * clamp(hpFrac, 0, 1), 3);
  }
  ctx.restore();
}

/** Updates human locomotion state (stride cycle, foot planting, spine twist, flinch). */
export function updateHumanoidLocomotion(actor, dt, isPlayer = false) {
  const vx = actor.vx || 0;
  const vy = actor.vy || 0;
  const speed = Math.hypot(vx, vy);

  // Stride parameters
  const strideLen = isPlayer ? 38 : 28;
  if (speed > 8) {
    actor.walkPhase = (actor.walkPhase || 0) + (speed / strideLen) * TAU * dt;
    actor.isMoving = true;
    actor.moveAng = Math.atan2(vy, vx);
  } else {
    // Smoothly ease walkPhase to neutral stance when stopped
    actor.isMoving = false;
    actor.walkPhase = (actor.walkPhase || 0) + 1.8 * dt; // idle breathing
  }

  // Decay hit flinch
  if (actor.flinch > 0) {
    actor.flinch = Math.max(0, actor.flinch - dt * 4.5);
  }
}

// ─── Helper: Draw Directional Ground Shadow ─────────────────────────────────
function drawHumanShadow(ctx, rx, ry, alpha = 0.42) {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
}

// ─── THE HUNTER (Player) ───────────────────────────────────────────────────
// Fully articulated human operative in tactical survival rig, wielding carbine.
// opts: { accent, name, hpFrac, isHost } — used for remote hunters in multiplayer.
export function drawHunterHuman(ctx, p, g, t, opts = null) {
  const accent = (opts && opts.accent) || '#9dff20';
  const speed = Math.hypot(p.vx || 0, p.vy || 0);
  const isMoving = speed > 10;
  const walkPhase = p.walkPhase || 0;

  // Screen angles
  const aimScrAng = p.ang !== undefined ? worldAngleToScreen(p.ang) : -Math.PI / 2;
  const moveScrAng = p.moveAng !== undefined ? worldAngleToScreen(p.moveAng) : aimScrAng;

  // Does the actor face toward camera or away?
  const facingCam = Math.sin(aimScrAng) > -0.15;
  const facingRight = Math.cos(aimScrAng) >= 0;

  // Pelvis vertical bobbing & lateral sway
  const bob = isMoving ? Math.abs(Math.sin(walkPhase)) * 3.4 : Math.sin(t * 2.5) * 0.8;
  const sway = isMoving ? Math.sin(walkPhase) * 1.8 : 0;
  const flinchY = (p.flinch || 0) * 4;

  ctx.save();

  // 1. Isometric Ground Shadow
  drawHumanShadow(ctx, 16, 8, 0.48);

  // 2. Dash spectral ghosts / after-images
  if (p.dashT > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(0, -22, 14, 24, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // 3. I-Frame blinking
  if (p.iframes > 0 && Math.sin(t * 40) > 0) {
    ctx.globalAlpha = 0.45;
  }

  // Locomotion: Left & Right Legs
  // Stride displacement for 2.5D:
  const strideAmp = isMoving ? 10 : 0;
  const leftPhase = walkPhase;
  const rightPhase = walkPhase + Math.PI;

  const leftStride = Math.sin(leftPhase) * strideAmp;
  const rightStride = Math.sin(rightPhase) * strideAmp;

  const leftLift = isMoving ? Math.max(0, -Math.cos(leftPhase)) * 5.5 : 0;
  const rightLift = isMoving ? Math.max(0, -Math.cos(rightPhase)) * 5.5 : 0;

  const moveDirX = isMoving ? Math.cos(moveScrAng) : 0;
  const moveDirY = isMoving ? Math.sin(moveScrAng) * 0.5 : 0;

  // Foot positions relative to ground
  const hipSep = 5.5;
  const lx = -hipSep + moveDirX * leftStride;
  const ly = moveDirY * leftStride - leftLift;

  const rx = hipSep + moveDirX * rightStride;
  const ry = moveDirY * rightStride - rightLift;

  const pelvisHeight = 20 - bob + flinchY;

  // Draw Legs (tactical cargo pants & combat boots)
  const drawLeg = (footX, footY, hipX, isLead) => {
    ctx.save();
    // Thigh to Knee to Boot
    const kneeX = (hipX + footX) * 0.5 + (isLead ? 1.5 : -1.5);
    const kneeY = -pelvisHeight + (-pelvisHeight + footY) * -0.5 - 2;

    // Pants (Dark Charcoal / Olive)
    ctx.strokeStyle = '#262232';
    ctx.lineWidth = 5.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hipX, -pelvisHeight);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, footY - 2);
    ctx.stroke();

    // Knee pad
    ctx.fillStyle = '#14101e';
    ctx.beginPath();
    ctx.arc(kneeX, kneeY, 3.2, 0, TAU);
    ctx.fill();

    // Combat Boot
    ctx.fillStyle = '#0f0b18';
    ctx.fillRect(footX - 3.2, footY - 4, 6.4, 4.5);
    // Boot sole
    ctx.fillStyle = '#2b1d12';
    ctx.fillRect(footX - 3.5, footY - 1, 7, 1.8);
    ctx.restore();
  };

  // Sort legs based on movement depth
  if (ly < ry) {
    drawLeg(lx, ly, -hipSep + sway * 0.5, leftStride > 0);
    drawLeg(rx, ry, hipSep + sway * 0.5, rightStride > 0);
  } else {
    drawLeg(rx, ry, hipSep + sway * 0.5, rightStride > 0);
    drawLeg(lx, ly, -hipSep + sway * 0.5, leftStride > 0);
  }

  // 4. Trenchcoat / Jacket Tail (Flapping behind with motion & wind)
  const coatWave = Math.sin(t * 8) * 2 + (isMoving ? 4 : 0);
  const coatBackX = -Math.cos(aimScrAng) * (8 + coatWave);
  const coatBackY = -pelvisHeight + 14 - Math.sin(aimScrAng) * 4;
  ctx.fillStyle = '#140e1f';
  ctx.beginPath();
  ctx.moveTo(-7, -pelvisHeight + 2);
  ctx.lineTo(7, -pelvisHeight + 2);
  ctx.quadraticCurveTo(coatBackX, coatBackY - 4, coatBackX, coatBackY);
  ctx.closePath();
  ctx.fill();

  // 5. Pelvis & Combat Belt
  ctx.fillStyle = '#1c1628';
  ctx.fillRect(-7, -pelvisHeight - 4, 14, 5);
  // Belt pouches & buckle
  ctx.fillStyle = '#2c3c20'; // tactical green pouches
  ctx.fillRect(-6.5, -pelvisHeight - 3, 3.2, 3.2);
  ctx.fillRect(3.3, -pelvisHeight - 3, 3.2, 3.2);
  ctx.fillStyle = '#8a9a70';
  ctx.fillRect(-1.2, -pelvisHeight - 3.5, 2.4, 3.8);

  // 6. Torso & Ballistic Plate Carrier (Leans into movement)
  const lean = isMoving ? Math.cos(moveScrAng) * 0.08 : 0;
  const torsoHeight = 16;
  const chestCenterY = -pelvisHeight - torsoHeight * 0.6;

  ctx.save();
  ctx.translate(sway, -pelvisHeight);
  ctx.rotate(lean);

  // Tactical Vest / Kevlar Armor
  ctx.fillStyle = '#261e34';
  ctx.beginPath();
  ctx.roundRect(-8, -torsoHeight, 16, torsoHeight, [4, 4, 2, 2]);
  ctx.fill();
  ctx.strokeStyle = '#120c1e';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // MOLLE webbing & ammo clips
  ctx.fillStyle = '#3a4a2a';
  ctx.fillRect(-6, -torsoHeight + 4, 12, 2.5);
  ctx.fillRect(-6, -torsoHeight + 8, 12, 2.5);

  // Veil Order Insignia on Chest
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, -torsoHeight + 6, 1.8, 0, TAU);
  ctx.fill();

  ctx.restore();

  // 7. Tactical Carbine / Assault Rifle & Arms (Aimed along aimScrAng)
  const shoulderY = -pelvisHeight - torsoHeight + 3 + flinchY;
  const rec = p.recoil || 0; // weapon kickback
  const gunLength = 26;
  const gunX = Math.cos(aimScrAng) * (14 - rec);
  const gunY = shoulderY + Math.sin(aimScrAng) * (12 - rec);

  // Weapon
  ctx.save();
  ctx.translate(gunX, gunY);
  ctx.rotate(aimScrAng);

  // Rifle Body & Stock
  ctx.fillStyle = '#100e16';
  ctx.fillRect(-10, -2.4, gunLength, 4.8);
  // Steel Barrel
  ctx.fillStyle = '#323642';
  ctx.fillRect(gunLength - 10, -1.6, 10, 3.2);
  // Curved Magazine
  ctx.fillStyle = '#1a1824';
  ctx.fillRect(0, 1.8, 4.5, 7.5);
  // Reflex Sight (glowing reticle in hunter accent)
  ctx.fillStyle = accent;
  ctx.fillRect(6, -4.5, 3.5, 2.2);
  // Laser Pointer Beam
  ctx.strokeStyle = hexA(accent, 0.45);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(gunLength, 0);
  ctx.lineTo(gunLength + 220, 0);
  ctx.stroke();

  // Muzzle Flash
  if (p.flashT > 0) {
    const k = p.flashT / 0.05;
    ctx.fillStyle = '#fff4a0';
    ctx.beginPath();
    ctx.arc(gunLength + 5, 0, 7 * k + 2, 0, TAU);
    ctx.fill();
    const s = getGlow('#ffd23d');
    ctx.drawImage(s, gunLength - 15, -20, 40, 40);
  }
  ctx.restore();

  // Arms (Articulated Human Arms)
  // Left arm holding foregrip, right arm on pistol grip
  ctx.strokeStyle = '#221a30';
  ctx.lineWidth = 4.2;
  ctx.lineCap = 'round';

  // Primary arm (Right shoulder to weapon grip)
  ctx.beginPath();
  ctx.moveTo(facingRight ? 5 : -5, shoulderY);
  ctx.lineTo(gunX - Math.cos(aimScrAng) * 4, gunY + 2);
  ctx.stroke();

  // Support arm (Reaching across chest to foregrip)
  ctx.beginPath();
  ctx.moveTo(facingRight ? -5 : 5, shoulderY);
  ctx.lineTo(gunX + Math.cos(aimScrAng) * 8, gunY + 1);
  ctx.stroke();

  // 8. Human Head & Balaclava Hood
  const headY = shoulderY - 8;
  // Neck
  ctx.fillStyle = '#221828';
  ctx.fillRect(-2.5, shoulderY - 3, 5, 4);

  // Hooded Head
  ctx.fillStyle = '#140e20';
  ctx.beginPath();
  ctx.ellipse(0, headY, 6.8, 8, 0, 0, TAU);
  ctx.fill();

  // Tactical Night-Vision Visor / Veil Goggles (glows in look direction)
  const lookX = Math.cos(aimScrAng) * 3.5;
  const lookY = Math.sin(aimScrAng) * 2;

  if (facingCam) {
    // Twin Glowing Goggle Lenses (hunter accent color)
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(lookX - 2.5, headY + lookY, 1.8, 0, TAU);
    ctx.arc(lookX + 2.5, headY + lookY, 1.8, 0, TAU);
    ctx.fill();
    // Subtle visor flare
    const s = getGlow(accent);
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(s, lookX - 10, headY + lookY - 10, 20, 20);
    ctx.restore();
  } else {
    // Back of hood seam
    ctx.strokeStyle = '#261a38';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, headY - 6);
    ctx.lineTo(0, headY + 5);
    ctx.stroke();
  }

  // Dash Cooldown Arc
  if (p.dashCd > 0) {
    const frac = 1 - p.dashCd / 1.15;
    ctx.strokeStyle = hexA(accent, 0.6);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, -pelvisHeight * 0.5, 20, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
    ctx.stroke();
  }

  // Shield Ward Sphere
  if (p.buffs && p.buffs.shield > 0) {
    ctx.save();
    ctx.rotate(t * 1.5);
    ctx.strokeStyle = `rgba(123, 233, 255, ${0.45 + 0.25 * Math.sin(t * 6)})`;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.ellipse(0, -pelvisHeight * 0.6, 24, 26, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // 9. Multiplayer overhead name tag + vitality bar for Other Hunters
  if (opts && opts.name) {
    const hpFrac = typeof opts.hpFrac === 'number' ? opts.hpFrac : (p.hp / (p.maxHp || 100));
    drawHunterTag(ctx, (opts.isHost ? '♛ ' : '') + opts.name, accent, hpFrac);
    // ground ring in accent color so allies read at a glance
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = hexA(accent, 0.8);
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.ellipse(0, 1, 17, 8.5, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

// ─── SHAMBLER (Infected Human Civilian / Zombie) ───────────────────────────
// Real decayed human form with asymmetrical limping gait and grasping arms.
export function drawShamblerZombie(ctx, e, t) {
  const walkPhase = e.walkPhase || (e.t * 4 + e.phase);
  const rotScr = worldAngleToScreen(e.rot);
  const facingCam = Math.sin(rotScr) > -0.2;
  const facingRight = Math.cos(rotScr) >= 0;

  ctx.save();

  // Ground Shadow
  drawHumanShadow(ctx, 15, 8, 0.42);

  // Asymmetrical Zombie Locomotion
  // Left leg drags with a limp; right leg pushes forward
  const limpL = Math.sin(walkPhase) * 6;
  const limpR = -Math.sin(walkPhase) * 9;
  const limpLift = Math.max(0, -Math.cos(walkPhase)) * 4;

  const pelvisY = -18 + Math.abs(Math.sin(walkPhase)) * 2.8;

  // Legs (Torn Civilian Trousers)
  const drawZombieLeg = (footX, footY, hipX, isDragged) => {
    ctx.strokeStyle = '#2d3824';
    ctx.lineWidth = 4.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hipX, pelvisY);
    ctx.lineTo(hipX + footX * 0.4, pelvisY * 0.5);
    ctx.lineTo(hipX + footX, footY);
    ctx.stroke();

    // Bare/decayed human foot or torn shoe
    ctx.fillStyle = isDragged ? '#506e36' : '#1e1c18';
    ctx.fillRect(hipX + footX - 2.8, footY - 3, 5.6, 3.5);
  };

  drawZombieLeg(limpL, -limpLift, -5, true);
  drawZombieLeg(limpR, 0, 5, false);

  // Hunched Torso (Civilian Jacket / Shirt torn at ribs)
  const hunch = Math.sin(walkPhase) * 0.12 + 0.22;
  ctx.save();
  ctx.translate(0, pelvisY);
  ctx.rotate(facingRight ? hunch : -hunch);

  // Torn jacket
  ctx.fillStyle = '#3c4e2e';
  ctx.beginPath();
  ctx.roundRect(-7, -15, 14, 15, [4, 4, 1, 1]);
  ctx.fill();

  // Exposed decayed ribs / flesh
  ctx.fillStyle = '#6b9244';
  ctx.fillRect(-2, -11, 4, 7);
  ctx.fillStyle = '#8fad5c';
  ctx.fillRect(-1.5, -9, 3, 1.5);
  ctx.fillRect(-1.5, -6, 3, 1.5);

  ctx.restore();

  // Reaching Human Zombie Arms (Outstretched to grab the hunter)
  const armReachX = Math.cos(rotScr) * 16;
  const armReachY = pelvisY - 10 + Math.sin(rotScr) * 10;
  const armTwitch = Math.sin(t * 7 + e.phase) * 3;

  ctx.strokeStyle = '#4e6d32';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  // Left arm
  ctx.beginPath();
  ctx.moveTo(-5, pelvisY - 12);
  ctx.lineTo(armReachX - 3, armReachY + armTwitch);
  ctx.stroke();
  // Right arm
  ctx.beginPath();
  ctx.moveTo(5, pelvisY - 12);
  ctx.lineTo(armReachX + 3, armReachY - armTwitch);
  ctx.stroke();

  // Clawed zombie hands
  ctx.fillStyle = '#5c803a';
  ctx.beginPath();
  ctx.arc(armReachX - 3, armReachY + armTwitch, 2.8, 0, TAU);
  ctx.arc(armReachX + 3, armReachY - armTwitch, 2.8, 0, TAU);
  ctx.fill();

  // Decayed Human Head with Slack Jaw
  const headY = pelvisY - 20;
  ctx.fillStyle = '#5c803a';
  ctx.beginPath();
  ctx.ellipse(0, headY, 6.5, 7.5, 0.15, 0, TAU);
  ctx.fill();

  if (facingCam) {
    // Sickly glowing Rift-infected eyes
    ctx.fillStyle = '#c8ff7a';
    ctx.beginPath();
    ctx.arc(-2.2, headY - 1.5, 1.6, 0, TAU);
    ctx.arc(2.2, headY - 1.5, 1.6, 0, TAU);
    ctx.fill();

    // Slack gaping jaw with dark blood
    ctx.fillStyle = '#22080e';
    ctx.beginPath();
    ctx.ellipse(0, headY + 3.2, 2.6, 2.2, 0, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

// ─── VAMPIRE (Aristocratic Human Night Predator) ───────────────────────────
// Tall human anatomy in tailored crimson longcoat, athletic sprint & strafe.
export function drawVampireHuman(ctx, e, t) {
  const walkPhase = e.walkPhase || (e.t * 6 + e.phase);
  const rotScr = worldAngleToScreen(e.rot);
  const facingCam = Math.sin(rotScr) > -0.2;
  const facingRight = Math.cos(rotScr) >= 0;

  ctx.save();

  // Ground Shadow
  drawHumanShadow(ctx, 16, 8, 0.46);

  // Athletic human running strides
  const strideL = Math.sin(walkPhase) * 12;
  const strideR = -Math.sin(walkPhase) * 12;
  const pelvisY = -22 + Math.abs(Math.sin(walkPhase)) * 3.5;

  // Velvet Cape billowing dynamically behind
  const capeWav = Math.sin(t * 10 + e.phase) * 6;
  const capeBackX = -Math.cos(rotScr) * (18 + capeWav);
  const capeBackY = pelvisY + 16 - Math.sin(rotScr) * 6;

  ctx.fillStyle = '#5c0f24';
  ctx.beginPath();
  ctx.moveTo(-8, pelvisY - 12);
  ctx.lineTo(8, pelvisY - 12);
  ctx.quadraticCurveTo(capeBackX * 1.3, capeBackY * 0.7, capeBackX, capeBackY);
  ctx.closePath();
  ctx.fill();

  // Dark Trousers & Polished High Boots
  const drawVampLeg = (footX, hipX) => {
    ctx.strokeStyle = '#18121a';
    ctx.lineWidth = 4.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hipX, pelvisY);
    ctx.lineTo(hipX + footX * 0.4, pelvisY * 0.55);
    ctx.lineTo(hipX + footX, -1);
    ctx.stroke();

    // Leather Riding Boot
    ctx.fillStyle = '#0a060d';
    ctx.fillRect(hipX + footX - 3, -4, 6, 4.5);
  };
  drawVampLeg(strideL, -5);
  drawVampLeg(strideR, 5);

  // Slender Waist & Tailored Waistcoat
  ctx.fillStyle = '#220e18';
  ctx.fillRect(-7, pelvisY - 6, 14, 7);

  // High upturned collar
  ctx.fillStyle = '#82142e';
  ctx.beginPath();
  ctx.moveTo(-8, pelvisY - 16);
  ctx.lineTo(-12, pelvisY - 26);
  ctx.lineTo(-4, pelvisY - 16);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(8, pelvisY - 16);
  ctx.lineTo(12, pelvisY - 26);
  ctx.lineTo(4, pelvisY - 16);
  ctx.closePath();
  ctx.fill();

  // Aristocratic Double-Breasted Longcoat
  ctx.fillStyle = '#181018';
  ctx.beginPath();
  ctx.roundRect(-8, pelvisY - 16, 16, 16, [4, 4, 1, 1]);
  ctx.fill();

  // Silver buttons
  ctx.fillStyle = '#c8b8b0';
  ctx.beginPath();
  ctx.arc(-2.5, pelvisY - 12, 1, 0, TAU);
  ctx.arc(2.5, pelvisY - 12, 1, 0, TAU);
  ctx.arc(-2.5, pelvisY - 7, 1, 0, TAU);
  ctx.arc(2.5, pelvisY - 7, 1, 0, TAU);
  ctx.fill();

  // Elegant Human Head & Pale Skin
  const headY = pelvisY - 22;
  ctx.fillStyle = '#e8d8ce';
  ctx.beginPath();
  ctx.ellipse(0, headY, 6, 7.5, 0, 0, TAU);
  ctx.fill();

  // Sleek black hair
  ctx.fillStyle = '#0e0a12';
  ctx.beginPath();
  ctx.arc(0, headY - 3, 6.2, Math.PI, TAU);
  ctx.fill();

  if (facingCam) {
    // Piercing Crimson Eyes
    ctx.fillStyle = '#ff2e4d';
    ctx.beginPath();
    ctx.arc(-2.2, headY - 1.2, 1.6, 0, TAU);
    ctx.arc(2.2, headY - 1.2, 1.6, 0, TAU);
    ctx.fill();
    // Razor Fangs
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-1.8, headY + 3.2); ctx.lineTo(-1.2, headY + 5.2); ctx.lineTo(-0.6, headY + 3.2);
    ctx.moveTo(0.6, headY + 3.2); ctx.lineTo(1.2, headY + 5.2); ctx.lineTo(1.8, headY + 3.2);
    ctx.fill();
  }

  ctx.restore();
}

// ─── BANSHEE (Weeping Spectral Female Human) ───────────────────────────────
// Floating female silhouette with flowing silver hair & wide wailing shriek.
export function drawBansheeHuman(ctx, e, t) {
  const rotScr = worldAngleToScreen(e.rot);
  const facingCam = Math.sin(rotScr) > -0.2;
  const hover = Math.sin(t * 3.5 + e.phase) * 4;
  const baseZ = 16 + hover;

  ctx.save();

  // Faint ground shadow below hovering form
  drawHumanShadow(ctx, 14, 7, 0.28);

  ctx.translate(0, -baseZ);

  // Gossamer Tattered Robes (Drifting translucently)
  const robeWav = Math.sin(t * 6 + e.phase) * 5;
  ctx.fillStyle = 'rgba(176, 108, 255, 0.45)';
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.quadraticCurveTo(12, -5, 10 + robeWav, 12);
  ctx.quadraticCurveTo(0, 8, -10 - robeWav, 12);
  ctx.quadraticCurveTo(-12, -5, 0, -22);
  ctx.closePath();
  ctx.fill();

  // Slender Torso
  ctx.fillStyle = 'rgba(42, 20, 64, 0.85)';
  ctx.beginPath();
  ctx.roundRect(-6, -20, 12, 14, [4, 4, 2, 2]);
  ctx.fill();

  // Sorrowful Human Arms (Raised in wailing despair)
  const armWave = Math.sin(t * 5) * 3;
  ctx.strokeStyle = '#c4a6e8';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, -18);
  ctx.lineTo(-12, -26 + armWave);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(6, -18);
  ctx.lineTo(12, -26 - armWave);
  ctx.stroke();

  // Flowing Silver-Violet Hair
  ctx.fillStyle = 'rgba(235, 218, 255, 0.85)';
  ctx.beginPath();
  ctx.moveTo(-7, -25);
  ctx.quadraticCurveTo(-14 - robeWav * 0.5, -15, -12, 0);
  ctx.lineTo(-6, -15);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(7, -25);
  ctx.quadraticCurveTo(14 + robeWav * 0.5, -15, 12, 0);
  ctx.lineTo(6, -15);
  ctx.closePath();
  ctx.fill();

  // Pale Sorrowful Human Face
  ctx.fillStyle = '#e5d6f5';
  ctx.beginPath();
  ctx.ellipse(0, -26, 6, 7.5, 0, 0, TAU);
  ctx.fill();

  if (facingCam) {
    // Weeping Dark Eyes
    ctx.fillStyle = '#220a3a';
    ctx.beginPath();
    ctx.arc(-2.2, -27, 1.5, 0, TAU);
    ctx.arc(2.2, -27, 1.5, 0, TAU);
    ctx.fill();

    // Wailing Void Mouth (stretches wide when preparing spirit shard attack)
    const mouthStretch = e.telegraphed ? 2.8 : 1.2;
    ctx.fillStyle = '#0a0212';
    ctx.beginPath();
    ctx.ellipse(0, -22, 2.2, 3.4 * mouthStretch, 0, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

// ─── ABOMINATION (Towering Fused Human Colossus) ───────────────────────────
// Colossal titan stitched from dozens of fused human bodies; seismic footsteps.
export function drawAbominationColossus(ctx, e, t) {
  const walkPhase = e.walkPhase || (e.t * 3);
  const rotScr = worldAngleToScreen(e.rot);

  ctx.save();

  // Massive Ground Shadow
  drawHumanShadow(ctx, 32, 16, 0.6);

  // Heavy seismic footstep strides
  const strideL = Math.sin(walkPhase) * 14;
  const strideR = -Math.sin(walkPhase) * 14;
  const colossusY = -34 + Math.abs(Math.sin(walkPhase)) * 4.5;

  // Massive Humanoid Legs
  const drawColossusLeg = (footX, hipX) => {
    ctx.strokeStyle = '#3c5222';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hipX, colossusY);
    ctx.lineTo(hipX + footX * 0.35, colossusY * 0.5);
    ctx.lineTo(hipX + footX, 0);
    ctx.stroke();

    // Massive Foot
    ctx.fillStyle = '#243414';
    ctx.fillRect(hipX + footX - 8, -6, 16, 6);
  };
  drawColossusLeg(strideL, -14);
  drawColossusLeg(strideR, 14);

  // Fused Humanoid Torso Bulk (stitched human corpses)
  ctx.fillStyle = '#485e28';
  ctx.beginPath();
  ctx.roundRect(-22, colossusY - 32, 44, 38, [12, 12, 6, 6]);
  ctx.fill();

  // Stitched Black Wire Seams
  ctx.strokeStyle = '#18120c';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-16, colossusY - 30);
  ctx.quadraticCurveTo(0, colossusY - 14, 12, colossusY + 2);
  ctx.stroke();
  for (let i = -14; i <= 10; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i - 3, colossusY - 20 + i * 0.5);
    ctx.lineTo(i + 3, colossusY - 16 + i * 0.5);
    ctx.stroke();
  }

  // Multiple Grafts of Muscular Human Arms along the flanks
  const armSway = Math.sin(t * 3.5) * 8;
  const armPairs = [
    { y: colossusY - 26, reach: 24, w: 7 },
    { y: colossusY - 14, reach: 28, w: 8.5 },
    { y: colossusY - 2, reach: 22, w: 6.5 },
  ];
  for (const pair of armPairs) {
    ctx.strokeStyle = '#384d1e';
    ctx.lineWidth = pair.w;
    ctx.lineCap = 'round';
    // Left arm
    ctx.beginPath();
    ctx.moveTo(-20, pair.y);
    ctx.lineTo(-pair.reach, pair.y + 14 + armSway);
    ctx.stroke();
    // Right arm
    ctx.beginPath();
    ctx.moveTo(20, pair.y);
    ctx.lineTo(pair.reach, pair.y + 14 - armSway);
    ctx.stroke();
  }

  // Multiple Screaming Human Faces Embedded in the Bulk
  const embeddedFaces = [
    { x: -8, y: colossusY - 24, r: 4.5 },
    { x: 7, y: colossusY - 28, r: 5 },
    { x: 10, y: colossusY - 12, r: 4 },
    { x: -6, y: colossusY - 8, r: 4.2 },
  ];
  for (const f of embeddedFaces) {
    ctx.fillStyle = '#627c38';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, TAU);
    ctx.fill();
    // Glowing Rift eyes
    ctx.fillStyle = '#d6ff8a';
    ctx.beginPath();
    ctx.arc(f.x - 1.5, f.y - 1, 1.2, 0, TAU);
    ctx.arc(f.x + 1.5, f.y - 1, 1.2, 0, TAU);
    ctx.fill();
    // Open screaming mouth
    ctx.fillStyle = '#140c06';
    ctx.beginPath();
    ctx.ellipse(f.x, f.y + 2.2, 1.2, 1.8, 0, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

// ─── HELLHOUND (Pit Stalker Quadruped) ─────────────────────────────────────
// Articulated 4-legged canine with stalking & charging gaits.
export function drawHellhoundBeast(ctx, e, t) {
  const run = Math.sin(t * (e.state === 'charge' ? 18 : 8)) * (e.state === 'charge' ? 12 : 5);
  const rotScr = worldAngleToScreen(e.rot);

  ctx.save();
  drawHumanShadow(ctx, 18, 9, 0.45);

  const spineY = -14;

  // 4 Articulated Legs
  ctx.strokeStyle = '#5a1d10';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  // Back legs
  ctx.beginPath();
  ctx.moveTo(-10, spineY);
  ctx.lineTo(-14 + run, -1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, spineY);
  ctx.lineTo(-12 - run, -1);
  ctx.stroke();

  // Front legs
  ctx.beginPath();
  ctx.moveTo(10, spineY);
  ctx.lineTo(14 - run, -1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(8, spineY);
  ctx.lineTo(12 + run, -1);
  ctx.stroke();

  // Muscular Canine Torso
  ctx.fillStyle = e.state === 'charge' ? '#923418' : '#722212';
  ctx.beginPath();
  ctx.ellipse(0, spineY, 16, 9, 0, 0, TAU);
  ctx.fill();

  // Snarling Canine Head
  ctx.beginPath();
  ctx.moveTo(12, spineY - 4);
  ctx.lineTo(24, spineY);
  ctx.lineTo(12, spineY + 5);
  ctx.closePath();
  ctx.fill();

  // Glowing Ember Eyes & Throat
  ctx.fillStyle = '#ffd23d';
  ctx.beginPath();
  ctx.arc(17, spineY - 2.5, 1.8, 0, TAU);
  ctx.fill();

  // Fire Cracks along Spine
  ctx.strokeStyle = 'rgba(255, 140, 40, 0.85)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-10, spineY - 2);
  ctx.lineTo(0, spineY - 1);
  ctx.lineTo(8, spineY - 2);
  ctx.stroke();

  ctx.restore();
}

// ─── WRAITH (Restless Human Spirit Phantom) ─────────────────────────────────
// Translucent drifting human skull, ribcage & shroud.
export function drawWraithPhantom(ctx, e, t) {
  const hover = Math.sin(t * 3 + e.phase) * 5;
  const z = 18 + hover;

  ctx.save();
  drawHumanShadow(ctx, 14, 7, 0.22);
  ctx.translate(0, -z);

  // Ethereal Mist Shroud
  ctx.fillStyle = 'rgba(123, 233, 255, 0.45)';
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.quadraticCurveTo(14, -8, 8, 14);
  ctx.quadraticCurveTo(0, 6, -8, 14);
  ctx.quadraticCurveTo(-14, -8, 0, -22);
  ctx.closePath();
  ctx.fill();

  // Visible Spectral Human Ribcage
  ctx.strokeStyle = '#d9fbff';
  ctx.lineWidth = 1.8;
  for (let i = -14; i <= -4; i += 3.5) {
    ctx.beginPath();
    ctx.moveTo(-5, i);
    ctx.quadraticCurveTo(0, i + 2, 5, i);
    ctx.stroke();
  }

  // Hooded Spectral Human Skull
  ctx.fillStyle = '#061a24';
  ctx.beginPath();
  ctx.ellipse(0, -22, 6.5, 7.5, 0, 0, TAU);
  ctx.fill();

  // Glowing Cyan Skull Eye Sockets
  ctx.fillStyle = '#7be9ff';
  ctx.beginPath();
  ctx.arc(-2.4, -22, 1.6, 0, TAU);
  ctx.arc(2.4, -22, 1.6, 0, TAU);
  ctx.fill();

  ctx.restore();
}

// ─── TACTICAL 2.5D RETICLE ─────────────────────────────────────────────────
// Crosshair drawn on the isometric ground plane and screen space for precision aiming.
export function drawTacticalReticle(ctx, sx, sy, isFiring, time) {
  ctx.save();
  ctx.translate(sx, sy);

  // Ground targeting ellipse (in 2.5D perspective)
  ctx.strokeStyle = isFiring ? '#ff2e4d' : 'rgba(157, 255, 32, 0.65)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 7, 0, 0, TAU);
  ctx.stroke();

  // Rotating outer ticks
  ctx.rotate(time * 2);
  ctx.strokeStyle = isFiring ? '#ff5d76' : '#9dff20';
  ctx.lineWidth = 1.8;
  const tickDist = 16;
  for (let a = 0; a < TAU; a += Math.PI / 2) {
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 4.5);
    ctx.lineTo(Math.cos(a) * tickDist, Math.sin(a) * (tickDist * 0.5));
    ctx.stroke();
  }

  // Center pip
  ctx.fillStyle = isFiring ? '#ffd23d' : '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, TAU);
  ctx.fill();

  ctx.restore();
}
