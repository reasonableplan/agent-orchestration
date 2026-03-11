/**
 * RPG Maker (쯔꾸르) quality pixel-art tile renderer
 * Draws floor, walls, furniture, and decorations procedurally on Canvas
 */

import {
  TILE_SIZE,
  MAP_COLS,
  MAP_ROWS,
  WALL_ROWS,
  CANVAS_W,
  CANVAS_H,
  RENDER_SCALE,
  FURNITURE,
  type FurniturePlacement,
} from './sprite-config';

const T = TILE_SIZE;

/* ================================================================
   Seeded pseudo-random for deterministic per-tile variation
   ================================================================ */
function hash(a: number, b: number): number {
  let h = (a * 2654435761) ^ (b * 2246822519);
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  return ((h >>> 16) ^ h) >>> 0;
}
function rand(col: number, row: number, seed = 0): number {
  return (hash(col + seed * 137, row + seed * 311) & 0xffff) / 0x10000;
}

/* ================================================================
   Helper: draw a small filled circle
   ================================================================ */
function fillCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/* ================================================================
   Color palette
   ================================================================ */
const FLOOR_COLORS = ['#9E7E56', '#A08558', '#96794E', '#A88D60'];
const FLOOR_GRAIN = '#7A6040';
const FLOOR_KNOT = '#6A5030';
const FLOOR_BORDER = '#6E5538';

const WALL_COLORS = ['#B5A08A', '#B0988A', '#B8A490', '#AA9880'];
const MORTAR = '#C8BEB0';
const BRICK_HI = 'rgba(255,255,255,0.15)';
const BRICK_SH = 'rgba(0,0,0,0.12)';
const WALL_CAP = '#5A4A3A';
const WAINSCOT_BASE = '#6B5030';
const WAINSCOT_HI = '#8A6840';
const WAINSCOT_BEVEL_L = '#9A7850';
const WAINSCOT_BEVEL_D = '#4A3820';
const BASEBOARD = '#3E2E1E';

/* ================================================================
   FLOOR TILE — rich wood planks
   ================================================================ */
function drawFloorTile(ctx: CanvasRenderingContext2D, x: number, y: number, row: number, col: number) {
  // Base color with per-tile variation
  const ci = Math.floor(rand(col, row) * FLOOR_COLORS.length);
  ctx.fillStyle = FLOOR_COLORS[ci];
  ctx.fillRect(x, y, T, T);

  // Subtle brightness shift
  if (rand(col, row, 1) > 0.5) {
    ctx.fillStyle = 'rgba(255,240,200,0.06)';
    ctx.fillRect(x, y, T, T);
  }

  // Plank grain lines (4-5 thin lines)
  ctx.strokeStyle = FLOOR_GRAIN;
  ctx.lineWidth = 0.5;
  const grainCount = 4 + Math.floor(rand(col, row, 2) * 2);
  for (let i = 0; i < grainCount; i++) {
    const gy = y + 3 + (i * (T - 6)) / grainCount + rand(col, row, i + 10) * 3;
    ctx.globalAlpha = 0.25 + rand(col, row, i + 20) * 0.2;
    ctx.beginPath();
    ctx.moveTo(x + 1, gy);
    // Slightly wavy line
    const mid = x + T / 2;
    const wave = (rand(col, row, i + 30) - 0.5) * 2;
    ctx.quadraticCurveTo(mid, gy + wave, x + T - 1, gy + wave * 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Plank borders (darker lines between planks)
  ctx.fillStyle = FLOOR_BORDER;
  ctx.fillRect(x, y + T - 1, T, 1); // bottom
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x + T - 1, y, 1, T); // right
  ctx.globalAlpha = 1;

  // Occasional knot detail
  if (rand(col, row, 5) > 0.85) {
    const kx = x + 8 + Math.floor(rand(col, row, 6) * (T - 16));
    const ky = y + 8 + Math.floor(rand(col, row, 7) * (T - 16));
    ctx.fillStyle = FLOOR_KNOT;
    ctx.globalAlpha = 0.5;
    fillCircle(ctx, kx, ky, 2);
    ctx.globalAlpha = 0.3;
    fillCircle(ctx, kx, ky, 3.5);
    ctx.globalAlpha = 1;
  }

  // Shadow near wall (gradient)
  if (row === WALL_ROWS) {
    for (let s = 0; s < 10; s++) {
      ctx.fillStyle = `rgba(0,0,0,${0.18 * (1 - s / 10)})`;
      ctx.fillRect(x, y + s, T, 1);
    }
  }
  // Lighter far from wall for depth
  if (row === MAP_ROWS - 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    ctx.fillRect(x, y, T, T);
  }
}

/* ================================================================
   WALL TILE — detailed brick with mortar, highlights, shadows
   ================================================================ */
function drawWallTile(ctx: CanvasRenderingContext2D, x: number, y: number, row: number, col: number) {
  ctx.fillStyle = '#B5A690';
  ctx.fillRect(x, y, T, T);

  const brickH = 8;
  const brickW = 16;

  // Draw individual bricks
  for (let by = 0; by < T; by += brickH) {
    const brickRow = Math.floor(by / brickH);
    const offset = (brickRow + col) % 2 === 0 ? 0 : brickW / 2;

    for (let bx = -brickW; bx < T + brickW; bx += brickW) {
      const abx = bx + offset;
      const left = Math.max(0, abx);
      const right = Math.min(T, abx + brickW);
      if (left >= right) continue;

      // Brick fill with color variation
      const ci = Math.floor(rand(col * 4 + brickRow, Math.floor(abx / brickW), 50) * WALL_COLORS.length);
      ctx.fillStyle = WALL_COLORS[ci];
      ctx.fillRect(x + left, y + by, right - left, brickH);

      // Highlight top-left edge
      ctx.fillStyle = BRICK_HI;
      ctx.fillRect(x + left, y + by, right - left, 1);
      ctx.fillRect(x + left, y + by, 1, brickH);

      // Shadow bottom-right edge
      ctx.fillStyle = BRICK_SH;
      ctx.fillRect(x + left, y + by + brickH - 1, right - left, 1);
      ctx.fillRect(x + right - 1, y + by, 1, brickH);
    }

    // Mortar lines
    ctx.fillStyle = MORTAR;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x, y + by, T, 1);
    ctx.globalAlpha = 1;
  }

  // Vertical mortar
  for (let by = 0; by < T; by += brickH) {
    const brickRow = Math.floor(by / brickH);
    const offset = (brickRow + col) % 2 === 0 ? 0 : brickW / 2;
    for (let bx = offset; bx < T; bx += brickW) {
      ctx.fillStyle = MORTAR;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x + bx, y + by, 1, brickH);
      ctx.globalAlpha = 1;
    }
  }

  // Top cap (darker molding) on row 0
  if (row === 0) {
    ctx.fillStyle = WALL_CAP;
    ctx.fillRect(x, y, T, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x, y, T, 1);
  }

  // Wainscoting on bottom wall row
  if (row === WALL_ROWS - 1) {
    const wy = y + T - 14;
    // Wainscot base
    ctx.fillStyle = WAINSCOT_BASE;
    ctx.fillRect(x, wy, T, 14);

    // Top cap / molding
    ctx.fillStyle = WALL_CAP;
    ctx.fillRect(x, wy, T, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, wy, T, 1);

    // Panel bevels
    const panelW = T - 4;
    const px = x + 2;
    const py = wy + 3;
    const panelH = 8;
    // Outer bevel light (top & left)
    ctx.fillStyle = WAINSCOT_BEVEL_L;
    ctx.fillRect(px, py, panelW, 1);
    ctx.fillRect(px, py, 1, panelH);
    // Outer bevel dark (bottom & right)
    ctx.fillStyle = WAINSCOT_BEVEL_D;
    ctx.fillRect(px, py + panelH - 1, panelW, 1);
    ctx.fillRect(px + panelW - 1, py, 1, panelH);
    // Panel fill
    ctx.fillStyle = WAINSCOT_HI;
    ctx.fillRect(px + 1, py + 1, panelW - 2, panelH - 2);

    // Baseboard
    ctx.fillStyle = BASEBOARD;
    ctx.fillRect(x, y + T - 3, T, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y + T - 3, T, 1);
  }
}

/* ================================================================
   DESK — L-shape style, monitor, keyboard, mouse, coffee, papers, chair
   ================================================================ */
function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const pw = w * T;
  const ph = h * T;

  // ---- Office chair (BEHIND desk, drawn first so desk overlaps) ----
  // We actually draw the chair IN FRONT (below desk visually = higher y)
  const chairX = x + pw / 2;
  const chairY = y + ph + 2;

  // 5-star wheel base
  ctx.fillStyle = '#2A2A2A';
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
    const wx = chairX + Math.cos(angle) * 7;
    const wy = chairY + 14 + Math.sin(angle) * 4;
    fillCircle(ctx, wx, wy, 1.5);
    // Leg
    ctx.beginPath();
    ctx.moveTo(chairX, chairY + 12);
    ctx.lineTo(wx, wy);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Central pole
  ctx.fillStyle = '#444';
  ctx.fillRect(chairX - 1, chairY + 4, 2, 10);

  // Chair seat
  ctx.fillStyle = '#3A3A44';
  ctx.fillRect(chairX - 8, chairY + 2, 16, 6);
  ctx.fillStyle = '#4A4A55';
  ctx.fillRect(chairX - 7, chairY + 3, 14, 4);

  // Armrests
  ctx.fillStyle = '#333';
  ctx.fillRect(chairX - 9, chairY, 2, 6);
  ctx.fillRect(chairX + 7, chairY, 2, 6);

  // Chair back
  ctx.fillStyle = '#3A3A44';
  ctx.fillRect(chairX - 7, chairY - 10, 14, 12);
  ctx.fillStyle = '#4A4A55';
  ctx.fillRect(chairX - 6, chairY - 9, 12, 10);
  // Mesh pattern on chair back
  ctx.strokeStyle = '#3A3A44';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(chairX - 5, chairY - 8 + i * 3);
    ctx.lineTo(chairX + 5, chairY - 8 + i * 3);
    ctx.stroke();
  }

  // ---- Desk surface ----
  // Shadow under desk
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(x + 4, y + ph, pw - 4, 3);

  // Desk body
  ctx.fillStyle = '#5A3318';
  ctx.fillRect(x + 2, y + 6, pw - 4, ph - 6);

  // Wood grain on desk surface
  ctx.fillStyle = '#6B4226';
  ctx.fillRect(x + 3, y + 7, pw - 6, ph - 8);

  // Grain texture
  ctx.strokeStyle = '#5A3820';
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 6; i++) {
    const gy = y + 10 + i * ((ph - 14) / 6);
    ctx.beginPath();
    ctx.moveTo(x + 4, gy);
    ctx.lineTo(x + pw - 4, gy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Desk edge highlight (top)
  ctx.fillStyle = '#8B6240';
  ctx.fillRect(x + 2, y + 6, pw - 4, 3);
  // Desk edge shadow (bottom)
  ctx.fillStyle = '#3E2210';
  ctx.fillRect(x + 2, y + ph - 3, pw - 4, 3);
  // Right edge shadow
  ctx.fillStyle = '#4A2A16';
  ctx.fillRect(x + pw - 4, y + 6, 2, ph - 6);

  // Desk legs (front pair visible)
  ctx.fillStyle = '#3E2210';
  ctx.fillRect(x + 4, y + ph - 2, 4, 6);
  ctx.fillRect(x + pw - 8, y + ph - 2, 4, 6);
  // Leg highlight
  ctx.fillStyle = '#5A3A1A';
  ctx.fillRect(x + 4, y + ph - 2, 1, 6);
  ctx.fillRect(x + pw - 8, y + ph - 2, 1, 6);

  // ---- Monitor ----
  const monW = 24;
  const monH = 18;
  const monX = x + pw / 2 - monW / 2;
  const monY = y + 8;

  // Monitor bezel
  ctx.fillStyle = '#1A1A1A';
  ctx.fillRect(monX - 2, monY - 2, monW + 4, monH + 4);
  // Screen
  ctx.fillStyle = '#0D1117';
  ctx.fillRect(monX, monY, monW, monH);
  // Code on screen
  const codeColors = ['#44CC44', '#61DAFB', '#FFD700', '#FF7B72', '#D2A8FF'];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = codeColors[i];
    const lineW = 6 + Math.floor((hash(w, i) & 0xf) % 12);
    const indent = (i === 1 || i === 3) ? 4 : 2;
    ctx.fillRect(monX + indent, monY + 2 + i * 3, Math.min(lineW, monW - indent - 2), 1.5);
  }
  // Screen glow
  ctx.fillStyle = 'rgba(100,200,255,0.03)';
  ctx.fillRect(monX, monY, monW, monH);

  // Monitor stand
  ctx.fillStyle = '#333';
  ctx.fillRect(monX + monW / 2 - 2, monY + monH + 2, 4, 4);
  // Stand base (wide)
  ctx.fillStyle = '#2A2A2A';
  ctx.fillRect(monX + monW / 2 - 6, monY + monH + 5, 12, 2);
  ctx.fillStyle = '#444';
  ctx.fillRect(monX + monW / 2 - 6, monY + monH + 5, 12, 1);

  // ---- Keyboard ----
  const kbX = monX + 1;
  const kbY = monY + monH + 10;
  ctx.fillStyle = '#2A2A2A';
  ctx.fillRect(kbX, kbY, 20, 8);
  ctx.fillStyle = '#3A3A3A';
  ctx.fillRect(kbX + 1, kbY + 1, 18, 6);
  // Key rows
  ctx.fillStyle = '#4A4A4A';
  for (let kr = 0; kr < 3; kr++) {
    for (let kc = 0; kc < 6; kc++) {
      ctx.fillRect(kbX + 2 + kc * 3, kbY + 1.5 + kr * 2, 2, 1.5);
    }
  }

  // ---- Mouse + mousepad ----
  const mouseX = monX + monW + 2;
  const mouseY = kbY + 1;
  // Mousepad
  ctx.fillStyle = '#2A2A3A';
  ctx.fillRect(mouseX - 1, mouseY - 1, 10, 10);
  // Mouse
  ctx.fillStyle = '#444';
  ctx.fillRect(mouseX + 2, mouseY + 2, 4, 6);
  ctx.fillStyle = '#555';
  ctx.fillRect(mouseX + 2, mouseY + 2, 4, 2); // top buttons
  ctx.fillStyle = '#333';
  ctx.fillRect(mouseX + 3.5, mouseY + 2, 1, 3); // scroll wheel

  // ---- Coffee cup ----
  const cupX = x + 6;
  const cupY = y + 14;
  // Saucer
  ctx.fillStyle = '#DDD';
  ctx.fillRect(cupX - 1, cupY + 6, 10, 2);
  // Cup body
  ctx.fillStyle = '#F0F0F0';
  ctx.fillRect(cupX, cupY, 8, 7);
  ctx.fillStyle = '#E0E0E0';
  ctx.fillRect(cupX + 1, cupY, 6, 1); // rim
  // Coffee inside
  ctx.fillStyle = '#5C3317';
  ctx.fillRect(cupX + 1, cupY + 1, 6, 3);
  // Handle
  ctx.fillStyle = '#E8E8E8';
  ctx.fillRect(cupX + 8, cupY + 2, 2, 4);
  ctx.fillRect(cupX + 9, cupY + 1, 1, 1);
  ctx.fillRect(cupX + 9, cupY + 5, 1, 1);
  // Steam
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#DDD';
  ctx.fillRect(cupX + 2, cupY - 3, 1, 2);
  ctx.fillRect(cupX + 4, cupY - 4, 1, 3);
  ctx.fillRect(cupX + 6, cupY - 2, 1, 2);
  ctx.globalAlpha = 1;

  // ---- Papers ----
  const papX = x + pw - 18;
  const papY = y + 12;
  // Paper 1
  ctx.fillStyle = '#F8F8F0';
  ctx.fillRect(papX, papY, 12, 14);
  ctx.fillStyle = '#CCC';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(papX + 2, papY + 2 + i * 3, 8, 1);
  }
  // Paper 2 (slightly offset)
  ctx.fillStyle = '#FFF8E8';
  ctx.fillRect(papX + 3, papY + 2, 10, 12);
  ctx.fillStyle = '#BBB';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(papX + 5, papY + 4 + i * 3, 6, 1);
  }
}

/* ================================================================
   SOFA — detailed cushions, armrests, throw pillow
   ================================================================ */
function drawSofa(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const pw = w * T;
  const ph = h * T;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(x + 6, y + ph - 2, pw - 8, 4);

  // Legs (small wooden legs at corners)
  ctx.fillStyle = '#5A3A1A';
  ctx.fillRect(x + 6, y + ph - 3, 4, 4);
  ctx.fillRect(x + pw - 10, y + ph - 3, 4, 4);

  // Back (darker, taller)
  ctx.fillStyle = '#7A2828';
  ctx.fillRect(x + 4, y, pw - 8, 14);
  ctx.fillStyle = '#6A1E1E';
  ctx.fillRect(x + 4, y, pw - 8, 2); // top edge dark
  ctx.fillStyle = '#8A3232';
  ctx.fillRect(x + 6, y + 3, pw - 12, 9); // back cushion face

  // Sofa base frame
  ctx.fillStyle = '#8B3232';
  ctx.fillRect(x + 2, y + 12, pw - 4, ph - 14);

  // Armrests (rounded look)
  ctx.fillStyle = '#7A2828';
  ctx.fillRect(x, y + 4, 8, ph - 6);
  ctx.fillRect(x + pw - 8, y + 4, 8, ph - 6);
  // Armrest highlight
  ctx.fillStyle = '#9A4040';
  ctx.fillRect(x + 1, y + 5, 6, 2);
  ctx.fillRect(x + pw - 7, y + 5, 6, 2);
  // Armrest inner shadow
  ctx.fillStyle = '#6A2020';
  ctx.fillRect(x + 6, y + 6, 2, ph - 10);
  ctx.fillRect(x + pw - 8, y + 6, 2, ph - 10);

  // Seat cushions (3 divisions)
  const cushionW = Math.floor((pw - 20) / 3);
  for (let i = 0; i < 3; i++) {
    const cx = x + 10 + i * cushionW;
    const cy = y + 14;
    const cw = cushionW - 2;
    const ch = ph - 20;
    // Cushion body
    ctx.fillStyle = '#A04545';
    ctx.fillRect(cx, cy, cw, ch);
    // Cushion highlight (top)
    ctx.fillStyle = '#B85555';
    ctx.fillRect(cx + 1, cy, cw - 2, 3);
    // Cushion shadow (bottom)
    ctx.fillStyle = '#883030';
    ctx.fillRect(cx + 1, cy + ch - 2, cw - 2, 2);
    // Cushion stitch line
    ctx.strokeStyle = '#8A3535';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy + ch / 2);
    ctx.lineTo(cx + cw - 2, cy + ch / 2);
    ctx.stroke();
  }

  // Throw pillow (accent color on left side)
  const pillowX = x + 12;
  const pillowY = y + 14;
  ctx.fillStyle = '#E8C85A';
  ctx.fillRect(pillowX, pillowY, 10, 10);
  ctx.fillStyle = '#D4B440';
  ctx.fillRect(pillowX + 1, pillowY + 1, 8, 8);
  ctx.fillStyle = '#F0D868';
  ctx.fillRect(pillowX + 2, pillowY + 2, 3, 3);
  // Pillow edge highlight
  ctx.fillStyle = '#F8E080';
  ctx.fillRect(pillowX, pillowY, 10, 1);
}

/* ================================================================
   BOOKSHELF — packed with colorful books, decorations
   ================================================================ */
function drawBookshelf(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const pw = w * T;
  const ph = h * T;

  // Shadow behind shelf
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(x + 3, y + 3, pw, ph);

  // Shelf frame (dark wood)
  ctx.fillStyle = '#4A2A10';
  ctx.fillRect(x, y, pw, ph);
  // Inner back
  ctx.fillStyle = '#6A4A2A';
  ctx.fillRect(x + 3, y + 3, pw - 6, ph - 6);

  // 4 shelves
  const shelfCount = 4;
  const shelfH = Math.floor((ph - 6) / shelfCount);

  const bookColors = [
    '#CC3333', '#3366CC', '#33AA33', '#CC9900', '#9933CC',
    '#CC6633', '#339999', '#AA3366', '#668833', '#3355AA',
    '#DD7722', '#5544AA', '#228877', '#BB4455',
  ];

  for (let shelf = 0; shelf < shelfCount; shelf++) {
    const sy = y + 3 + shelf * shelfH;

    // Shelf board
    ctx.fillStyle = '#5A3A1A';
    ctx.fillRect(x + 3, sy + shelfH - 3, pw - 6, 3);
    // Shelf board highlight
    ctx.fillStyle = '#7A5A3A';
    ctx.fillRect(x + 3, sy + shelfH - 3, pw - 6, 1);

    // Books
    let bx = x + 5;
    const maxBx = x + pw - 5;
    const bookBase = sy + 2;
    const maxBookH = shelfH - 6;
    let bookIdx = shelf * 7 + 1;

    while (bx < maxBx - 3) {
      const bw = 3 + Math.floor(rand(bookIdx, shelf, 80) * 4);
      const bh = maxBookH - Math.floor(rand(bookIdx, shelf, 81) * 4);
      const color = bookColors[bookIdx % bookColors.length];
      const lean = rand(bookIdx, shelf, 82) > 0.85; // occasionally lean

      if (bx + bw > maxBx) break;

      ctx.save();
      if (lean) {
        ctx.translate(bx + bw / 2, bookBase + bh);
        ctx.rotate(-0.08);
        ctx.translate(-(bx + bw / 2), -(bookBase + bh));
      }

      // Book body
      ctx.fillStyle = color;
      ctx.fillRect(bx, bookBase + (maxBookH - bh), bw, bh);

      // Spine highlight
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(bx, bookBase + (maxBookH - bh), 1, bh);

      // Spine shadow (right edge)
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(bx + bw - 1, bookBase + (maxBookH - bh), 1, bh);

      // Spine title decoration (tiny gold/white line)
      if (bh > 8) {
        ctx.fillStyle = 'rgba(255,255,200,0.5)';
        ctx.fillRect(bx + 1, bookBase + (maxBookH - bh) + Math.floor(bh * 0.3), bw - 2, 1);
      }

      ctx.restore();
      bx += bw + 1;
      bookIdx++;
    }
  }

  // Decorative items on top shelf
  // Small globe
  const globeX = x + pw - 14;
  const globeY = y + 6;
  ctx.fillStyle = '#5588AA';
  fillCircle(ctx, globeX, globeY + 4, 4);
  ctx.fillStyle = '#44AA44';
  ctx.fillRect(globeX - 2, globeY + 2, 3, 3);
  // Globe stand
  ctx.fillStyle = '#8B6840';
  ctx.fillRect(globeX - 1, globeY + 8, 2, 3);
  ctx.fillRect(globeX - 3, globeY + 10, 6, 1);

  // Frame edges (bevel)
  ctx.fillStyle = '#5A3818';
  ctx.fillRect(x, y, pw, 2); // top
  ctx.fillRect(x, y, 3, ph); // left
  ctx.fillStyle = '#3A2008';
  ctx.fillRect(x, y + ph - 3, pw, 3); // bottom
  ctx.fillRect(x + pw - 3, y, 3, ph); // right
}

/* ================================================================
   WHITEBOARD — kanban cards, "DEV FLOW" title, markers
   ================================================================ */
function drawWhiteboard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const pw = w * T;
  const ph = h * T;

  // Metal frame (silver/gray)
  ctx.fillStyle = '#888890';
  ctx.fillRect(x - 1, y - 1, pw + 2, ph + 2);
  // Frame bevel
  ctx.fillStyle = '#A0A0A8';
  ctx.fillRect(x - 1, y - 1, pw + 2, 2);
  ctx.fillRect(x - 1, y - 1, 2, ph + 2);
  ctx.fillStyle = '#606068';
  ctx.fillRect(x - 1, y + ph - 1, pw + 2, 2);
  ctx.fillRect(x + pw - 1, y - 1, 2, ph + 2);

  // White surface
  ctx.fillStyle = '#F5F5EC';
  ctx.fillRect(x + 3, y + 3, pw - 6, ph - 6);

  // Title "DEV FLOW"
  ctx.fillStyle = '#333';
  ctx.font = 'bold 5px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('DEV FLOW', x + pw / 2, y + 10);

  // Column dividers (5 columns)
  const cols = 5;
  const colW = (pw - 10) / cols;
  ctx.strokeStyle = '#CCCCBB';
  ctx.lineWidth = 0.5;
  for (let i = 1; i < cols; i++) {
    const lx = x + 5 + i * colW;
    ctx.beginPath();
    ctx.moveTo(lx, y + 13);
    ctx.lineTo(lx, y + ph - 8);
    ctx.stroke();
  }

  // Column headers
  const headerColors = ['#E74C3C', '#F5A623', '#4A90D9', '#9B59B6', '#2ECC71'];
  const headerLabels = ['TODO', 'WIP', 'TEST', 'REV', 'DONE'];
  for (let i = 0; i < cols; i++) {
    const hx = x + 6 + i * colW;
    ctx.fillStyle = headerColors[i];
    ctx.fillRect(hx, y + 13, colW - 3, 5);
    ctx.fillStyle = '#FFF';
    ctx.font = '3px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(headerLabels[i], hx + (colW - 3) / 2, y + 17);
  }

  // Cards in each column (small colored rectangles)
  const cardColors = ['#FFE0E0', '#E0F0FF', '#E0FFE0', '#FFF0D0', '#F0E0FF'];
  for (let i = 0; i < cols; i++) {
    const numCards = 2 + Math.floor(rand(i, 0, 99) * 3);
    for (let c = 0; c < numCards; c++) {
      const cx = x + 7 + i * colW;
      const cy = y + 21 + c * 8;
      if (cy + 6 > y + ph - 10) break;
      ctx.fillStyle = cardColors[(i + c) % cardColors.length];
      ctx.fillRect(cx, cy, colW - 5, 6);
      // Card text line
      ctx.fillStyle = '#999';
      ctx.fillRect(cx + 1, cy + 2, colW - 9, 1);
      ctx.fillRect(cx + 1, cy + 4, (colW - 9) * 0.6, 0.5);
    }
  }

  // Flowchart arrow (tiny)
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + pw / 2 - 20, y + ph - 16);
  ctx.lineTo(x + pw / 2 + 20, y + ph - 16);
  ctx.stroke();
  // Arrow head
  ctx.fillStyle = '#888';
  ctx.beginPath();
  ctx.moveTo(x + pw / 2 + 20, y + ph - 16);
  ctx.lineTo(x + pw / 2 + 16, y + ph - 18);
  ctx.lineTo(x + pw / 2 + 16, y + ph - 14);
  ctx.closePath();
  ctx.fill();

  // Marker tray
  ctx.fillStyle = '#777';
  ctx.fillRect(x + pw / 4, y + ph - 1, pw / 2, 4);
  ctx.fillStyle = '#888';
  ctx.fillRect(x + pw / 4, y + ph - 1, pw / 2, 1);

  // Markers
  const markerColors = ['#CC3333', '#3366CC', '#33AA33'];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = markerColors[i];
    ctx.fillRect(x + pw / 4 + 4 + i * 14, y + ph, 10, 2);
    // Marker cap
    ctx.fillStyle = '#222';
    ctx.fillRect(x + pw / 4 + 4 + i * 14, y + ph, 2, 2);
  }

  ctx.textAlign = 'left';
}

/* ================================================================
   COFFEE MACHINE — machine on a small table, steam
   ================================================================ */
function drawCoffeeMachine(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Small table
  ctx.fillStyle = '#6B4226';
  ctx.fillRect(x + 2, y + T - 2, T - 4, T + 2);
  // Table top highlight
  ctx.fillStyle = '#8B6240';
  ctx.fillRect(x + 2, y + T - 2, T - 4, 2);
  // Table shadow
  ctx.fillStyle = '#4A2A10';
  ctx.fillRect(x + 2, y + T * 2 - 4, T - 4, 3);
  // Table legs
  ctx.fillStyle = '#4A2A10';
  ctx.fillRect(x + 4, y + T * 2 - 2, 3, 4);
  ctx.fillRect(x + T - 7, y + T * 2 - 2, 3, 4);

  // Machine body
  ctx.fillStyle = '#2A2A2A';
  ctx.fillRect(x + 5, y + 2, T - 10, T - 6);
  // Machine face (darker)
  ctx.fillStyle = '#1A1A1A';
  ctx.fillRect(x + 7, y + 4, T - 14, 12);
  // Display (tiny green)
  ctx.fillStyle = '#22AA22';
  ctx.fillRect(x + 8, y + 5, 8, 4);
  ctx.fillStyle = '#115511';
  ctx.fillRect(x + 9, y + 6, 6, 2);

  // Buttons
  ctx.fillStyle = '#FF3333';
  fillCircle(ctx, x + 10, y + T - 7, 1.5);
  ctx.fillStyle = '#33FF33';
  fillCircle(ctx, x + 16, y + T - 7, 1.5);
  ctx.fillStyle = '#FFD700';
  fillCircle(ctx, x + 22, y + T - 7, 1.5);

  // Drip nozzle
  ctx.fillStyle = '#555';
  ctx.fillRect(x + 12, y + 16, 6, 3);

  // Cup on drip tray
  ctx.fillStyle = '#DDD';
  ctx.fillRect(x + 8, y + T + 2, 10, 9);
  ctx.fillStyle = '#EEE';
  ctx.fillRect(x + 9, y + T + 2, 8, 2);
  // Coffee inside
  ctx.fillStyle = '#5C3317';
  ctx.fillRect(x + 9, y + T + 4, 8, 4);

  // Steam
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#FFF';
  ctx.fillRect(x + 10, y + T - 1, 1, 3);
  ctx.fillRect(x + 13, y + T - 2, 1, 4);
  ctx.fillRect(x + 16, y + T, 1, 2);
  ctx.globalAlpha = 1;

  // "COFFEE" label (tiny)
  ctx.fillStyle = '#AA8855';
  ctx.font = '3px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('COFFEE', x + T / 2, y + 22);
  ctx.textAlign = 'left';
}

/* ================================================================
   PLANT — terracotta pot with detailed leaves
   ================================================================ */
function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Pot shadow
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  fillCircle(ctx, x + T / 2, y + T * 2 - 4, 10);

  // Terracotta pot
  ctx.fillStyle = '#B8652A';
  ctx.fillRect(x + 7, y + T + 6, T - 14, T - 10);
  // Pot rim
  ctx.fillStyle = '#C87840';
  ctx.fillRect(x + 5, y + T + 2, T - 10, 5);
  // Pot rim highlight
  ctx.fillStyle = '#D89050';
  ctx.fillRect(x + 5, y + T + 2, T - 10, 2);
  // Pot base
  ctx.fillStyle = '#A05A20';
  ctx.fillRect(x + 8, y + T * 2 - 6, T - 16, 3);
  // Pot shadow line
  ctx.fillStyle = '#8A4A18';
  ctx.fillRect(x + 9, y + T + 14, T - 18, 2);

  // Soil
  ctx.fillStyle = '#3A2815';
  ctx.fillRect(x + 7, y + T + 4, T - 14, 4);
  ctx.fillStyle = '#4A3420';
  ctx.fillRect(x + 8, y + T + 4, T - 16, 2);

  // Central stem
  ctx.fillStyle = '#2A6B1A';
  ctx.fillRect(x + 14, y + 10, 2, T - 4);

  // Leaf clusters (3 shades for depth)
  const leaves: Array<[number, number, number, number, string]> = [
    // [offsetX, offsetY, w, h, color]
    [2, 4, 10, 8, '#228B22'],
    [T - 12, 6, 10, 7, '#228B22'],
    [6, 0, 12, 10, '#2EA82E'],
    [4, 8, 8, 6, '#1E7A1E'],
    [T - 10, 10, 8, 5, '#1E7A1E'],
    [8, 2, 8, 6, '#44BB44'],
    [10, -2, 10, 8, '#3AAA3A'],
  ];
  for (const [ox, oy, lw, lh, color] of leaves) {
    ctx.fillStyle = color;
    // Leaf shape (rounded using overlapping rects)
    ctx.fillRect(x + ox + 1, y + oy, lw - 2, lh);
    ctx.fillRect(x + ox, y + oy + 1, lw, lh - 2);
  }

  // Leaf vein details
  ctx.strokeStyle = 'rgba(0,60,0,0.3)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x + 7, y + 8);
  ctx.lineTo(x + 12, y + 5);
  ctx.moveTo(x + T - 7, y + 10);
  ctx.lineTo(x + T - 12, y + 7);
  ctx.stroke();

  // Some leaves drooping
  ctx.fillStyle = '#2EA82E';
  ctx.fillRect(x + 1, y + 12, 6, 4);
  ctx.fillRect(x + T - 7, y + 14, 6, 3);
}

/* ================================================================
   PLANT-SMALL — tiny potted plant, 1 tile
   ================================================================ */
function drawPlantSmall(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Small pot
  ctx.fillStyle = '#B8652A';
  ctx.fillRect(x + 10, y + 18, 12, 10);
  ctx.fillStyle = '#C87840';
  ctx.fillRect(x + 9, y + 16, 14, 4);
  ctx.fillStyle = '#D89050';
  ctx.fillRect(x + 9, y + 16, 14, 1);

  // Soil
  ctx.fillStyle = '#3A2815';
  ctx.fillRect(x + 10, y + 17, 12, 2);

  // Small stem
  ctx.fillStyle = '#2A6B1A';
  ctx.fillRect(x + 15, y + 10, 2, 8);

  // 4 small leaves
  ctx.fillStyle = '#228B22';
  ctx.fillRect(x + 11, y + 8, 6, 5);
  ctx.fillStyle = '#2EA82E';
  ctx.fillRect(x + 15, y + 6, 6, 5);
  ctx.fillStyle = '#44BB44';
  ctx.fillRect(x + 12, y + 5, 5, 4);
  ctx.fillStyle = '#1E7A1E';
  ctx.fillRect(x + 17, y + 9, 4, 4);
}

/* ================================================================
   CABINET — metal filing cabinet with 3 drawers
   ================================================================ */
function drawCabinet(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const ph = T * 2;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(x + 4, y + ph - 1, T - 4, 3);

  // Frame body
  ctx.fillStyle = '#6A6A78';
  ctx.fillRect(x + 2, y + 2, T - 4, ph - 4);
  // Body highlight (left side)
  ctx.fillStyle = '#7A7A88';
  ctx.fillRect(x + 2, y + 2, 2, ph - 4);
  // Body shadow (right side)
  ctx.fillStyle = '#5A5A68';
  ctx.fillRect(x + T - 4, y + 2, 2, ph - 4);
  // Top
  ctx.fillStyle = '#7A7A88';
  ctx.fillRect(x + 2, y + 2, T - 4, 2);

  // 3 Drawers
  const drawerH = (ph - 10) / 3;
  for (let i = 0; i < 3; i++) {
    const dy = y + 5 + i * (drawerH + 1);

    // Drawer face
    ctx.fillStyle = '#7A7A8A';
    ctx.fillRect(x + 4, dy, T - 8, drawerH - 1);

    // Bevel light (top & left)
    ctx.fillStyle = '#8A8A9A';
    ctx.fillRect(x + 4, dy, T - 8, 1);
    ctx.fillRect(x + 4, dy, 1, drawerH - 1);

    // Bevel dark (bottom & right)
    ctx.fillStyle = '#5A5A6A';
    ctx.fillRect(x + 4, dy + drawerH - 2, T - 8, 1);
    ctx.fillRect(x + T - 5, dy, 1, drawerH - 1);

    // Handle (horizontal bar)
    ctx.fillStyle = '#BBBBCC';
    ctx.fillRect(x + T / 2 - 5, dy + drawerH / 2 - 1, 10, 2);
    ctx.fillStyle = '#DDDDEE';
    ctx.fillRect(x + T / 2 - 5, dy + drawerH / 2 - 1, 10, 1);

    // Label holder
    ctx.fillStyle = '#999';
    ctx.fillRect(x + T / 2 - 3, dy + 3, 6, 4);
    ctx.fillStyle = '#DDD';
    ctx.fillRect(x + T / 2 - 2, dy + 4, 4, 2);
  }
}

/* ================================================================
   RUG — rich oriental/Persian pattern
   ================================================================ */
function drawRug(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const pw = w * T;
  const ph = h * T;

  // Rug base (deep red)
  ctx.fillStyle = '#7A2233';
  ctx.fillRect(x + 2, y + 2, pw - 4, ph - 4);

  // Outer border
  ctx.strokeStyle = '#D4A840';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 4, y + 4, pw - 8, ph - 8);

  // Outer border pattern (repeating small motifs)
  ctx.fillStyle = '#D4A840';
  const borderStep = 8;
  // Top and bottom borders
  for (let bx = x + 8; bx < x + pw - 8; bx += borderStep) {
    ctx.fillRect(bx, y + 5, 3, 2);
    ctx.fillRect(bx, y + ph - 7, 3, 2);
  }
  // Left and right borders
  for (let by = y + 8; by < y + ph - 8; by += borderStep) {
    ctx.fillRect(x + 5, by, 2, 3);
    ctx.fillRect(x + pw - 7, by, 2, 3);
  }

  // Inner border
  ctx.strokeStyle = '#1A3355';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 10, y + 10, pw - 20, ph - 20);

  // Inner fill
  ctx.fillStyle = '#8B3040';
  ctx.fillRect(x + 12, y + 12, pw - 24, ph - 24);

  // Central diamond/medallion
  const cx = x + pw / 2;
  const cy = y + ph / 2;
  const dw = Math.min(pw - 40, 60);
  const dh = Math.min(ph - 30, 40);

  // Outer diamond
  ctx.fillStyle = '#1A3355';
  ctx.beginPath();
  ctx.moveTo(cx, cy - dh / 2);
  ctx.lineTo(cx + dw / 2, cy);
  ctx.lineTo(cx, cy + dh / 2);
  ctx.lineTo(cx - dw / 2, cy);
  ctx.closePath();
  ctx.fill();

  // Inner diamond
  ctx.fillStyle = '#D4A840';
  ctx.beginPath();
  ctx.moveTo(cx, cy - dh / 2 + 4);
  ctx.lineTo(cx + dw / 2 - 4, cy);
  ctx.lineTo(cx, cy + dh / 2 - 4);
  ctx.lineTo(cx - dw / 2 + 4, cy);
  ctx.closePath();
  ctx.fill();

  // Center diamond (smallest)
  ctx.fillStyle = '#7A2233';
  ctx.beginPath();
  ctx.moveTo(cx, cy - dh / 2 + 8);
  ctx.lineTo(cx + dw / 2 - 10, cy);
  ctx.lineTo(cx, cy + dh / 2 - 8);
  ctx.lineTo(cx - dw / 2 + 10, cy);
  ctx.closePath();
  ctx.fill();

  // Center dot
  ctx.fillStyle = '#D4A840';
  fillCircle(ctx, cx, cy, 3);

  // Corner decorations (small diamonds)
  const corners = [
    [x + 18, y + 18],
    [x + pw - 18, y + 18],
    [x + 18, y + ph - 18],
    [x + pw - 18, y + ph - 18],
  ];
  for (const [dx, dy] of corners) {
    ctx.fillStyle = '#D4A840';
    ctx.beginPath();
    ctx.moveTo(dx, dy - 4);
    ctx.lineTo(dx + 4, dy);
    ctx.lineTo(dx, dy + 4);
    ctx.lineTo(dx - 4, dy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1A3355';
    fillCircle(ctx, dx, dy, 1.5);
  }

  // Fringe on short edges (top and bottom)
  ctx.fillStyle = '#D4A840';
  for (let fx = x + 6; fx < x + pw - 4; fx += 3) {
    ctx.fillRect(fx, y, 1, 3);
    ctx.fillRect(fx, y + ph - 3, 1, 3);
  }
}

/* ================================================================
   WINDOW — wooden frame, 4-pane glass, skyline, curtains
   ================================================================ */
function drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const pw = w * T;
  const ph = h * T;

  // Curtain rod (gold/brown)
  ctx.fillStyle = '#8B6840';
  ctx.fillRect(x - 4, y - 3, pw + 8, 4);
  ctx.fillStyle = '#A88050';
  ctx.fillRect(x - 4, y - 3, pw + 8, 1);
  // Rod finials
  fillCircle(ctx, x - 3, y - 1, 2);
  fillCircle(ctx, x + pw + 3, y - 1, 2);

  // Curtains (deep red with folds)
  const curtainW = 10;
  // Left curtain
  ctx.fillStyle = '#AA2222';
  ctx.fillRect(x - 2, y, curtainW, ph + 2);
  ctx.fillStyle = '#882020';
  ctx.fillRect(x, y, 2, ph + 2);
  ctx.fillRect(x + 4, y, 1, ph + 2);
  ctx.fillStyle = '#CC3838';
  ctx.fillRect(x + 2, y, 1, ph + 2);
  ctx.fillRect(x + 6, y, 1, ph + 2);
  // Right curtain
  ctx.fillStyle = '#AA2222';
  ctx.fillRect(x + pw - curtainW + 2, y, curtainW, ph + 2);
  ctx.fillStyle = '#882020';
  ctx.fillRect(x + pw - 4, y, 2, ph + 2);
  ctx.fillRect(x + pw - 7, y, 1, ph + 2);
  ctx.fillStyle = '#CC3838';
  ctx.fillRect(x + pw - 2, y, 1, ph + 2);
  ctx.fillRect(x + pw - 9, y, 1, ph + 2);

  // Window frame (dark wood)
  ctx.fillStyle = '#4A2A10';
  ctx.fillRect(x + 6, y + 2, pw - 12, ph - 2);

  // Glass area
  const glassX = x + 9;
  const glassY = y + 5;
  const glassW = pw - 18;
  const glassH = ph - 8;

  // Sky gradient
  ctx.fillStyle = '#AAD8F0';
  ctx.fillRect(glassX, glassY, glassW, glassH);
  ctx.fillStyle = '#87CEEB';
  ctx.fillRect(glassX, glassY + glassH * 0.3, glassW, glassH * 0.7);
  ctx.fillStyle = '#70B8E0';
  ctx.fillRect(glassX, glassY + glassH * 0.7, glassW, glassH * 0.3);

  // Clouds
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  fillCircle(ctx, glassX + 15, glassY + 8, 4);
  fillCircle(ctx, glassX + 20, glassY + 7, 5);
  fillCircle(ctx, glassX + 26, glassY + 8, 3);
  fillCircle(ctx, glassX + glassW - 20, glassY + 12, 3);
  fillCircle(ctx, glassX + glassW - 15, glassY + 11, 4);

  // City skyline (building silhouettes)
  const skylineY = glassY + glassH - 18;
  ctx.fillStyle = '#556677';
  ctx.fillRect(glassX + 4, skylineY + 4, 10, 14);
  ctx.fillRect(glassX + 18, skylineY, 8, 18);
  ctx.fillRect(glassX + 30, skylineY + 6, 12, 12);
  ctx.fillRect(glassX + 46, skylineY + 2, 6, 16);
  ctx.fillStyle = '#445566';
  ctx.fillRect(glassX + 56, skylineY + 8, 14, 10);
  ctx.fillRect(glassX + 72, skylineY + 4, 8, 14);

  // Building windows (tiny lit squares)
  ctx.fillStyle = '#FFE866';
  ctx.globalAlpha = 0.7;
  const bldgs: Array<[number, number, number, number]> = [
    [glassX + 5, skylineY + 6, 8, 10],
    [glassX + 19, skylineY + 2, 6, 14],
    [glassX + 31, skylineY + 8, 10, 8],
    [glassX + 47, skylineY + 4, 4, 12],
  ];
  for (const [bx, by, bw, bh] of bldgs) {
    for (let wy = by + 2; wy < by + bh - 2; wy += 3) {
      for (let wx = bx + 1; wx < bx + bw - 1; wx += 3) {
        if (rand(wx, wy, 77) > 0.4) {
          ctx.fillRect(wx, wy, 1.5, 1.5);
        }
      }
    }
  }
  ctx.globalAlpha = 1;

  // Window cross frame (divides into 4 panes)
  ctx.fillStyle = '#4A2A10';
  ctx.fillRect(glassX + glassW / 2 - 2, glassY, 3, glassH);
  ctx.fillRect(glassX, glassY + glassH / 2 - 1, glassW, 3);
  // Frame edges
  ctx.fillStyle = '#5A3A18';
  ctx.fillRect(glassX - 1, glassY, 1, glassH);
  ctx.fillRect(glassX + glassW, glassY, 1, glassH);
  ctx.fillRect(glassX, glassY - 1, glassW, 1);

  // Window sill (brown ledge at bottom)
  ctx.fillStyle = '#5A3A18';
  ctx.fillRect(x + 4, y + ph - 1, pw - 8, 4);
  ctx.fillStyle = '#7A5A38';
  ctx.fillRect(x + 4, y + ph - 1, pw - 8, 1);

  // Glass reflection effect
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(glassX + 2, glassY + 2, glassW / 3, glassH - 4);
}

/* ================================================================
   POSTERS — indie dev and game jam themed
   ================================================================ */
function drawPoster(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, _h: number, type: string) {
  const pw = w * T;
  const ph = _h * T;

  // Slight shadow for depth
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x + 4, y + 3, pw - 4, ph - 2);

  if (type === 'poster-indie') {
    // Dark blue/teal background
    ctx.fillStyle = '#1A3A4A';
    ctx.fillRect(x + 2, y + 2, pw - 4, ph - 4);
    // White border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 3, y + 3, pw - 6, ph - 6);

    // "INDIE" text
    ctx.fillStyle = '#61DAFB';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('INDIE', x + pw / 2, y + 14);

    // Small game character icon (simple pixel person)
    const cx = x + pw / 2;
    const cy = y + ph / 2 + 2;
    ctx.fillStyle = '#FFD700';
    // Head
    ctx.fillRect(cx - 2, cy - 6, 4, 4);
    // Body
    ctx.fillStyle = '#61DAFB';
    ctx.fillRect(cx - 3, cy - 2, 6, 6);
    // Legs
    ctx.fillStyle = '#444';
    ctx.fillRect(cx - 3, cy + 4, 2, 4);
    ctx.fillRect(cx + 1, cy + 4, 2, 4);

    // "DEV" text
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 6px monospace';
    ctx.fillText('DEV', x + pw / 2, y + ph - 8);
  } else {
    // Purple/magenta background
    ctx.fillStyle = '#4A1A4A';
    ctx.fillRect(x + 2, y + 2, pw - 4, ph - 4);
    // White border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 3, y + 3, pw - 6, ph - 6);

    // "GAME" text
    ctx.fillStyle = '#FF66CC';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME', x + pw / 2, y + 14);

    // Game controller icon
    const cx = x + pw / 2;
    const cy = y + ph / 2 + 2;
    // Controller body
    ctx.fillStyle = '#DDD';
    ctx.fillRect(cx - 7, cy - 3, 14, 6);
    ctx.fillRect(cx - 9, cy - 1, 3, 4);
    ctx.fillRect(cx + 6, cy - 1, 3, 4);
    // D-pad
    ctx.fillStyle = '#333';
    ctx.fillRect(cx - 6, cy - 1, 3, 1);
    ctx.fillRect(cx - 5, cy - 2, 1, 3);
    // Buttons
    ctx.fillStyle = '#FF4444';
    fillCircle(ctx, cx + 4, cy - 1, 1);
    ctx.fillStyle = '#44FF44';
    fillCircle(ctx, cx + 6, cy, 1);

    // "JAM" text
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 6px monospace';
    ctx.fillText('JAM', x + pw / 2, y + ph - 8);
  }
  ctx.textAlign = 'left';
}

/* ================================================================
   COOLER — water cooler with blue jug
   ================================================================ */
function drawCooler(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const ph = T * 2;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(x + 7, y + ph - 2, T - 10, 4);

  // Body (white/light gray)
  ctx.fillStyle = '#D8D8E0';
  ctx.fillRect(x + 6, y + 14, T - 12, ph - 18);
  // Body highlight
  ctx.fillStyle = '#E8E8F0';
  ctx.fillRect(x + 6, y + 14, 2, ph - 18);
  // Body shadow
  ctx.fillStyle = '#C0C0C8';
  ctx.fillRect(x + T - 8, y + 14, 2, ph - 18);

  // Blue water jug (translucent)
  ctx.fillStyle = '#88BBEE';
  ctx.fillRect(x + 8, y + 2, T - 16, 14);
  // Jug highlight (translucency)
  ctx.fillStyle = '#AAD4FF';
  ctx.fillRect(x + 9, y + 3, 3, 10);
  // Jug neck
  ctx.fillStyle = '#77AADD';
  ctx.fillRect(x + 11, y, 8, 4);
  // Water level line
  ctx.fillStyle = '#6699CC';
  ctx.fillRect(x + 9, y + 8, T - 18, 1);

  // Tap/spigot
  ctx.fillStyle = '#888';
  ctx.fillRect(x + 10, y + 20, 3, 4);
  ctx.fillRect(x + 17, y + 20, 3, 4);
  // Hot/cold buttons
  ctx.fillStyle = '#FF4444';
  fillCircle(ctx, x + 11.5, y + 21, 1.5);
  ctx.fillStyle = '#4488FF';
  fillCircle(ctx, x + 18.5, y + 21, 1.5);
  // Labels
  ctx.fillStyle = '#FFF';
  ctx.font = '2px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('H', x + 11.5, y + 22);
  ctx.fillText('C', x + 18.5, y + 22);
  ctx.textAlign = 'left';

  // Drip tray
  ctx.fillStyle = '#999';
  ctx.fillRect(x + 8, y + 26, T - 16, 3);
  ctx.fillStyle = '#AAA';
  ctx.fillRect(x + 8, y + 26, T - 16, 1);
}

/* ================================================================
   ARCADE MACHINE — classic upright cabinet
   ================================================================ */
function drawArcade(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const pw = w * T;
  const ph = h * T;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(x + 4, y + ph - 2, pw - 4, 4);

  // Cabinet body (dark blue/purple)
  ctx.fillStyle = '#1A1A3A';
  ctx.fillRect(x + 4, y + 6, pw - 8, ph - 8);

  // Side panels (slightly lighter)
  ctx.fillStyle = '#2A2A4A';
  ctx.fillRect(x + 4, y + 6, 4, ph - 8);
  ctx.fillRect(x + pw - 8, y + 6, 4, ph - 8);

  // Side art (stripe pattern)
  ctx.fillStyle = '#4A2A6A';
  for (let sy = y + 10; sy < y + ph - 8; sy += 6) {
    ctx.fillRect(x + 5, sy, 2, 3);
    ctx.fillRect(x + pw - 7, sy, 2, 3);
  }

  // Header marquee (top) with glow
  ctx.fillStyle = '#3A1A5A';
  ctx.fillRect(x + 8, y + 2, pw - 16, 14);
  // Glow effect
  ctx.fillStyle = 'rgba(100,50,200,0.3)';
  ctx.fillRect(x + 6, y, pw - 12, 18);
  // Marquee face
  ctx.fillStyle = '#2A1A4A';
  ctx.fillRect(x + 10, y + 4, pw - 20, 10);
  // "ARCADE" text
  ctx.fillStyle = '#88CCFF';
  ctx.font = 'bold 6px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ARCADE', x + pw / 2, y + 12);

  // Screen area
  const scrX = x + 10;
  const scrY = y + 20;
  const scrW = pw - 20;
  const scrH = 28;
  // Screen bezel
  ctx.fillStyle = '#111';
  ctx.fillRect(scrX - 2, scrY - 2, scrW + 4, scrH + 4);
  // Screen
  ctx.fillStyle = '#0A0A1A';
  ctx.fillRect(scrX, scrY, scrW, scrH);

  // Pixel game graphics on screen
  // Player ship (triangle)
  ctx.fillStyle = '#44FF44';
  ctx.fillRect(scrX + scrW / 2 - 2, scrY + scrH - 8, 4, 4);
  ctx.fillRect(scrX + scrW / 2 - 1, scrY + scrH - 10, 2, 2);
  // Enemies (invaders)
  ctx.fillStyle = '#FF4444';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(scrX + 6 + i * 10, scrY + 4, 6, 4);
    ctx.fillRect(scrX + 7 + i * 10, scrY + 8, 4, 2);
  }
  // Stars
  ctx.fillStyle = '#FFF';
  ctx.globalAlpha = 0.5;
  ctx.fillRect(scrX + 5, scrY + 15, 1, 1);
  ctx.fillRect(scrX + 18, scrY + 10, 1, 1);
  ctx.fillRect(scrX + 30, scrY + 18, 1, 1);
  ctx.fillRect(scrX + 12, scrY + 22, 1, 1);
  ctx.globalAlpha = 1;
  // Score text
  ctx.fillStyle = '#FFD700';
  ctx.font = '3px monospace';
  ctx.fillText('12500', scrX + scrW / 2, scrY + 4);

  // Control panel
  const cpY = scrY + scrH + 6;
  ctx.fillStyle = '#2A2A3A';
  ctx.fillRect(x + 8, cpY, pw - 16, 16);
  ctx.fillStyle = '#3A3A4A';
  ctx.fillRect(x + 8, cpY, pw - 16, 2);

  // Joystick
  const joyX = x + 16;
  const joyY = cpY + 8;
  ctx.fillStyle = '#1A1A1A';
  fillCircle(ctx, joyX, joyY, 4);
  ctx.fillStyle = '#333';
  fillCircle(ctx, joyX, joyY, 3);
  // Joystick shaft
  ctx.fillStyle = '#222';
  ctx.fillRect(joyX - 1, joyY - 6, 2, 4);
  // Joystick knob
  ctx.fillStyle = '#444';
  fillCircle(ctx, joyX, joyY - 6, 2);

  // Buttons (3-4 colored)
  const btnColors = ['#FF3333', '#33FF33', '#3333FF', '#FFFF33'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = btnColors[i];
    fillCircle(ctx, x + pw - 20 + i * 5, cpY + 8, 2.5);
    // Button highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    fillCircle(ctx, x + pw - 20 + i * 5, cpY + 7, 1);
  }

  // Coin slot (at bottom)
  ctx.fillStyle = '#555';
  ctx.fillRect(x + pw / 2 - 4, cpY + 18, 8, 4);
  ctx.fillStyle = '#333';
  ctx.fillRect(x + pw / 2 - 2, cpY + 19, 4, 2);

  // Cabinet base
  ctx.fillStyle = '#111128';
  ctx.fillRect(x + 6, y + ph - 6, pw - 12, 4);

  ctx.textAlign = 'left';
}

/* ================================================================
   FRIDGE — tall white rectangle with magnets, microwave on top
   ================================================================ */
function drawFridge(ctx: CanvasRenderingContext2D, x: number, y: number, _w: number, h: number) {
  const ph = h * T;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(x + T - 2, y + 8, 3, ph - 6);

  // Fridge body
  ctx.fillStyle = '#E0E0E0';
  ctx.fillRect(x + 2, y + 4, T - 4, ph - 6);

  // Body highlight (left)
  ctx.fillStyle = '#EEEEEE';
  ctx.fillRect(x + 2, y + 4, 2, ph - 6);
  // Body shadow (right)
  ctx.fillStyle = '#C8C8C8';
  ctx.fillRect(x + T - 4, y + 4, 2, ph - 6);

  // Top section
  ctx.fillStyle = '#E8E8E8';
  ctx.fillRect(x + 3, y + 5, T - 6, ph / 3 - 2);
  // Bottom section (slightly different shade)
  ctx.fillStyle = '#DCDCDC';
  ctx.fillRect(x + 3, y + ph / 3 + 3, T - 6, ph * 2 / 3 - 8);

  // Door line (horizontal separator)
  ctx.fillStyle = '#AAAAAA';
  ctx.fillRect(x + 3, y + ph / 3 + 1, T - 6, 2);

  // Handle (thin dark rect on right)
  ctx.fillStyle = '#888';
  ctx.fillRect(x + T - 7, y + 12, 2, ph / 3 - 14);
  ctx.fillRect(x + T - 7, y + ph / 3 + 8, 2, ph / 3 - 4);
  // Handle highlight
  ctx.fillStyle = '#AAA';
  ctx.fillRect(x + T - 7, y + 12, 1, ph / 3 - 14);
  ctx.fillRect(x + T - 7, y + ph / 3 + 8, 1, ph / 3 - 4);

  // Magnets/photos on door (2-3 tiny colored squares)
  ctx.fillStyle = '#FF6666';
  ctx.fillRect(x + 6, y + 10, 4, 4);
  ctx.fillStyle = '#6666FF';
  ctx.fillRect(x + 12, y + 14, 4, 5);
  ctx.fillStyle = '#66CC66';
  ctx.fillRect(x + 8, y + 20, 3, 3);
  // Tiny photo
  ctx.fillStyle = '#FFF';
  ctx.fillRect(x + 14, y + 8, 5, 5);
  ctx.fillStyle = '#AAD';
  ctx.fillRect(x + 15, y + 9, 3, 3);

  // Microwave on top
  const mwX = x + 3;
  const mwY = y - 8;
  ctx.fillStyle = '#333';
  ctx.fillRect(mwX, mwY, T - 6, 12);
  // Microwave window
  ctx.fillStyle = '#1A1A2A';
  ctx.fillRect(mwX + 2, mwY + 2, T - 14, 8);
  // Interior glow
  ctx.fillStyle = '#222838';
  ctx.fillRect(mwX + 3, mwY + 3, T - 16, 6);
  // Control panel (right side)
  ctx.fillStyle = '#444';
  ctx.fillRect(mwX + T - 10, mwY + 2, 6, 8);
  // Buttons
  ctx.fillStyle = '#22CC22';
  ctx.fillRect(mwX + T - 9, mwY + 3, 2, 2);
  ctx.fillStyle = '#CC2222';
  ctx.fillRect(mwX + T - 9, mwY + 6, 2, 2);
  // Digital display
  ctx.fillStyle = '#00AA00';
  ctx.fillRect(mwX + T - 7, mwY + 3, 3, 2);
}

/* ================================================================
   FLOOR CABLES — dark gray winding lines between desks
   ================================================================ */
function drawFloorCables(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.5;
  ctx.lineCap = 'round';

  // Cable 1: Git desk area to wall
  ctx.beginPath();
  ctx.moveTo(3 * T + 10, 10 * T);
  ctx.quadraticCurveTo(2 * T, 7 * T, 1 * T, 5 * T);
  ctx.stroke();

  // Cable 2: Frontend desk to backend desk area
  ctx.beginPath();
  ctx.moveTo(9 * T, 11 * T);
  ctx.quadraticCurveTo(12 * T, 11.5 * T, 15 * T + 10, 10 * T);
  ctx.stroke();

  // Cable 3: Director desk area to wall
  ctx.beginPath();
  ctx.moveTo(12 * T + 10, 7 * T);
  ctx.quadraticCurveTo(11 * T, 5.5 * T, 10 * T, 5 * T);
  ctx.stroke();

  // Cable 4: Docs desk to wall
  ctx.strokeStyle = '#2A2A2A';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(20 * T, 11 * T);
  ctx.quadraticCurveTo(22 * T, 9 * T, 23 * T, 7 * T);
  ctx.stroke();

  ctx.restore();
}

/* ================================================================
   Main furniture dispatch
   ================================================================ */
function drawFurnitureItem(ctx: CanvasRenderingContext2D, f: FurniturePlacement) {
  const x = f.col * T;
  const y = f.row * T;
  const w = f.w ?? 1;
  const h = f.h ?? 1;

  ctx.save();
  switch (f.type) {
    case 'desk': drawDesk(ctx, x, y, w, h); break;
    case 'sofa': drawSofa(ctx, x, y, w, h); break;
    case 'bookshelf': drawBookshelf(ctx, x, y, w, h); break;
    case 'whiteboard': drawWhiteboard(ctx, x, y, w, h); break;
    case 'coffee': drawCoffeeMachine(ctx, x, y); break;
    case 'plant': drawPlant(ctx, x, y); break;
    case 'plant-small': drawPlantSmall(ctx, x, y); break;
    case 'cabinet': drawCabinet(ctx, x, y); break;
    case 'rug': drawRug(ctx, x, y, w, h); break;
    case 'window': drawWindow(ctx, x, y, w, h); break;
    case 'poster-indie': drawPoster(ctx, x, y, w, h, f.type); break;
    case 'poster-jam': drawPoster(ctx, x, y, w, h, f.type); break;
    case 'cooler': drawCooler(ctx, x, y); break;
    case 'arcade': drawArcade(ctx, x, y, w, h); break;
    case 'fridge': drawFridge(ctx, x, y, w, h); break;
  }
  ctx.restore();
}

/* ================================================================
   EXPORTS — same API as before
   ================================================================ */

/** Render all background layers (floor + walls + rug + wall-mounted items) */
export function renderBackground(ctx: CanvasRenderingContext2D): void {
  // Floor tiles
  for (let row = WALL_ROWS; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      drawFloorTile(ctx, col * T, row * T, row, col);
    }
  }

  // Wall tiles
  for (let row = 0; row < WALL_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      drawWallTile(ctx, col * T, row * T, row, col);
    }
  }

  // Rug first (below everything)
  for (const f of FURNITURE) {
    if (f.type === 'rug') drawFurnitureItem(ctx, f);
  }

  // Wall-mounted items (windows, whiteboard, posters)
  for (const f of FURNITURE) {
    if (['window', 'whiteboard', 'poster-indie', 'poster-jam'].includes(f.type)) {
      drawFurnitureItem(ctx, f);
    }
  }
}

/** Render furniture that should appear behind (and around) characters */
export function renderFurnitureBehind(ctx: CanvasRenderingContext2D): void {
  // Floor furniture
  for (const f of FURNITURE) {
    if (['desk', 'sofa', 'bookshelf', 'coffee', 'plant', 'plant-small', 'cabinet', 'cooler', 'arcade', 'fridge'].includes(f.type)) {
      drawFurnitureItem(ctx, f);
    }
  }

  // Floor cables
  drawFloorCables(ctx);
}

/** Pre-render the entire background to an offscreen canvas for performance */
export function createBackgroundBuffer(): HTMLCanvasElement {
  const buffer = document.createElement('canvas');
  buffer.width = CANVAS_W;
  buffer.height = CANVAS_H;
  const ctx = buffer.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  renderBackground(ctx);
  renderFurnitureBehind(ctx);
  return buffer;
}
