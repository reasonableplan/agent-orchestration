/**
 * Stardew Valley-inspired sprite configuration
 * All position/color/animation constants for the Canvas-based office scene
 */

// Render scale: 2x for higher pixel density (logical 768x512 → physical 1536x1024)
export const RENDER_SCALE = 2;

// Tile size: 32x32 logical, Map: 24x16 tiles
export const TILE_SIZE = 32;
export const MAP_COLS = 24;
export const MAP_ROWS = 16;
export const LOGICAL_W = MAP_COLS * TILE_SIZE; // 768
export const LOGICAL_H = MAP_ROWS * TILE_SIZE; // 512
export const CANVAS_W = LOGICAL_W * RENDER_SCALE; // 1536
export const CANVAS_H = LOGICAL_H * RENDER_SCALE; // 1024

// Character sprite size: 2x of Modern Interiors 16×32 frame
export const CHAR_W = 32;
export const CHAR_H = 64;

// Wall rows (rows 0-4 are wall, 5-15 are floor)
export const WALL_ROWS = 5;

// ---- Agent colors (Stardew Valley-inspired warm palette) ----
export interface AgentColors {
  body: string;
  bodyDark: string;
  accent: string;
  hair: string;
  skin: string;
  skinShadow: string;
  pants: string;
  shoes: string;
  hairStyle: 'short' | 'spiky' | 'long' | 'curly' | 'ponytail';
}

export const DEFAULT_COLOR: AgentColors = {
  body: '#666666',
  bodyDark: '#444444',
  accent: '#999999',
  hair: '#333333',
  skin: '#E8C8A0',
  skinShadow: '#C8A880',
  pants: '#555555',
  shoes: '#444444',
  hairStyle: 'short',
};

export const AGENT_COLORS: Record<string, AgentColors> = {
  architect: {
    body: '#4A3068',     // 보라 (설계자)
    bodyDark: '#362050',
    accent: '#FFD700',   // 금
    hair: '#2A1A38',
    skin: '#E8C8A0',
    skinShadow: '#CCA880',
    pants: '#2A2040',
    shoes: '#3A2A40',
    hairStyle: 'short',
  },
  designer: {
    body: '#E06080',     // 핑크 (디자이너)
    bodyDark: '#C04060',
    accent: '#FF69B4',   // 핫핑크
    hair: '#3A2020',
    skin: '#F0D0B0',
    skinShadow: '#D8B090',
    pants: '#6A2040',
    shoes: '#4A2830',
    hairStyle: 'long',
  },
  orchestrator: {
    body: '#2060A0',     // 파랑 (조율자)
    bodyDark: '#184880',
    accent: '#00BFFF',   // 딥스카이블루
    hair: '#1A1A2E',
    skin: '#E8C8A0',
    skinShadow: '#CCA880',
    pants: '#1A3050',
    shoes: '#2A3040',
    hairStyle: 'spiky',
  },
  backend_coder: {
    body: '#3A7A2E',     // 초록 (백엔드)
    bodyDark: '#2A5A1E',
    accent: '#90EE90',   // 라이트그린
    hair: '#2A1A10',
    skin: '#D8B090',
    skinShadow: '#C09870',
    pants: '#2A3A20',
    shoes: '#2A2A18',
    hairStyle: 'curly',
  },
  frontend_coder: {
    body: '#2A7A8A',     // 청록 (프론트)
    bodyDark: '#1E5A6A',
    accent: '#7FDBFF',   // 밝은 하늘색
    hair: '#1A2A2A',
    skin: '#E8C8A0',
    skinShadow: '#CCA880',
    pants: '#1A3A40',
    shoes: '#2A3830',
    hairStyle: 'ponytail',
  },
  reviewer: {
    body: '#C04020',     // 빨강 (리뷰어)
    bodyDark: '#A03018',
    accent: '#FF6347',   // 토마토
    hair: '#3A1A10',
    skin: '#D8B090',
    skinShadow: '#C09870',
    pants: '#4A1A10',
    shoes: '#3A1A10',
    hairStyle: 'short',
  },
  qa: {
    body: '#C4880A',     // 황금 (QA)
    bodyDark: '#A07008',
    accent: '#FFD700',   // 금
    hair: '#2A2A1A',
    skin: '#E8C8A0',
    skinShadow: '#CCA880',
    pants: '#4A3A10',
    shoes: '#3A2A10',
    hairStyle: 'curly',
  },
  // 기존 에이전트 ID 호환 (demo 모드/이전 데이터)
  director: {
    body: '#2060A0',
    bodyDark: '#184880',
    accent: '#00BFFF',
    hair: '#1A1A2E',
    skin: '#E8C8A0',
    skinShadow: '#CCA880',
    pants: '#1A3050',
    shoes: '#2A3040',
    hairStyle: 'spiky',
  },
  git: {
    body: '#C04020',
    bodyDark: '#A03018',
    accent: '#FF6347',
    hair: '#3A1A10',
    skin: '#D8B090',
    skinShadow: '#C09870',
    pants: '#4A1A10',
    shoes: '#3A1A10',
    hairStyle: 'short',
  },
  frontend: {
    body: '#2A7A8A',
    bodyDark: '#1E5A6A',
    accent: '#7FDBFF',
    hair: '#1A2A2A',
    skin: '#E8C8A0',
    skinShadow: '#CCA880',
    pants: '#1A3A40',
    shoes: '#2A3830',
    hairStyle: 'ponytail',
  },
  backend: {
    body: '#3A7A2E',
    bodyDark: '#2A5A1E',
    accent: '#90EE90',
    hair: '#2A1A10',
    skin: '#D8B090',
    skinShadow: '#C09870',
    pants: '#2A3A20',
    shoes: '#2A2A18',
    hairStyle: 'curly',
  },
  docs: {
    body: '#C4880A',
    bodyDark: '#A07008',
    accent: '#FFD700',
    hair: '#2A2A1A',
    skin: '#E8C8A0',
    skinShadow: '#CCA880',
    pants: '#4A3A10',
    shoes: '#3A2A10',
    hairStyle: 'curly',
  },
};

export const DOMAIN_LABELS: Record<string, string> = {
  architect: 'ARC',
  designer: 'DES',
  orchestrator: 'ORC',
  backend_coder: 'BE',
  frontend_coder: 'FE',
  reviewer: 'REV',
  qa: 'QA',
  // 기존 에이전트 ID 호환 (demo 모드/이전 데이터)
  director: 'DIR',
  git: 'GIT',
  frontend: 'FE',
  backend: 'BE',
  docs: 'DOC',
};

// ---- Desk slot system (dynamic agent support) ----
export interface DeskSlot {
  desk: { x: number; y: number };
  idle: { x: number; y: number };
}

// Desk positions are derived from FURNITURE tile coords:
//   desk.x = (col + w/2) * TILE_SIZE   — centered on desk
//   desk.y = (row + h) * TILE_SIZE + 16 — in chair (south of desk), character faces up toward computer
// Idle positions are directly in front of each agent's desk (one tile south),
// keeping agents near their workstation when not active.
export const DESK_SLOTS: DeskSlot[] = [
  // Slot 0: Architect — desk tile (11, 5, 3×2)
  { desk: { x: 400, y: 240 }, idle: { x: 400, y: 272 } },
  // Slot 1: Designer — desk tile (2, 8, 3×2)
  { desk: { x: 112, y: 336 }, idle: { x: 112, y: 368 } },
  // Slot 2: Orchestrator — desk tile (7, 9, 3×2)
  { desk: { x: 272, y: 368 }, idle: { x: 272, y: 400 } },
  // Slot 3: Backend Coder — desk tile (15, 8, 3×2)
  { desk: { x: 528, y: 336 }, idle: { x: 528, y: 368 } },
  // Slot 4: Frontend Coder — desk tile (19, 9, 3×2)
  { desk: { x: 656, y: 368 }, idle: { x: 656, y: 400 } },
  // Slot 5: Reviewer — desk tile (12, 10, 3×2)
  { desk: { x: 432, y: 400 }, idle: { x: 432, y: 432 } },
  // Slot 6: QA — desk tile (5, 12, 3×2)
  { desk: { x: 208, y: 464 }, idle: { x: 208, y: 496 } },
];

export const BOOKSHELF_POS = { x: 704, y: 280 };

export function getAgentPixelPosition(
  slotIndex: number,
  status: string,
  tick: number = 0,
): { x: number; y: number } {
  const slot = DESK_SLOTS[slotIndex] ?? DESK_SLOTS[0]!;
  // Small oscillation offset so agents appear subtly animated without leaving their desk area
  const phase = (slotIndex * 1.3 + tick * 0.05) % (Math.PI * 2);

  switch (status) {
    case 'working':
    case 'thinking':
    case 'reviewing':
    case 'paused':
    case 'error':
    case 'waiting':
      // Seated at desk — no movement
      return slot.desk;

    case 'idle':
      // Stand directly in front of the desk (deskFront)
      return slot.idle;

    case 'searching':
      // Small drift near desk — stays within ±15px of desk
      return {
        x: slot.desk.x + Math.round(Math.sin(phase) * 12),
        y: slot.desk.y + Math.round(Math.cos(phase * 0.7) * 8) + 12,
      };

    case 'delivering':
      // Slightly away from desk but bounded to ±30px
      return {
        x: slot.desk.x + Math.round(Math.sin(phase) * 24),
        y: slot.desk.y + Math.round(Math.cos(phase) * 16) + 16,
      };

    default:
      return slot.desk;
  }
}

/** Get display label for an agent (e.g., "FE", "FE2") */
export function getAgentLabel(id: string, domain: string): string {
  const base = DOMAIN_LABELS[domain] ?? domain.slice(0, 3).toUpperCase();
  if (id === domain) return base;
  const match = id.match(/(\d+)$/);
  if (match) return `${base}${match[1]}`;
  return id.slice(0, 4).toUpperCase();
}

// ---- Furniture tile placements (tile coords) ----
export interface FurniturePlacement {
  type: string;
  col: number;
  row: number;
  w?: number; // width in tiles (default 1)
  h?: number; // height in tiles (default 1)
}

export const FURNITURE: FurniturePlacement[] = [
  // Director desk (center, near wall)
  { type: 'desk', col: 11, row: 5, w: 3, h: 2 },
  // Git desk (left side)
  { type: 'desk', col: 2, row: 8, w: 3, h: 2 },
  // Frontend desk (center-left)
  { type: 'desk', col: 7, row: 9, w: 3, h: 2 },
  // Backend desk (center-right)
  { type: 'desk', col: 15, row: 8, w: 3, h: 2 },
  // Docs desk (right)
  { type: 'desk', col: 19, row: 9, w: 3, h: 2 },
  // Extra desks for dynamic agents (slots 5-7)
  { type: 'desk', col: 12, row: 10, w: 3, h: 2 },
  { type: 'desk', col: 5, row: 12, w: 3, h: 2 },
  { type: 'desk', col: 16, row: 11, w: 3, h: 2 },
  // Sofa (bottom-right)
  { type: 'sofa', col: 18, row: 13, w: 4, h: 2 },
  // Bookshelf (right wall area)
  { type: 'bookshelf', col: 21, row: 5, w: 2, h: 3 },
  // Whiteboard → Corkboard (on wall)
  { type: 'whiteboard', col: 15, row: 1, w: 4, h: 3 },
  // Coffee machine (bottom-left corner)
  { type: 'coffee', col: 1, row: 13, w: 1, h: 2 },
  // Plant (bottom-left)
  { type: 'plant', col: 0, row: 13, w: 1, h: 2 },
  // Filing cabinet
  { type: 'cabinet', col: 5, row: 5, w: 1, h: 2 },
  // Rug (center)
  { type: 'rug', col: 9, row: 12, w: 5, h: 3 },
  // Window on wall
  { type: 'window', col: 3, row: 1, w: 4, h: 3 },
  { type: 'window', col: 9, row: 1, w: 4, h: 3 },
  // Wall decorations
  { type: 'poster-indie', col: 7, row: 1, w: 2, h: 2 },
  { type: 'poster-jam', col: 13, row: 1, w: 2, h: 2 },
  // Water cooler
  { type: 'cooler', col: 23, row: 12, w: 1, h: 2 },
  // Fireplace (left of director area — replaces arcade)
  { type: 'fireplace', col: 8, row: 5, w: 2, h: 3 },
  // Fridge + microwave (left wall area)
  { type: 'fridge', col: 0, row: 8, w: 1, h: 3 },
  // Extra plants
  { type: 'plant', col: 23, row: 5, w: 1, h: 2 },
  { type: 'plant-small', col: 6, row: 5, w: 1, h: 1 },
];
