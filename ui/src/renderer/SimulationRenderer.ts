/**
 * SimulationRenderer — runs GPU simulation passes that read all layers
 * at time t and produce updated layers at time t+1.
 *
 * Phase 2: foliage pass with ping-pong double buffering.
 *   IN:  matter texture + previous foliage texture
 *   OUT: new foliage texture (swapped each step)
 *
 * Uses render-to-texture via FBO. Each map gets two foliage textures
 * that alternate as read/write targets each step.
 */

import type { World, MapPlacement } from "../world/types";
import { SIM_VERTEX, SIM_FOLIAGE_FRAGMENT, createProgram } from "./shaders";

/** Per-map simulation GPU resources (ping-pong pair) */
interface MapSimGPU {
  placement: MapPlacement;
  fbos: [WebGLFramebuffer, WebGLFramebuffer];
  textures: [WebGLTexture, WebGLTexture];
  /** Which texture index (0 or 1) is the current "read" source */
  readIdx: number;
  width: number;
  height: number;
}

export interface SimulationRenderer {
  /** Run one simulation step for all maps */
  step(): void;
  dispose(): void;
}

export function createSimulationRenderer(
  gl: WebGL2RenderingContext,
  world: World
): SimulationRenderer {
  // ── Foliage simulation program ───────────────────────────────────────────
  const program = createProgram(gl, SIM_VERTEX, SIM_FOLIAGE_FRAGMENT);
  const u_matter = gl.getUniformLocation(program, "u_matter");
  const u_foliage_prev = gl.getUniformLocation(program, "u_foliage_prev");
  const u_seed = gl.getUniformLocation(program, "u_seed");

  // ── Dummy VAO for fullscreen triangle (no attributes needed) ─────────────
  const emptyVAO = gl.createVertexArray()!;

  // ── Helper: create a foliage-sized texture ───────────────────────────────
  function createFoliageTexture(width: number, height: number): WebGLTexture {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8,
      width, height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  function createFBO(tex: WebGLTexture): WebGLFramebuffer {
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D, tex, 0
    );
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Simulation FBO incomplete: ${status}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  // ── Per-map ping-pong resources ──────────────────────────────────────────
  const mapSims: MapSimGPU[] = world.mapPlacements.map((placement) => {
    const { width, height } = placement.map;

    const texA = createFoliageTexture(width, height);
    const texB = createFoliageTexture(width, height);
    const fboA = createFBO(texA);
    const fboB = createFBO(texB);

    // Start with texA as readable (empty), texB as write target
    placement.map.layers.foliage = texA;

    return {
      placement,
      fbos: [fboA, fboB],
      textures: [texA, texB],
      readIdx: 0,
      width,
      height,
    };
  });

  let stepCount = 0;

  // ── Simulation step ──────────────────────────────────────────────────────
  function step(): void {
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    gl.useProgram(program);
    gl.bindVertexArray(emptyVAO);
    gl.disable(gl.BLEND);

    gl.uniform1i(u_matter, 0);
    gl.uniform1i(u_foliage_prev, 1);
    gl.uniform1f(u_seed, Math.sin(stepCount * 127.1 + 311.7) * 43758.5453 % 1.0);
    stepCount++;

    for (const sim of mapSims) {
      const readTex = sim.textures[sim.readIdx];
      const writeIdx = 1 - sim.readIdx;
      const writeFbo = sim.fbos[writeIdx];
      const writeTex = sim.textures[writeIdx];

      // Render into write texture
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
      gl.viewport(0, 0, sim.width, sim.height);

      // Bind inputs
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sim.placement.map.layers.matter);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, readTex);

      // Draw fullscreen triangle
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Swap: write becomes read for next step, and expose to render pass
      sim.readIdx = writeIdx;
      sim.placement.map.layers.foliage = writeTex;
    }

    // Restore
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
  }

  // ── Dispose ──────────────────────────────────────────────────────────────
  function dispose(): void {
    for (const sim of mapSims) {
      gl.deleteFramebuffer(sim.fbos[0]);
      gl.deleteFramebuffer(sim.fbos[1]);
      gl.deleteTexture(sim.textures[0]);
      gl.deleteTexture(sim.textures[1]);
      sim.placement.map.layers.foliage = null;
    }
    gl.deleteVertexArray(emptyVAO);
    gl.deleteProgram(program);
  }

  return { step, dispose };
}
