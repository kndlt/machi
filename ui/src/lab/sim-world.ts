/**
 * sim-world.ts — Synthetic world builder for simulation testing.
 *
 * Builds a World object (same type used by App.tsx) with a simple
 * dirt-and-air matter texture, so the simulation lab can reuse
 * createMapRenderer / createSimulationRenderer instead of
 * reimplementing rendering and simulation from scratch.
 */

import { createTexture } from "../utils/gl-utils";
import type { World, MapLayers, WorldMap, MapPlacement } from "../world/types";

// ── Configuration ────────────────────────────────────────────────────────────

export interface SimWorldConfig {
  /** Grid width in pixels */
  width: number;
  /** Grid height in pixels */
  height: number;
  /** Number of bottom rows filled with dirt */
  dirtRows: number;
}

export const DEFAULT_SIM_WORLD: SimWorldConfig = {
  width: 32,
  height: 32,
  dirtRows: 16,
};

// Dirt color must match shader: (103, 82, 75, 255)
export const DIRT_RGBA = [103, 82, 75, 255] as const;
export const AIR_RGBA = [0, 0, 0, 0] as const;
const RESOURCE_ZERO_BYTE = 127;
const SYNTHETIC_DIRT_RESOURCE_BASE = 129;
const SYNTHETIC_DIRT_RESOURCE_STEP = 1;

// ── Matter texture ───────────────────────────────────────────────────────────

/**
 * Create a matter texture for the synthetic world.
 * Bottom `dirtRows` rows are filled with dirt; everything above is air.
 */
function createMatterTexture(
  gl: WebGL2RenderingContext,
  config: SimWorldConfig,
): WebGLTexture {
  const { width, height, dirtRows } = config;
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isDirt = y >= (height - dirtRows);
      const rgba = isDirt ? DIRT_RGBA : AIR_RGBA;
      pixels[idx + 0] = rgba[0];
      pixels[idx + 1] = rgba[1];
      pixels[idx + 2] = rgba[2];
      pixels[idx + 3] = rgba[3];
    }
  }

  return createTexture(gl, width, height, pixels);
}

function createSyntheticFoliageTexture(
  gl: WebGL2RenderingContext,
  config: SimWorldConfig,
): WebGLTexture {
  const { width, height, dirtRows } = config;
  const pixels = new Uint8Array(width * height * 4);

  const cx = Math.floor(width * 0.5);
  const dirtTopRow = Math.max(0, Math.min(height - 1, height - dirtRows));
  const seedY = Math.max(0, dirtTopRow - 1);
  const idx = (seedY * width + cx) * 4;

  // Single branch seed one tile above dirt, facing up (-y).
  // R=255 (tree id), G=0 (dir up + err 0), B=0, A=255 (occupied)
  pixels[idx + 0] = 255;
  pixels[idx + 1] = 0;
  pixels[idx + 2] = 0;
  pixels[idx + 3] = 255;

  return createTexture(gl, width, height, pixels);
}

function createSyntheticBranch2Texture(
  gl: WebGL2RenderingContext,
  config: SimWorldConfig,
): WebGLTexture {
  const { width, height, dirtRows } = config;
  const pixels = new Uint8Array(width * height * 4);

  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i + 1] = RESOURCE_ZERO_BYTE;
  }

  const dirtTopRow = Math.max(0, Math.min(height, height - dirtRows));
  for (let y = dirtTopRow; y < height; y++) {
    const depth = y - dirtTopRow;
    const nutrientByte = Math.min(255, SYNTHETIC_DIRT_RESOURCE_BASE + depth * SYNTHETIC_DIRT_RESOURCE_STEP);
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      pixels[idx + 1] = nutrientByte;
    }
  }

  return createTexture(gl, width, height, pixels);
}

// ── World builder ────────────────────────────────────────────────────────────

/**
 * Build a synthetic World object suitable for createMapRenderer and
 * createSimulationRenderer. Uses a programmatic dirt/air matter texture
 * plus synthetic foliage/branch2 initialization for deterministic lab runs.
 */
export function createSyntheticWorld(
  gl: WebGL2RenderingContext,
  config: SimWorldConfig = DEFAULT_SIM_WORLD,
): World {
  const { width, height } = config;

  // 1×1 transparent dummy for unused layers
  const dummy = createTexture(gl, 1, 1, new Uint8Array([0, 0, 0, 0]));

  const layers: MapLayers = {
    sky: dummy,
    background: dummy,
    foreground: dummy,
    support: dummy,
    matter: createMatterTexture(gl, config),
    foliage: createSyntheticFoliageTexture(gl, config),
    branch2: createSyntheticBranch2Texture(gl, config),
    noise: null,      // populated by SimulationRenderer
    light: null,      // populated by SimulationRenderer
  };

  const map: WorldMap = {
    title: "Synthetic",
    description: "Programmatic dirt/air test grid",
    width,
    height,
    layers,
  };

  const placement: MapPlacement = {
    path: "synthetic",
    x: 0,
    y: 0,
    map,
  };

  return {
    title: "Sim Lab World",
    description: `${width}×${height} synthetic world`,
    mapPlacements: [placement],
  };
}
