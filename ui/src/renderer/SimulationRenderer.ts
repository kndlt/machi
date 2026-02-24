/**
 * SimulationRenderer — runs GPU simulation passes that read all layers
 * at time t and produce updated layers at time t+1.
 *
 * Phase 2: foliage pass only.
 *   IN:  matter texture (+ previous foliage)
 *   OUT: foliage texture (written into map.layers.foliage)
 *
 * Uses render-to-texture via FBO. Each map gets its own foliage texture
 * at the same resolution as the map.
 */

import type { World, MapPlacement } from "../world/types";
import { SIM_VERTEX, SIM_FOLIAGE_FRAGMENT, createProgram } from "./shaders";

/** Per-map simulation GPU resources */
interface MapSimGPU {
  placement: MapPlacement;
  fbo: WebGLFramebuffer;
  foliageTex: WebGLTexture;
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

  // ── Dummy VAO for fullscreen triangle (no attributes needed) ─────────────
  const emptyVAO = gl.createVertexArray()!;

  // ── Per-map FBO + foliage texture ────────────────────────────────────────
  const mapSims: MapSimGPU[] = world.mapPlacements.map((placement) => {
    const { width, height } = placement.map;

    // Create foliage texture (RGBA, same size as map)
    const foliageTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, foliageTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8,
      width, height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Store on the map layers so the render pass can read it
    placement.map.layers.foliage = foliageTex;

    // Create FBO targeting this texture
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D, foliageTex, 0
    );

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Simulation FBO incomplete: ${status}`);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { placement, fbo, foliageTex, width, height };
  });

  // ── Simulation step ──────────────────────────────────────────────────────
  function step(): void {
    // Save current viewport
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    gl.useProgram(program);
    gl.bindVertexArray(emptyVAO);
    gl.disable(gl.BLEND);

    // Texture unit assignments
    gl.uniform1i(u_matter, 0);
    gl.uniform1i(u_foliage_prev, 1);

    for (const { fbo, foliageTex, width, height, placement } of mapSims) {
      // Bind FBO → render into foliage texture
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, width, height);

      // Bind inputs
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, placement.map.layers.matter);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, foliageTex);

      // Draw fullscreen triangle
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Restore
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
  }

  // ── Dispose ──────────────────────────────────────────────────────────────
  function dispose(): void {
    for (const { fbo, foliageTex, placement } of mapSims) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(foliageTex);
      placement.map.layers.foliage = null;
    }
    gl.deleteVertexArray(emptyVAO);
    gl.deleteProgram(program);
  }

  return { step, dispose };
}
