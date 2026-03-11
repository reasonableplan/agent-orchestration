/**
 * RPG Maker (쯔꾸르) quality pixel art character renderer
 * Draws 32x48 pixel characters with detailed shading, rounded shapes,
 * hair style variations, domain accessories, and status-specific poses.
 */

import { AGENT_COLORS, CHAR_W, CHAR_H, RENDER_SCALE, type AgentColors } from './sprite-config';

export interface CharacterFrame {
  walkFrame: number; // 0-3 for walk cycle
  armFrame: number;  // 0-1 for working arm movement
  isBlinking: boolean;
}

// ---- Color utility helpers ----

/** Lighten a hex color by a factor (0-1) */
function lighten(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.min(255, Math.round(r + (255 - r) * factor));
  const lg = Math.min(255, Math.round(g + (255 - g) * factor));
  const lb = Math.min(255, Math.round(b + (255 - b) * factor));
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

/** Darken a hex color by a factor (0-1) */
function darken(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * (1 - factor));
  const dg = Math.round(g * (1 - factor));
  const db = Math.round(b * (1 - factor));
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
}

/** Draw a single pixel */
function px(ctx: CanvasRenderingContext2D, x: number, y: number, w = 1, h = 1) {
  ctx.fillRect(x, y, w, h);
}

/** Set fill and draw a pixel in one call */
function cpx(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Draw a rounded rectangle (pixel art style - cut corners) */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string, cornerSize = 1,
) {
  ctx.fillStyle = color;
  // Main body
  ctx.fillRect(x + cornerSize, y, w - cornerSize * 2, h);
  ctx.fillRect(x, y + cornerSize, w, h - cornerSize * 2);
}

// ---- Walk cycle offsets ----

function getWalkBob(walkFrame: number): number {
  // Bob pattern: 0, -1, 0, -1
  return walkFrame % 2 === 1 ? -1 : 0;
}

function getWalkStride(walkFrame: number): { left: number; right: number } {
  // Stride pattern for legs: frame 0=center, 1=left forward, 2=center, 3=right forward
  switch (walkFrame) {
    case 0: return { left: 0, right: 0 };
    case 1: return { left: -2, right: 2 };
    case 2: return { left: 0, right: 0 };
    case 3: return { left: 2, right: -2 };
    default: return { left: 0, right: 0 };
  }
}

// ---- Main draw function ----

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  domain: string,
  status: string,
  frame: CharacterFrame,
): void {
  const colors = AGENT_COLORS[domain] ?? AGENT_COLORS.frontend;
  const isWorking = status === 'working';
  const isThinking = status === 'thinking';
  const isError = status === 'error';
  const isWaiting = status === 'waiting';
  const isIdle = status === 'idle';
  const isWalking = status === 'delivering' || status === 'searching';
  const isSitting = isWorking || isThinking || isError || isWaiting;

  const bob = isWalking ? getWalkBob(frame.walkFrame) : 0;
  const stride = isWalking ? getWalkStride(frame.walkFrame) : { left: 0, right: 0 };

  ctx.save();

  // Apply walk bob to entire character
  if (bob !== 0) {
    ctx.translate(0, bob);
  }

  // Shadow ellipse at feet
  drawShadow(ctx, isSitting);

  // Draw order: legs (behind), body, arms, head, hair, accessories
  drawLegs(ctx, colors, stride, isIdle, isSitting, isWalking);
  drawBody(ctx, colors, domain, isSitting);
  drawArms(ctx, colors, domain, status, frame.armFrame, isSitting);
  drawHead(ctx, colors, frame.isBlinking, isError, isThinking, isWorking, isIdle, isWaiting);
  drawHair(ctx, colors);
  drawAccessory(ctx, domain, colors, isSitting);

  ctx.restore();
}

// ---- Shadow ----

function drawShadow(ctx: CanvasRenderingContext2D, isSitting: boolean) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  if (isSitting) {
    ctx.ellipse(CHAR_W / 2, CHAR_H - 1, 10, 3, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(CHAR_W / 2, CHAR_H - 1, 8, 3, 0, 0, Math.PI * 2);
  }
  ctx.fill();
}

// ---- Legs ----

function drawLegs(
  ctx: CanvasRenderingContext2D,
  c: AgentColors,
  stride: { left: number; right: number },
  isIdle: boolean,
  isSitting: boolean,
  isWalking: boolean,
) {
  const pantsHighlight = lighten(c.pants, 0.15);
  const pantsShadow = darken(c.pants, 0.2);
  const shoesHighlight = lighten(c.shoes, 0.2);

  if (isSitting) {
    // ---- SITTING POSE: thighs horizontal, calves hanging down ----
    const thighY = 32;
    const calfY = 37;

    // Left thigh (horizontal)
    ctx.fillStyle = c.pants;
    px(ctx, 8, thighY, 6, 4);
    ctx.fillStyle = pantsHighlight;
    px(ctx, 8, thighY, 6, 1); // top highlight
    ctx.fillStyle = pantsShadow;
    px(ctx, 8, thighY + 3, 6, 1); // bottom shadow

    // Right thigh (horizontal)
    ctx.fillStyle = c.pants;
    px(ctx, 18, thighY, 6, 4);
    ctx.fillStyle = pantsHighlight;
    px(ctx, 18, thighY, 6, 1);
    ctx.fillStyle = pantsShadow;
    px(ctx, 18, thighY + 3, 6, 1);

    // Knee shadow (darker at bend)
    ctx.fillStyle = pantsShadow;
    px(ctx, 13, thighY + 1, 1, 3);
    px(ctx, 17, thighY + 1, 1, 3);

    // Left calf (vertical, hanging)
    ctx.fillStyle = c.pants;
    px(ctx, 9, calfY, 4, 7);
    ctx.fillStyle = pantsShadow;
    px(ctx, 12, calfY, 1, 6); // right shadow on calf

    // Right calf (vertical, hanging)
    ctx.fillStyle = c.pants;
    px(ctx, 19, calfY, 4, 7);
    ctx.fillStyle = pantsShadow;
    px(ctx, 22, calfY, 1, 6);

    // Shoes (dangling)
    ctx.fillStyle = c.shoes;
    px(ctx, 8, calfY + 7, 6, 2);
    px(ctx, 18, calfY + 7, 6, 2);
    ctx.fillStyle = shoesHighlight;
    px(ctx, 9, calfY + 7, 4, 1);
    px(ctx, 19, calfY + 7, 4, 1);
    // Shoe soles
    ctx.fillStyle = darken(c.shoes, 0.3);
    px(ctx, 8, calfY + 8, 6, 1);
    px(ctx, 18, calfY + 8, 6, 1);
  } else if (isIdle) {
    // ---- IDLE: relaxed standing, legs together ----
    const legY = 33;
    const legH = 11;

    // Left leg
    ctx.fillStyle = c.pants;
    px(ctx, 10, legY, 5, legH);
    ctx.fillStyle = pantsHighlight;
    px(ctx, 10, legY, 2, legH - 2);
    ctx.fillStyle = pantsShadow;
    px(ctx, 14, legY + 2, 1, legH - 4); // inner shadow
    // Knee shadow
    ctx.fillStyle = pantsShadow;
    px(ctx, 11, legY + 5, 3, 1);

    // Right leg
    ctx.fillStyle = c.pants;
    px(ctx, 17, legY, 5, legH);
    ctx.fillStyle = pantsHighlight;
    px(ctx, 17, legY, 2, legH - 2);
    ctx.fillStyle = pantsShadow;
    px(ctx, 21, legY + 2, 1, legH - 4);
    ctx.fillStyle = pantsShadow;
    px(ctx, 18, legY + 5, 3, 1);

    // Gap between legs
    ctx.fillStyle = pantsShadow;
    px(ctx, 15, legY + 1, 2, legH - 2);

    // Shoes
    ctx.fillStyle = c.shoes;
    px(ctx, 9, legY + legH, 6, 3);
    px(ctx, 17, legY + legH, 6, 3);
    // Shoe highlight
    ctx.fillStyle = shoesHighlight;
    px(ctx, 10, legY + legH, 4, 1);
    px(ctx, 18, legY + legH, 4, 1);
    // Shoe soles
    ctx.fillStyle = darken(c.shoes, 0.3);
    px(ctx, 9, legY + legH + 2, 6, 1);
    px(ctx, 17, legY + legH + 2, 6, 1);
  } else if (isWalking) {
    // ---- WALKING: animated stride ----
    const legY = 33;
    const legH = 10;

    // Left leg with stride offset
    ctx.fillStyle = c.pants;
    px(ctx, 10 + stride.left, legY, 5, legH);
    ctx.fillStyle = pantsHighlight;
    px(ctx, 10 + stride.left, legY, 2, legH - 2);
    ctx.fillStyle = pantsShadow;
    px(ctx, 14 + stride.left, legY + 2, 1, legH - 3);

    // Right leg with stride offset
    ctx.fillStyle = c.pants;
    px(ctx, 17 + stride.right, legY, 5, legH);
    ctx.fillStyle = pantsHighlight;
    px(ctx, 17 + stride.right, legY, 2, legH - 2);
    ctx.fillStyle = pantsShadow;
    px(ctx, 21 + stride.right, legY + 2, 1, legH - 3);

    // Shoes
    ctx.fillStyle = c.shoes;
    px(ctx, 9 + stride.left, legY + legH, 6, 3);
    px(ctx, 16 + stride.right, legY + legH, 6, 3);
    ctx.fillStyle = shoesHighlight;
    px(ctx, 10 + stride.left, legY + legH, 4, 1);
    px(ctx, 17 + stride.right, legY + legH, 4, 1);
    ctx.fillStyle = darken(c.shoes, 0.3);
    px(ctx, 9 + stride.left, legY + legH + 2, 6, 1);
    px(ctx, 16 + stride.right, legY + legH + 2, 6, 1);
  } else {
    // ---- DEFAULT STANDING ----
    const legY = 33;
    const legH = 11;

    // Left leg
    ctx.fillStyle = c.pants;
    px(ctx, 10, legY, 5, legH);
    ctx.fillStyle = pantsHighlight;
    px(ctx, 10, legY, 2, legH - 2);
    ctx.fillStyle = pantsShadow;
    px(ctx, 14, legY + 2, 1, legH - 4);
    ctx.fillStyle = pantsShadow;
    px(ctx, 11, legY + 5, 3, 1);

    // Right leg
    ctx.fillStyle = c.pants;
    px(ctx, 17, legY, 5, legH);
    ctx.fillStyle = pantsHighlight;
    px(ctx, 17, legY, 2, legH - 2);
    ctx.fillStyle = pantsShadow;
    px(ctx, 21, legY + 2, 1, legH - 4);
    ctx.fillStyle = pantsShadow;
    px(ctx, 18, legY + 5, 3, 1);

    // Gap
    ctx.fillStyle = pantsShadow;
    px(ctx, 15, legY + 1, 2, legH - 2);

    // Shoes
    ctx.fillStyle = c.shoes;
    px(ctx, 9, legY + legH, 6, 3);
    px(ctx, 17, legY + legH, 6, 3);
    ctx.fillStyle = shoesHighlight;
    px(ctx, 10, legY + legH, 4, 1);
    px(ctx, 18, legY + legH, 4, 1);
    ctx.fillStyle = darken(c.shoes, 0.3);
    px(ctx, 9, legY + legH + 2, 6, 1);
    px(ctx, 17, legY + legH + 2, 6, 1);
  }
}

// ---- Body / Torso ----

function drawBody(
  ctx: CanvasRenderingContext2D,
  c: AgentColors,
  domain: string,
  isSitting: boolean,
) {
  const bodyY = 16;
  const bodyH = 17;
  const bodyHighlight = lighten(c.body, 0.15);
  const bodyDarker = darken(c.bodyDark, 0.15);

  // ---- Neck ----
  ctx.fillStyle = c.skin;
  px(ctx, 13, 14, 6, 4);
  cpx(ctx, c.skinShadow, 17, 15, 2, 3); // neck shadow right

  // ---- Shoulders & Torso ----
  // Shoulder line (wider than head)
  ctx.fillStyle = c.body;
  px(ctx, 6, bodyY, 20, 2); // wide shoulders
  // Shoulder rounding - cut top-left and top-right corners
  cpx(ctx, 'rgba(0,0,0,0)', 6, bodyY, 1, 1); // We'll just not draw the corner
  // Actually, draw rounded shoulders by building up
  ctx.fillStyle = c.body;
  px(ctx, 7, bodyY, 18, 1); // top row slightly narrower
  px(ctx, 6, bodyY + 1, 20, 1); // full width row

  // Main torso
  ctx.fillStyle = c.body;
  px(ctx, 7, bodyY + 2, 18, bodyH - 4);

  // Torso highlight (left side)
  ctx.fillStyle = bodyHighlight;
  px(ctx, 8, bodyY + 2, 3, bodyH - 6);

  // Torso shadow (right side)
  ctx.fillStyle = c.bodyDark;
  px(ctx, 21, bodyY + 2, 4, bodyH - 5);
  ctx.fillStyle = bodyDarker;
  px(ctx, 23, bodyY + 3, 2, bodyH - 7);

  // ---- Collar / neckline with accent ----
  ctx.fillStyle = c.accent;
  // V-neck collar
  px(ctx, 13, bodyY, 1, 2);
  px(ctx, 14, bodyY, 4, 1);
  px(ctx, 18, bodyY, 1, 2);
  // Collar inner shadow
  ctx.fillStyle = darken(c.accent, 0.2);
  px(ctx, 14, bodyY + 1, 4, 1);

  // ---- Belt at waist ----
  const beltY = bodyY + bodyH - 2;
  ctx.fillStyle = darken(c.bodyDark, 0.3);
  px(ctx, 7, beltY, 18, 2);
  // Belt highlight
  ctx.fillStyle = darken(c.bodyDark, 0.1);
  px(ctx, 7, beltY, 18, 1);
  // Belt buckle
  ctx.fillStyle = c.accent;
  px(ctx, 14, beltY, 4, 2);
  ctx.fillStyle = lighten(c.accent, 0.3);
  px(ctx, 15, beltY, 2, 1); // buckle highlight

  // ---- Domain-specific shirt detail ----
  drawShirtDetail(ctx, domain, c, bodyY);

  // ---- Bottom of torso (tuck into pants) ----
  if (isSitting) {
    // Extra torso for sitting (extends a bit into seat area)
    ctx.fillStyle = c.body;
    px(ctx, 8, bodyY + bodyH, 16, 1);
  }
}

function drawShirtDetail(
  ctx: CanvasRenderingContext2D,
  domain: string,
  c: AgentColors,
  bodyY: number,
) {
  const cx = 16; // center x
  const dy = bodyY + 6; // detail y center

  switch (domain) {
    case 'git': {
      // Git branch icon
      ctx.fillStyle = c.accent;
      px(ctx, cx - 2, dy, 1, 5);     // vertical trunk
      px(ctx, cx - 1, dy + 3, 3, 1); // branch line
      px(ctx, cx + 1, dy + 1, 1, 3); // branch vertical
      // Dots at branch points
      ctx.fillStyle = lighten(c.accent, 0.3);
      px(ctx, cx - 2, dy, 1, 1);
      px(ctx, cx + 1, dy + 1, 1, 1);
      px(ctx, cx - 2, dy + 4, 1, 1);
      break;
    }
    case 'frontend': {
      // React-like atom symbol
      ctx.fillStyle = c.accent;
      px(ctx, cx - 1, dy + 1, 3, 1); // horizontal
      px(ctx, cx, dy, 1, 3);         // vertical
      // Electron dots
      ctx.fillStyle = lighten(c.accent, 0.4);
      px(ctx, cx - 2, dy, 1, 1);
      px(ctx, cx + 2, dy + 2, 1, 1);
      break;
    }
    case 'backend': {
      // Server/database icon
      ctx.fillStyle = c.accent;
      px(ctx, cx - 2, dy, 5, 1);     // top line
      px(ctx, cx - 2, dy + 2, 5, 1); // middle line
      px(ctx, cx - 2, dy + 4, 5, 1); // bottom line
      px(ctx, cx - 2, dy, 1, 5);     // left side
      px(ctx, cx + 2, dy, 1, 5);     // right side
      // LED dots
      ctx.fillStyle = lighten(c.accent, 0.5);
      px(ctx, cx - 1, dy + 1, 1, 1);
      px(ctx, cx - 1, dy + 3, 1, 1);
      break;
    }
    case 'docs': {
      // Document/pencil icon
      ctx.fillStyle = c.accent;
      px(ctx, cx - 2, dy, 4, 5);       // page
      ctx.fillStyle = darken(c.accent, 0.2);
      px(ctx, cx - 1, dy + 1, 2, 1);   // line 1
      px(ctx, cx - 1, dy + 3, 2, 1);   // line 2
      // Page corner fold
      ctx.fillStyle = lighten(c.accent, 0.3);
      px(ctx, cx + 1, dy, 1, 1);
      break;
    }
    case 'director': {
      // Star/crown icon
      ctx.fillStyle = c.accent;
      px(ctx, cx, dy, 1, 1);           // top point
      px(ctx, cx - 2, dy + 1, 5, 1);   // middle bar
      px(ctx, cx - 1, dy + 2, 3, 1);   // bottom
      ctx.fillStyle = lighten(c.accent, 0.4);
      px(ctx, cx, dy, 1, 1);           // star highlight
      break;
    }
  }
}

// ---- Arms ----

function drawArms(
  ctx: CanvasRenderingContext2D,
  c: AgentColors,
  domain: string,
  status: string,
  armFrame: number,
  isSitting: boolean,
) {
  const armY = 17;
  const sleeveColor = c.body;
  const sleeveShadow = c.bodyDark;
  const handColor = c.skin;
  const handShadow = c.skinShadow;

  if (status === 'working') {
    // ---- TYPING: arms forward, alternating bob ----
    const offsetL = armFrame === 0 ? 0 : -1;
    const offsetR = armFrame === 0 ? -1 : 0;

    // Left arm (sleeve)
    ctx.fillStyle = sleeveColor;
    px(ctx, 2, armY + offsetL, 5, 7);
    ctx.fillStyle = sleeveShadow;
    px(ctx, 2, armY + offsetL, 1, 6); // outer shadow
    px(ctx, 6, armY + 1 + offsetL, 1, 5); // inner shadow
    // Left hand
    ctx.fillStyle = handColor;
    px(ctx, 3, armY + 7 + offsetL, 4, 3);
    ctx.fillStyle = handShadow;
    px(ctx, 3, armY + 9 + offsetL, 4, 1); // hand bottom shadow
    // Finger detail
    ctx.fillStyle = handShadow;
    px(ctx, 4, armY + 8 + offsetL, 1, 1);

    // Right arm (sleeve)
    ctx.fillStyle = sleeveColor;
    px(ctx, 25, armY + offsetR, 5, 7);
    ctx.fillStyle = sleeveShadow;
    px(ctx, 29, armY + offsetR, 1, 6);
    px(ctx, 25, armY + 1 + offsetR, 1, 5);
    // Right hand
    ctx.fillStyle = handColor;
    px(ctx, 25, armY + 7 + offsetR, 4, 3);
    ctx.fillStyle = handShadow;
    px(ctx, 25, armY + 9 + offsetR, 4, 1);
    ctx.fillStyle = handShadow;
    px(ctx, 27, armY + 8 + offsetR, 1, 1);

  } else if (status === 'thinking') {
    // ---- THINKING: left arm down, right arm up to chin ----
    // Left arm relaxed
    ctx.fillStyle = sleeveColor;
    px(ctx, 2, armY, 5, 8);
    ctx.fillStyle = sleeveShadow;
    px(ctx, 2, armY, 1, 7);
    ctx.fillStyle = handColor;
    px(ctx, 3, armY + 8, 4, 3);
    ctx.fillStyle = handShadow;
    px(ctx, 3, armY + 10, 4, 1);

    // Right arm raised to chin
    ctx.fillStyle = sleeveColor;
    px(ctx, 25, armY - 3, 5, 8);
    ctx.fillStyle = sleeveShadow;
    px(ctx, 29, armY - 3, 1, 7);
    // Elbow bend
    ctx.fillStyle = sleeveColor;
    px(ctx, 23, armY - 5, 4, 4);
    // Hand near chin
    ctx.fillStyle = handColor;
    px(ctx, 22, armY - 7, 4, 3);
    ctx.fillStyle = handShadow;
    px(ctx, 22, armY - 5, 4, 1);

  } else if (status === 'idle') {
    // ---- IDLE: arms at sides, relaxed ----
    // Left arm
    ctx.fillStyle = sleeveColor;
    px(ctx, 2, armY + 1, 5, 7);
    ctx.fillStyle = sleeveShadow;
    px(ctx, 2, armY + 1, 1, 6);
    ctx.fillStyle = lighten(sleeveColor, 0.1);
    px(ctx, 4, armY + 1, 2, 6); // sleeve highlight
    ctx.fillStyle = handColor;
    px(ctx, 3, armY + 8, 3, 3);
    ctx.fillStyle = handShadow;
    px(ctx, 3, armY + 10, 3, 1);

    // Right arm
    ctx.fillStyle = sleeveColor;
    px(ctx, 25, armY + 1, 5, 7);
    ctx.fillStyle = sleeveShadow;
    px(ctx, 29, armY + 1, 1, 6);
    ctx.fillStyle = lighten(sleeveColor, 0.1);
    px(ctx, 26, armY + 1, 2, 6);
    ctx.fillStyle = handColor;
    px(ctx, 26, armY + 8, 3, 3);
    ctx.fillStyle = handShadow;
    px(ctx, 26, armY + 10, 3, 1);

  } else {
    // ---- DEFAULT: arms at sides ----
    // Left arm
    ctx.fillStyle = sleeveColor;
    px(ctx, 2, armY, 5, 8);
    ctx.fillStyle = sleeveShadow;
    px(ctx, 2, armY, 1, 7);
    px(ctx, 6, armY + 1, 1, 6);
    ctx.fillStyle = handColor;
    px(ctx, 3, armY + 8, 4, 3);
    ctx.fillStyle = handShadow;
    px(ctx, 3, armY + 10, 4, 1);

    // Right arm
    ctx.fillStyle = sleeveColor;
    px(ctx, 25, armY, 5, 8);
    ctx.fillStyle = sleeveShadow;
    px(ctx, 29, armY, 1, 7);
    px(ctx, 25, armY + 1, 1, 6);
    ctx.fillStyle = handColor;
    px(ctx, 25, armY + 8, 4, 3);
    ctx.fillStyle = handShadow;
    px(ctx, 25, armY + 10, 4, 1);
  }
}

// ---- Head ----

function drawHead(
  ctx: CanvasRenderingContext2D,
  c: AgentColors,
  isBlinking: boolean,
  isError: boolean,
  isThinking: boolean,
  isWorking: boolean,
  isIdle: boolean,
  isWaiting: boolean,
) {
  // Head occupies y=1 to y=14, centered at x=16
  const hx = 9;  // head left x
  const hy = 2;  // head top y
  const hw = 14; // head width
  const hh = 12; // head height

  // ---- Neck (below head, above body) ----
  ctx.fillStyle = c.skin;
  px(ctx, 13, 13, 6, 3);
  cpx(ctx, c.skinShadow, 17, 13, 2, 3);

  // ---- Head shape (rounded rectangle) ----
  // Main face
  ctx.fillStyle = c.skin;
  px(ctx, hx + 1, hy, hw - 2, hh);       // main block
  px(ctx, hx, hy + 1, hw, hh - 2);        // wider middle
  // This creates a rounded rect by overlapping

  // Face shadow (right side, multi-level)
  ctx.fillStyle = c.skinShadow;
  px(ctx, hx + hw - 2, hy + 2, 2, hh - 4);  // right face shadow
  ctx.fillStyle = darken(c.skinShadow, 0.1);
  px(ctx, hx + hw - 1, hy + 3, 1, hh - 6);  // deeper shadow edge

  // ---- Ears ----
  ctx.fillStyle = c.skin;
  px(ctx, hx - 2, hy + 3, 2, 4);    // left ear
  px(ctx, hx + hw, hy + 3, 2, 4);   // right ear
  // Ear inner detail
  ctx.fillStyle = c.skinShadow;
  px(ctx, hx - 1, hy + 4, 1, 2);    // left ear hollow
  px(ctx, hx + hw, hy + 4, 1, 2);   // right ear hollow

  // ---- Eyes ----
  const eyeY = hy + 5;
  const leftEyeX = hx + 2;
  const rightEyeX = hx + hw - 6;

  if (isBlinking) {
    // Closed eyes — horizontal lines
    ctx.fillStyle = '#333333';
    px(ctx, leftEyeX, eyeY + 1, 4, 1);
    px(ctx, rightEyeX, eyeY + 1, 4, 1);
    // Eyelashes
    ctx.fillStyle = '#444444';
    px(ctx, leftEyeX, eyeY + 2, 1, 1);
    px(ctx, leftEyeX + 3, eyeY + 2, 1, 1);
    px(ctx, rightEyeX, eyeY + 2, 1, 1);
    px(ctx, rightEyeX + 3, eyeY + 2, 1, 1);
  } else {
    // ---- Open eyes (RPG Maker style: white sclera, dark pupil, highlight) ----
    // White sclera (3x3)
    ctx.fillStyle = '#FFFFFF';
    px(ctx, leftEyeX, eyeY, 4, 3);
    px(ctx, rightEyeX, eyeY, 4, 3);

    // Eye outline (top and bottom)
    ctx.fillStyle = '#444444';
    px(ctx, leftEyeX, eyeY - 1, 4, 1);  // top outline
    px(ctx, rightEyeX, eyeY - 1, 4, 1);
    // Bottom eyelash
    ctx.fillStyle = '#555555';
    px(ctx, leftEyeX, eyeY + 3, 4, 1);
    px(ctx, rightEyeX, eyeY + 3, 4, 1);

    // Pupil color (dark, 2x2)
    ctx.fillStyle = '#222233';
    px(ctx, leftEyeX + 1, eyeY + 1, 2, 2);
    px(ctx, rightEyeX + 1, eyeY + 1, 2, 2);

    // Eye highlight (white sparkle, 1x1 top-left of pupil)
    ctx.fillStyle = '#FFFFFF';
    px(ctx, leftEyeX + 1, eyeY, 1, 1);
    px(ctx, rightEyeX + 1, eyeY, 1, 1);

    // Secondary highlight (subtle)
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    px(ctx, leftEyeX + 3, eyeY + 2, 1, 1);
    px(ctx, rightEyeX + 3, eyeY + 2, 1, 1);
  }

  // ---- Eyebrows ----
  if (isError) {
    // Angry V-shaped eyebrows
    ctx.fillStyle = darken(c.hair, 0.2);
    // Left brow: angled down toward center (\)
    px(ctx, leftEyeX, eyeY - 3, 1, 1);
    px(ctx, leftEyeX + 1, eyeY - 2, 2, 1);
    px(ctx, leftEyeX + 3, eyeY - 2, 1, 1);
    // Right brow: angled down toward center (/)
    px(ctx, rightEyeX, eyeY - 2, 1, 1);
    px(ctx, rightEyeX + 1, eyeY - 2, 2, 1);
    px(ctx, rightEyeX + 3, eyeY - 3, 1, 1);
  } else if (isThinking) {
    // Raised eyebrows (arched)
    ctx.fillStyle = darken(c.hair, 0.1);
    px(ctx, leftEyeX, eyeY - 2, 4, 1);
    px(ctx, leftEyeX + 1, eyeY - 3, 2, 1);
    px(ctx, rightEyeX, eyeY - 2, 4, 1);
    px(ctx, rightEyeX + 1, eyeY - 3, 2, 1);
  } else if (isWorking) {
    // Focused/slightly furrowed
    ctx.fillStyle = darken(c.hair, 0.1);
    px(ctx, leftEyeX, eyeY - 2, 4, 1);
    px(ctx, rightEyeX, eyeY - 2, 4, 1);
  } else {
    // Normal eyebrows
    ctx.fillStyle = darken(c.hair, 0.1);
    px(ctx, leftEyeX, eyeY - 2, 3, 1);
    px(ctx, rightEyeX + 1, eyeY - 2, 3, 1);
  }

  // ---- Nose ----
  ctx.fillStyle = c.skinShadow;
  px(ctx, hx + hw / 2 - 1, hy + 8, 2, 2);
  // Nose highlight
  ctx.fillStyle = lighten(c.skin, 0.1);
  px(ctx, hx + hw / 2 - 1, hy + 8, 1, 1);

  // ---- Mouth ----
  const mouthY = hy + 10;
  const mouthX = hx + hw / 2 - 2;

  if (isError) {
    // Frown / grimace
    ctx.fillStyle = '#CC3333';
    px(ctx, mouthX, mouthY + 1, 1, 1);
    px(ctx, mouthX + 1, mouthY, 2, 1);
    px(ctx, mouthX + 3, mouthY + 1, 1, 1);
    // Teeth showing (clenched)
    ctx.fillStyle = '#FFFFFF';
    px(ctx, mouthX + 1, mouthY + 1, 2, 1);
  } else if (isIdle) {
    // Happy smile
    ctx.fillStyle = '#AA7755';
    px(ctx, mouthX, mouthY, 1, 1);
    px(ctx, mouthX + 1, mouthY + 1, 2, 1);
    px(ctx, mouthX + 3, mouthY, 1, 1);
  } else if (isWorking) {
    // Focused small mouth
    ctx.fillStyle = '#AA7755';
    px(ctx, mouthX + 1, mouthY, 2, 1);
  } else if (isThinking) {
    // Slightly open "hmm"
    ctx.fillStyle = '#AA7755';
    px(ctx, mouthX + 1, mouthY, 2, 1);
    ctx.fillStyle = '#996644';
    px(ctx, mouthX + 1, mouthY + 1, 2, 1);
  } else if (isWaiting) {
    // Small 'o' mouth
    ctx.fillStyle = '#AA7755';
    px(ctx, mouthX + 1, mouthY, 2, 2);
    ctx.fillStyle = '#995544';
    px(ctx, mouthX + 1, mouthY + 1, 2, 1);
  } else {
    // Neutral
    ctx.fillStyle = '#AA7755';
    px(ctx, mouthX + 1, mouthY, 2, 1);
  }

  // ---- Blush cheeks (idle) ----
  if (isIdle) {
    ctx.fillStyle = 'rgba(255,120,120,0.35)';
    px(ctx, hx + 1, hy + 8, 2, 2);
    px(ctx, hx + hw - 3, hy + 8, 2, 2);
  }

  // ---- Error red tint overlay ----
  if (isError) {
    ctx.fillStyle = 'rgba(200,50,50,0.12)';
    px(ctx, hx, hy + 1, hw, hh - 2);
  }
}

// ---- Hair ----

function drawHair(ctx: CanvasRenderingContext2D, c: AgentColors) {
  const hx = 9;   // head left x
  const hy = 2;    // head top y
  const hw = 14;   // head width

  const hairLight = lighten(c.hair, 0.2);
  const hairDark = darken(c.hair, 0.25);

  switch (c.hairStyle) {
    case 'short': {
      // ---- Short, neat hair (Director style) ----
      // Base hair cap
      ctx.fillStyle = c.hair;
      px(ctx, hx, hy - 2, hw, 5);
      px(ctx, hx + 1, hy - 3, hw - 2, 2);
      // Rounded top
      px(ctx, hx + 2, hy - 4, hw - 4, 1);

      // Side hair
      px(ctx, hx - 1, hy - 1, 2, 5);
      px(ctx, hx + hw - 1, hy - 1, 2, 5);

      // Hair highlight (shine streak)
      ctx.fillStyle = hairLight;
      px(ctx, hx + 3, hy - 3, 3, 1);
      px(ctx, hx + 4, hy - 4, 2, 1);
      px(ctx, hx + 2, hy - 2, 4, 1);

      // Hair shadow (darker bottom edge)
      ctx.fillStyle = hairDark;
      px(ctx, hx, hy + 2, hw, 1);
      px(ctx, hx - 1, hy + 1, 1, 3);
      px(ctx, hx + hw, hy + 1, 1, 3);

      // Part line
      ctx.fillStyle = hairDark;
      px(ctx, hx + 5, hy - 3, 1, 3);
      break;
    }

    case 'spiky': {
      // ---- Spiky, wild hair (Git style) ----
      // Base hair
      ctx.fillStyle = c.hair;
      px(ctx, hx - 1, hy - 1, hw + 2, 4);
      px(ctx, hx, hy - 2, hw, 2);

      // Spikes (varied heights for dynamism)
      px(ctx, hx - 1, hy - 4, 3, 3);   // left spike
      px(ctx, hx + 2, hy - 6, 3, 5);   // tall left spike
      px(ctx, hx + 5, hy - 7, 2, 6);   // center-left tall spike
      px(ctx, hx + 7, hy - 5, 3, 4);   // center spike
      px(ctx, hx + 10, hy - 7, 2, 6);  // center-right tall spike
      px(ctx, hx + 12, hy - 5, 2, 4);  // right spike
      px(ctx, hx + 13, hy - 3, 2, 2);  // small right spike

      // Spike highlights
      ctx.fillStyle = hairLight;
      px(ctx, hx + 2, hy - 6, 1, 2);
      px(ctx, hx + 5, hy - 7, 1, 2);
      px(ctx, hx + 10, hy - 7, 1, 2);
      px(ctx, hx + 7, hy - 5, 1, 2);

      // Shadow at base
      ctx.fillStyle = hairDark;
      px(ctx, hx - 1, hy + 2, hw + 2, 1);

      // Side tufts
      ctx.fillStyle = c.hair;
      px(ctx, hx - 2, hy, 2, 4);
      px(ctx, hx + hw, hy, 2, 4);
      break;
    }

    case 'long': {
      // ---- Long, flowing hair (Frontend style) ----
      // Top cap
      ctx.fillStyle = c.hair;
      px(ctx, hx + 1, hy - 3, hw - 2, 2);
      px(ctx, hx, hy - 2, hw, 3);
      px(ctx, hx - 1, hy - 1, hw + 2, 4);

      // Rounded top
      px(ctx, hx + 3, hy - 4, hw - 6, 1);

      // Side hair flowing down (long!)
      px(ctx, hx - 2, hy + 1, 3, 12);
      px(ctx, hx + hw - 1, hy + 1, 3, 12);
      // Hair tapers at bottom
      px(ctx, hx - 1, hy + 13, 2, 2);
      px(ctx, hx + hw - 1, hy + 13, 2, 2);

      // Inner side hair (overlaps ears)
      px(ctx, hx - 1, hy + 2, 2, 8);
      px(ctx, hx + hw - 1, hy + 2, 2, 8);

      // Hair highlight (center shine)
      ctx.fillStyle = hairLight;
      px(ctx, hx + 4, hy - 3, 4, 1);
      px(ctx, hx + 3, hy - 2, 5, 1);
      px(ctx, hx + 5, hy - 4, 2, 1);

      // Hair shadow
      ctx.fillStyle = hairDark;
      px(ctx, hx - 2, hy + 8, 2, 5);
      px(ctx, hx + hw, hy + 8, 2, 5);
      // Center part
      ctx.fillStyle = hairDark;
      px(ctx, hx + hw / 2, hy - 2, 1, 3);

      // Bangs fringe over forehead
      ctx.fillStyle = c.hair;
      px(ctx, hx + 1, hy + 1, 4, 2);
      px(ctx, hx + hw - 5, hy + 1, 4, 2);
      ctx.fillStyle = hairLight;
      px(ctx, hx + 2, hy + 1, 2, 1);
      break;
    }

    case 'curly': {
      // ---- Curly, voluminous hair (Backend style) ----
      // Base cap
      ctx.fillStyle = c.hair;
      px(ctx, hx - 1, hy - 1, hw + 2, 4);
      px(ctx, hx, hy - 2, hw, 2);

      // Curly bumps on top (rounded lumps)
      px(ctx, hx - 2, hy - 3, 4, 3);
      px(ctx, hx + 1, hy - 4, 4, 3);
      px(ctx, hx + 5, hy - 5, 3, 4);
      px(ctx, hx + 8, hy - 4, 4, 3);
      px(ctx, hx + 12, hy - 3, 3, 3);

      // Curly sides
      px(ctx, hx - 2, hy, 3, 6);
      px(ctx, hx + hw - 1, hy, 3, 6);
      // Extra curl at sides
      px(ctx, hx - 3, hy + 2, 2, 3);
      px(ctx, hx + hw, hy + 2, 2, 3);

      // Curl highlights (round shine spots)
      ctx.fillStyle = hairLight;
      px(ctx, hx + 1, hy - 4, 2, 1);
      px(ctx, hx + 5, hy - 5, 2, 1);
      px(ctx, hx + 9, hy - 4, 2, 1);
      px(ctx, hx - 2, hy + 1, 1, 2);
      px(ctx, hx + hw, hy + 1, 1, 2);

      // Curl shadow (depth between curls)
      ctx.fillStyle = hairDark;
      px(ctx, hx + 3, hy - 3, 1, 2);
      px(ctx, hx + 7, hy - 4, 1, 2);
      px(ctx, hx + 11, hy - 3, 1, 2);
      px(ctx, hx - 2, hy + 4, 1, 2);
      px(ctx, hx + hw, hy + 4, 1, 2);
      break;
    }

    case 'ponytail': {
      // ---- Ponytail hair (Docs style) ----
      // Top cap (similar to short, but with ponytail)
      ctx.fillStyle = c.hair;
      px(ctx, hx, hy - 2, hw, 5);
      px(ctx, hx + 1, hy - 3, hw - 2, 2);
      px(ctx, hx + 3, hy - 4, hw - 6, 1);

      // Side bangs (fringe on forehead)
      px(ctx, hx, hy + 1, 3, 2);
      px(ctx, hx + hw - 3, hy + 1, 3, 2);

      // Hair tie base (back of head, going right)
      px(ctx, hx + hw - 2, hy + 1, 3, 3);

      // Ponytail (flowing behind/to the right)
      px(ctx, hx + hw + 1, hy + 2, 3, 3);
      px(ctx, hx + hw + 2, hy + 5, 2, 4);
      px(ctx, hx + hw + 2, hy + 9, 2, 3);
      // Ponytail tip
      px(ctx, hx + hw + 3, hy + 11, 1, 2);

      // Ponytail highlight
      ctx.fillStyle = hairLight;
      px(ctx, hx + hw + 1, hy + 2, 1, 2);
      px(ctx, hx + hw + 2, hy + 5, 1, 3);

      // Ponytail shadow
      ctx.fillStyle = hairDark;
      px(ctx, hx + hw + 3, hy + 3, 1, 2);
      px(ctx, hx + hw + 3, hy + 7, 1, 3);

      // Hair tie (accent colored rubber band)
      ctx.fillStyle = c.accent;
      px(ctx, hx + hw, hy + 3, 2, 2);
      ctx.fillStyle = lighten(c.accent, 0.3);
      px(ctx, hx + hw, hy + 3, 1, 1);

      // Top highlight
      ctx.fillStyle = hairLight;
      px(ctx, hx + 3, hy - 3, 4, 1);
      px(ctx, hx + 4, hy - 4, 3, 1);

      // Hair shadow
      ctx.fillStyle = hairDark;
      px(ctx, hx, hy + 2, hw, 1);
      break;
    }
  }
}

// ---- Domain Accessories ----

function drawAccessory(
  ctx: CanvasRenderingContext2D,
  domain: string,
  c: AgentColors,
  isSitting: boolean,
) {
  switch (domain) {
    case 'director': {
      // ---- Gold-rimmed sunglasses ----
      const eyeY = 6;
      // Gold frame
      ctx.fillStyle = '#DAA520';
      // Left lens frame
      px(ctx, 10, eyeY, 5, 1);      // top
      px(ctx, 10, eyeY + 4, 5, 1);  // bottom
      px(ctx, 10, eyeY, 1, 5);      // left
      px(ctx, 14, eyeY, 1, 5);      // right
      // Right lens frame
      px(ctx, 17, eyeY, 5, 1);
      px(ctx, 17, eyeY + 4, 5, 1);
      px(ctx, 17, eyeY, 1, 5);
      px(ctx, 21, eyeY, 1, 5);
      // Bridge
      px(ctx, 15, eyeY + 1, 2, 1);
      // Temple arms
      px(ctx, 8, eyeY + 1, 2, 1);
      px(ctx, 22, eyeY + 1, 2, 1);

      // Dark lenses
      ctx.fillStyle = '#111122';
      px(ctx, 11, eyeY + 1, 3, 3);
      px(ctx, 18, eyeY + 1, 3, 3);

      // Lens glare (light reflection)
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      px(ctx, 11, eyeY + 1, 2, 1);
      px(ctx, 18, eyeY + 1, 2, 1);
      // Secondary glare
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      px(ctx, 13, eyeY + 3, 1, 1);
      px(ctx, 20, eyeY + 3, 1, 1);

      // Gold frame highlight
      ctx.fillStyle = '#FFD700';
      px(ctx, 10, eyeY, 2, 1);
      px(ctx, 17, eyeY, 2, 1);
      break;
    }

    case 'frontend': {
      // ---- Cyan/blue thin-frame glasses ----
      const eyeY = 6;
      const frameColor = '#61DAFB';
      const frameDark = '#4AABBF';

      // Left lens frame (thin)
      ctx.fillStyle = frameColor;
      px(ctx, 10, eyeY, 5, 1);      // top
      px(ctx, 10, eyeY + 3, 5, 1);  // bottom
      px(ctx, 10, eyeY, 1, 4);      // left
      px(ctx, 14, eyeY, 1, 4);      // right
      // Right lens frame
      px(ctx, 17, eyeY, 5, 1);
      px(ctx, 17, eyeY + 3, 5, 1);
      px(ctx, 17, eyeY, 1, 4);
      px(ctx, 21, eyeY, 1, 4);
      // Bridge
      px(ctx, 15, eyeY + 1, 2, 1);
      // Temple arms
      px(ctx, 8, eyeY + 1, 2, 1);
      px(ctx, 22, eyeY + 1, 2, 1);

      // Frame shadow
      ctx.fillStyle = frameDark;
      px(ctx, 10, eyeY + 3, 5, 1);
      px(ctx, 17, eyeY + 3, 5, 1);

      // Slight lens tint
      ctx.fillStyle = 'rgba(97,218,251,0.1)';
      px(ctx, 11, eyeY + 1, 3, 2);
      px(ctx, 18, eyeY + 1, 3, 2);
      break;
    }

    case 'backend': {
      // ---- Headphones (green pads, headband) ----
      const padColor = '#68A063';
      const padDark = '#4A7A43';
      const bandColor = '#555555';
      const bandLight = '#777777';

      // Headband (arc over top of hair)
      ctx.fillStyle = bandColor;
      px(ctx, 8, -1, 16, 2);
      px(ctx, 10, -2, 12, 1);
      // Headband highlight
      ctx.fillStyle = bandLight;
      px(ctx, 11, -2, 10, 1);

      // Left ear pad
      ctx.fillStyle = padColor;
      px(ctx, 5, 3, 4, 6);
      ctx.fillStyle = padDark;
      px(ctx, 5, 3, 1, 6);  // outer edge shadow
      px(ctx, 5, 8, 4, 1);  // bottom shadow
      // Pad center detail
      ctx.fillStyle = lighten(padColor, 0.2);
      px(ctx, 6, 4, 2, 4);
      // Speaker mesh
      ctx.fillStyle = '#333333';
      px(ctx, 7, 5, 1, 1);
      px(ctx, 7, 7, 1, 1);

      // Right ear pad
      ctx.fillStyle = padColor;
      px(ctx, 23, 3, 4, 6);
      ctx.fillStyle = padDark;
      px(ctx, 26, 3, 1, 6);
      px(ctx, 23, 8, 4, 1);
      ctx.fillStyle = lighten(padColor, 0.2);
      px(ctx, 24, 4, 2, 4);
      ctx.fillStyle = '#333333';
      px(ctx, 24, 5, 1, 1);
      px(ctx, 24, 7, 1, 1);
      break;
    }

    case 'docs': {
      // ---- Yellow notebook held at side ----
      const nbX = isSitting ? 28 : 27;
      const nbY = isSitting ? 22 : 20;

      // Notebook body
      ctx.fillStyle = '#F7DF1E';
      px(ctx, nbX, nbY, 6, 8);
      // Notebook cover darker edge
      ctx.fillStyle = '#C9B100';
      px(ctx, nbX, nbY, 6, 1);       // top edge
      px(ctx, nbX, nbY, 1, 8);       // spine
      px(ctx, nbX, nbY + 7, 6, 1);   // bottom edge
      // Notebook highlight
      ctx.fillStyle = lighten('#F7DF1E', 0.3);
      px(ctx, nbX + 2, nbY + 1, 3, 1);

      // Lines on pages
      ctx.fillStyle = '#888888';
      px(ctx, nbX + 2, nbY + 3, 3, 1);
      px(ctx, nbX + 2, nbY + 5, 3, 1);
      // Title line
      ctx.fillStyle = '#666666';
      px(ctx, nbX + 2, nbY + 2, 2, 1);

      // Bookmark ribbon
      ctx.fillStyle = '#CC3333';
      px(ctx, nbX + 4, nbY, 1, 2);
      break;
    }

    // git: no extra accessory (branch icon on shirt is enough)
  }
}

// ---- Pre-render ----

export function prerenderCharacters(): Map<string, HTMLCanvasElement[]> {
  const cache = new Map<string, HTMLCanvasElement[]>();
  const domains = ['director', 'git', 'frontend', 'backend', 'docs'];
  const statuses = ['idle', 'working', 'thinking', 'error', 'waiting', 'searching', 'delivering', 'reviewing'];

  const canvasW = (CHAR_W + 16) * RENDER_SCALE;
  const canvasH = (CHAR_H + 16) * RENDER_SCALE;

  for (const domain of domains) {
    for (const status of statuses) {
      const frames: HTMLCanvasElement[] = [];
      const walkFrames = (status === 'delivering' || status === 'searching') ? 4 : 1;
      const armFrames = status === 'working' ? 2 : 1;
      const totalFrames = Math.max(walkFrames, armFrames);

      for (let i = 0; i < totalFrames; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const fCtx = canvas.getContext('2d')!;
        fCtx.imageSmoothingEnabled = false;

        fCtx.scale(RENDER_SCALE, RENDER_SCALE);
        fCtx.save();
        fCtx.translate(8, 12); // padding: 8px left, 12px top for tall hair (spiky)
        drawCharacter(fCtx, domain, status, {
          walkFrame: i % walkFrames,
          armFrame: i % armFrames,
          isBlinking: false,
        });
        fCtx.restore();

        frames.push(canvas);
      }

      // Blink frame (same as frame 0 but blinking) — last in array
      const blinkCanvas = document.createElement('canvas');
      blinkCanvas.width = canvasW;
      blinkCanvas.height = canvasH;
      const bCtx = blinkCanvas.getContext('2d')!;
      bCtx.imageSmoothingEnabled = false;
      bCtx.scale(RENDER_SCALE, RENDER_SCALE);
      bCtx.save();
      bCtx.translate(8, 12);
      drawCharacter(bCtx, domain, status, {
        walkFrame: 0,
        armFrame: 0,
        isBlinking: true,
      });
      bCtx.restore();
      frames.push(blinkCanvas);

      cache.set(`${domain}:${status}`, frames);
    }
  }

  return cache;
}
