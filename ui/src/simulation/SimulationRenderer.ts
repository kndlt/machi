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
import { createLightTransportSim, type LightTransportSim } from "./LightTransportSim";
import { createNoiseSim, type NoiseSim } from "./NoiseSim";

/** Per-map simulation instance */
interface MapSim {
  placement: MapPlacement;
  sim: FoliageSim;
  noise: NoiseSim;
  light: LightTransportSim;
}

export interface SimulationRenderer {
  /** Run one simulation step for all maps */
  step(): void;
  /** Run light-only warmup iterations (no foliage/noise updates). */
  prewarm(): void;
  /** Noise iterations per step (1 = default) */
  noiseSpeed: number;
  /** Noise rate magnitude multiplier (1.0 = default) */
  noiseMagnitude: number;
  dispose(): void;
}

export interface SimulationOptions {
  /** Numeric seed for deterministic noise. Omit for random. */
  seed?: number;
}

export function createSimulationRenderer(
  gl: WebGL2RenderingContext,
  world: World,
  options?: SimulationOptions,
): SimulationRenderer {
  const LIGHT_PREWARM_ITERATIONS = 100;

  // ── Per-map FoliageSim + NoiseSim instances ──────────────────────────────
  const mapSims: MapSim[] = world.mapPlacements.map((placement) => {
    const { width, height } = placement.map;
    const sim = createFoliageSim(gl, width, height);
    const noise = createNoiseSim(gl, width, height, options?.seed);
    const light = createLightTransportSim(gl, width, height);

    // Expose initial (empty) foliage texture to the render pass
    placement.map.layers.foliage = sim.currentTexture();
    placement.map.layers.noise = noise.currentTexture();
    placement.map.layers.light = light.currentTexture();

    return { placement, sim, noise, light };
  });

  let stepCount = 0;

  // ── Light-only prewarm ───────────────────────────────────────────────────
  function prewarm(): void {
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    for (let i = 0; i < LIGHT_PREWARM_ITERATIONS; i++) {
      for (const { placement, light } of mapSims) {
        light.step(placement.map.layers.matter!);
      }
    }

    for (const { placement, light } of mapSims) {
      placement.map.layers.light = light.currentTexture();
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
  }

  // ── Simulation step ──────────────────────────────────────────────────────
  function step(): void {
    stepCount++;
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    for (const { placement, sim, noise, light } of mapSims) {
      // Evolve noise first, then feed it to foliage sim
      // Use fractional time so the hash seed actually varies between steps
      // (fract(x + integer) ≡ fract(x), so integer stepCount produces a constant hash)
      noise.step(stepCount * 0.7123);
      light.step(placement.map.layers.matter!);
      sim.step(placement.map.layers.matter!, noise.currentTexture(), light.currentTexture());
      placement.map.layers.foliage = sim.currentTexture();
      placement.map.layers.noise = noise.currentTexture();
      placement.map.layers.light = light.currentTexture();
    }

    // Restore previous framebuffer & viewport so the main render pass is unaffected
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
  }

  // ── Dispose ──────────────────────────────────────────────────────────────
  function dispose(): void {
    for (const { placement, sim, noise, light } of mapSims) {
      sim.dispose();
      noise.dispose();
      light.dispose();
      placement.map.layers.foliage = null;
      placement.map.layers.noise = null;
      placement.map.layers.light = null;
    }
  }

  return {
    step,
    prewarm,
    get noiseSpeed() { return mapSims[0]?.noise.speed ?? 1; },
    set noiseSpeed(v: number) { for (const ms of mapSims) ms.noise.speed = v; },
    get noiseMagnitude() { return mapSims[0]?.noise.magnitude ?? 1; },
    set noiseMagnitude(v: number) { for (const ms of mapSims) ms.noise.magnitude = v; },
    dispose,
  };
}
