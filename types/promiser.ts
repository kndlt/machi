// types/promiser.ts

// ──────────────────────────────────────────────────────────────
// ⚙️  Global Constants
// ----------------------------------------------------------------
export const TILE_SIZE = 16; // pixels per grid‑tile (logic uses tiles)
export const SEA_LEVEL_ROW = 0; // GridCoord.y value that represents sea‑level

// ──────────────────────────────────────────────────────────────
// 🧩 Basic Geometry (world‑space)
// ----------------------------------------------------------------
/**
 * GridCoord uses a **world‑space y‑axis**:
 *   • y = 0   → sea‑level / ground plane
 *   • y > 0   → altitude above ground (rooftops, mountains, sky‑bridges)
 *   • y < 0   → underground / basements / subway
 * Screen rendering will convert using:  pixelY = SEA_LEVEL_ROW_PIXELS – y * TILE_SIZE
 */
export interface GridCoord {
  /** Horizontal tile index (0‑based, grows → right) */
  x: number;
  /** Vertical tile index (world‑space, grows ↑ up) */
  y: number;
}

export interface Rect {
  /** Left (west) tile index */
  x: number;
  /** Bottom edge tile index (world‑space y at the rectangle’s base) */
  y: number;
  /** Width in tiles  */
  width: number;
  /** Height in tiles */
  height: number;
}

// ──────────────────────────────────────────────────────────────
// 🟫 Tile System (16 × 16)
// ----------------------------------------------------------------
export type TileType =
  | 'street'
  | 'roof'
  | 'stairs'
  | 'ground'
  | 'water'
  | 'platform'
  | 'interior'
  | 'outdoor';

export interface TileBlock {
  id: string;
  position: GridCoord; // tile that holds this block
  type: TileType;
  spriteId: string;
  walkable: boolean;
  storyTag?: string; // narrative flavour
}

export interface TileRegion {
  id: string;
  origin: GridCoord; // south‑west (bottom‑left) tile of region
  width: number; // tiles (east‑west span)
  height: number; // tiles (vertical span, positive direction = upward)
  tiles: TileBlock[]; // sparse list or full map chunk
  tags?: string[];
}

// ──────────────────────────────────────────────────────────────
// 🛤  Layers & Zones
// ----------------------------------------------------------------
export interface PathLayer {
  id: string;
  bounds: Rect; // walkable span in tiles (world‑space)
  zIndex: number; // render depth (lower drawn first)
  type: 'ground' | 'platform' | 'bridge' | 'train' | 'rooftop';
  walkable: boolean;
  enterableFrom?: string[]; // other PathLayer ids
}

export interface RenderLayer {
  id: string;
  zIndex: number; // draw order (lower first)
  parallax: number; // 1 = foreground, <1 background
  sprites: SceneObject[];
}

export interface TriggerZone {
  id: string;
  bounds: Rect;
  action: 'useStairs' | 'enterBuilding' | 'boardTrain';
  targetLayerId: string; // PathLayer id
}

export interface SceneObject {
  id: string;
  spriteId: string;
  position: GridCoord;
  layerId: string; // RenderLayer or PathLayer
  interactive?: boolean;
  label?: string;
}

// ──────────────────────────────────────────────────────────────
// 🧑‍🤝‍🧑 Promisers (Agents)
// ----------------------------------------------------------------
export interface Position extends GridCoord {
  facing?: 'left' | 'right';
}

export interface Promiser {
  id: string;
  name: string;
  spriteId: string;
  position: Position; // tile‑space position (world‑space y)
  state: PromiserState;
  memory: Memory[];
  installedPromises: PromiseIntent[];
  behaviorLoop: BehaviorLoop;
}

export interface PromiserState {
  mood: 'serene' | 'restless' | 'focused' | 'discouraged';
  energy: number; // 0 – 100
  currentThought?: string;
}

export interface Memory {
  id: string;
  timestamp: number;
  description: string;
  relatedPromisers?: string[];
  tags?: string[];
}

export interface PromiseIntent {
  id: string;
  description: string;
  type: 'meet' | 'observe' | 'enterBuilding' | 'rideTrain' | 'wait' | 'wander';
  targetId?: string;
  location?: GridCoord;
  urgency: number; // 1 – 10
  status: 'pending' | 'in_progress' | 'fulfilled' | 'abandoned';
  installedAt: number;
}

// ──────────────────────────────────────────────────────────────
// 🚶‍♂️ Actions & Behaviour
// ----------------------------------------------------------------
export type MoveDirection = 'north' | 'south' | 'east' | 'west';

export interface Action {
  type: 'move' | 'wait' | 'talk' | 'lookAround' | 'enterBuilding' | 'useStairs' | 'rideTrain';
  direction?: MoveDirection; // when type === 'move'
  meta?: Record<string, any>;
}

export interface BehaviorLoop {
  /**
   * Decide what to do this tick.
   * @return null  → no action (defaults to 'wait')
   */
  evaluate: (promiser: Promiser, world: World) => Action | null;
}

// ──────────────────────────────────────────────────────────────
// 🌍  World Container & Camera
// ----------------------------------------------------------------
/**
 * Camera tracks a viewport in **world‑space tile units**.
 *   • `x`, `y` → bottom‑left tile currently visible
 *   • `width`, `height` → view size in tiles
 * Convert to pixels via:  pixelX = x*TILE_SIZE,  pixelY = (SEA_LEVEL_ROW + height) * TILE_SIZE – y*TILE_SIZE
 */
export interface Camera {
  /** Bottom‑left tile of viewport (world‑space) */
  x: number;
  y: number;
  /** Viewport dimensions (tiles) */
  width: number;
  height: number;
  /** Optional zoom factor (1 = 1:1) */
  zoom?: number;
}

export interface World {
  /** Horizontal world size in tiles */
  width: number;
  /** Vertical world size in tiles (world‑space y positive upward) */
  height: number;
  tileRegions: TileRegion[];
  pathLayers: PathLayer[];
  renderLayers: RenderLayer[];
  triggerZones: TriggerZone[];
  promisers: Promiser[];
  camera: Camera;
}
