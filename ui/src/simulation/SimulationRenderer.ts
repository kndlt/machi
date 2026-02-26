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
  /** Toggle side-branch generation. */
  branchingEnabled: boolean;
  /** Toggle inhibition field and inhibition-based branch suppression. */
  branchInhibitionEnabled: boolean;
  /** Noise iterations per step (1 = default) */
  noiseSpeed: number;
  /** Noise rate magnitude multiplier (1.0 = default) */
  noiseMagnitude: number;
  dispose(): void;
}

export interface SimulationOptions {
  /** Numeric seed for deterministic noise. Omit for random. */
  seed?: number;
  /** Enable side-branch generation (default true). */
  branchingEnabled?: boolean;
  /** Enable inhibition system (default true). */
  branchInhibitionEnabled?: boolean;
}

export function createSimulationRenderer(
  gl: WebGL2RenderingContext,
  world: World,
  options?: SimulationOptions,
): SimulationRenderer {
  const LIGHT_PREWARM_ITERATIONS = 100;
  let branchingEnabled = options?.branchingEnabled ?? true;
  let branchInhibitionEnabled = options?.branchInhibitionEnabled ?? true;

  function readTexturePixels(
    tex: WebGLTexture,
    width: number,
    height: number,
  ): Uint8Array {
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error("Failed to create framebuffer for seed readback");

    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fbo);
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
      throw new Error(`Seed FBO incomplete: ${status}`);
    }

    const data = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);

    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.deleteFramebuffer(fbo);
    return data;
  }

  // ── Per-map FoliageSim + NoiseSim instances ──────────────────────────────
  const mapSims: MapSim[] = world.mapPlacements.map((placement) => {
    const { width, height } = placement.map;
    const sim = createFoliageSim(gl, width, height);
    sim.branchingEnabled = branchingEnabled;
    sim.branchInhibitionEnabled = branchInhibitionEnabled;
    const noise = createNoiseSim(gl, width, height, options?.seed);
    const light = createLightTransportSim(gl, width, height);

    const initialBranchTex = placement.map.layers.foliage;
    const initialBranchTex2 = placement.map.layers.branch2;

    if (placement.path === "synthetic") {
      const initialState = new Uint8Array(width * height * 4);
      const cx = Math.floor(width * 0.5);
      const cy = Math.floor(height * 0.5);
      const idx = (cy * width + cx) * 4;

      // Single manual branch seed at center:
      // R=1 (occupied), G=0 (packed dir=up, err=0), B=0 (reserved), A=1 (occupied)
      initialState[idx + 0] = 255;
      initialState[idx + 1] = 0;
      initialState[idx + 2] = 0;
      initialState[idx + 3] = 255;

      const initialState2 = new Uint8Array(width * height * 4);
      sim.setInitialState(initialState, initialState2);
    } else if (initialBranchTex) {
      const initialState = readTexturePixels(initialBranchTex, width, height);
      const initialState2 = initialBranchTex2
        ? readTexturePixels(initialBranchTex2, width, height)
        : undefined;
      sim.setInitialState(initialState, initialState2);
      gl.deleteTexture(initialBranchTex);
      if (initialBranchTex2) gl.deleteTexture(initialBranchTex2);
    }

    // Expose initial (empty) foliage texture to the render pass
    placement.map.layers.foliage = sim.currentTexture();
    placement.map.layers.branch2 = sim.currentTexture2();
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
      sim.step(placement.map.layers.matter!, noise.currentTexture(), light.currentTexture(), stepCount);
      placement.map.layers.foliage = sim.currentTexture();
      placement.map.layers.branch2 = sim.currentTexture2();
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
      placement.map.layers.branch2 = null;
      placement.map.layers.noise = null;
      placement.map.layers.light = null;
    }
  }

  return {
    step,
    prewarm,
    get branchingEnabled() { return branchingEnabled; },
    set branchingEnabled(v: boolean) {
      branchingEnabled = v;
      for (const ms of mapSims) ms.sim.branchingEnabled = v;
    },
    get branchInhibitionEnabled() { return branchInhibitionEnabled; },
    set branchInhibitionEnabled(v: boolean) {
      branchInhibitionEnabled = v;
      for (const ms of mapSims) ms.sim.branchInhibitionEnabled = v;
    },
    get noiseSpeed() { return mapSims[0]?.noise.speed ?? 1; },
    set noiseSpeed(v: number) { for (const ms of mapSims) ms.noise.speed = v; },
    get noiseMagnitude() { return mapSims[0]?.noise.magnitude ?? 1; },
    set noiseMagnitude(v: number) { for (const ms of mapSims) ms.noise.magnitude = v; },
    dispose,
  };
}
