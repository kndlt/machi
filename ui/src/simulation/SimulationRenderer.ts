/**
 * SimulationRenderer — runs GPU simulation passes that read all layers
 * at time t and produce updated layers at time t+1.
 *
 * Phase 2: foliage pass with ping-pong double buffering.
 *   IN:  matter texture + previous foliage texture
 *   OUT: new foliage texture (swapped each step)
 *
 * Delegates actual GPU work to FoliageSim; this module handles per-map
 * orchestration, seed timing, and viewport save/restore.
 */

import type { World, MapPlacement } from "../world/types";
import { createFoliageSim, type FoliageSim } from "./FoliageSim";
import { createNoiseSim, type NoiseSim } from "./NoiseSim";

/** Per-map simulation instance */
interface MapSim {
  placement: MapPlacement;
  sim: FoliageSim;
  noise: NoiseSim;
}

export interface SimulationRenderer {
  /** Run one simulation step for all maps */
  step(): void;
  dispose(): void;
}

export function createSimulationRenderer(
  gl: WebGL2RenderingContext,
  world: World,
): SimulationRenderer {
  // ── Per-map FoliageSim + NoiseSim instances ──────────────────────────────
  const mapSims: MapSim[] = world.mapPlacements.map((placement) => {
    const { width, height } = placement.map;
    const sim = createFoliageSim(gl, width, height);
    const noise = createNoiseSim(gl, width, height);

    // Expose initial (empty) foliage texture to the render pass
    placement.map.layers.foliage = sim.currentTexture();

    return { placement, sim, noise };
  });

  let stepCount = 0;

  // ── Simulation step ──────────────────────────────────────────────────────
  function step(): void {
    stepCount++;
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    for (const { placement, sim, noise } of mapSims) {
      // Evolve noise first, then feed it to foliage sim
      noise.step(stepCount);
      sim.step(placement.map.layers.matter!, noise.currentTexture());
      placement.map.layers.foliage = sim.currentTexture();
    }

    // Restore previous framebuffer & viewport so the main render pass is unaffected
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
  }

  // ── Dispose ──────────────────────────────────────────────────────────────
  function dispose(): void {
    for (const { placement, sim, noise } of mapSims) {
      sim.dispose();
      noise.dispose();
      placement.map.layers.foliage = null;
    }
  }

  return { step, dispose };
}
