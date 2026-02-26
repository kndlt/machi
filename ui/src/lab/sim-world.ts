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

// ── World builder ────────────────────────────────────────────────────────────

/**
 * Build a synthetic World object suitable for createMapRenderer and
 * createSimulationRenderer. Uses a programmatic dirt/air matter texture
 * with all other layers set to a 1×1 transparent dummy.
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
    foliage: null,   // populated by SimulationRenderer
    branch2: null,   // populated/managed by SimulationRenderer
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
