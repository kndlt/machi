/**
 * sim-world.ts — Synthetic world builder for simulation testing.
 *
 * Creates a simple matter texture (dirt + air) that the simulation
 * can run on without needing real world XML/PNG assets.
 */

import { createTexture } from "../utils/gl-utils";

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
  width: 16,
  height: 16,
  dirtRows: 8,
};

// Dirt color must match shader: (103, 82, 75, 255)
export const DIRT_RGBA = [103, 82, 75, 255] as const;
export const AIR_RGBA = [0, 0, 0, 0] as const;

// ── Matter texture ───────────────────────────────────────────────────────────

/**
 * Create a matter texture for the synthetic world.
 * Bottom `dirtRows` rows are filled with dirt; everything above is air.
 */
export function createMatterTexture(
  gl: WebGL2RenderingContext,
  config: SimWorldConfig = DEFAULT_SIM_WORLD,
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
