/**
 * LayerRenderer — renders map placements as composited world-space quads.
 *
 * Each MapPlacement gets a quad at (placement.x, placement.y) sized to the
 * map dimensions.  The fragment shader composites sky → background → foreground
 * in a single pass.
 */

import type { World, MapPlacement } from "../world/types";
import { LAYER_VERTEX, LAYER_FRAGMENT, createProgram } from "./shaders";
import type { Camera } from "./Camera";
import { buildCameraMatrix } from "./Camera";

/** Cached GPU resources for one map placement */
interface MapGPU {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  placement: MapPlacement;
}

export interface LayerRenderer {
  render(camera: Camera): void;
  showMatter: boolean;
  dispose(): void;
}

export function createLayerRenderer(
  gl: WebGL2RenderingContext,
  world: World
): LayerRenderer {
  // ── Program ──────────────────────────────────────────────────────────────
  const program = createProgram(gl, LAYER_VERTEX, LAYER_FRAGMENT);

  // Uniform locations
  const u_camera_matrix = gl.getUniformLocation(program, "u_camera_matrix");
  const u_map_origin = gl.getUniformLocation(program, "u_map_origin");
  const u_map_size = gl.getUniformLocation(program, "u_map_size");
  const u_sky = gl.getUniformLocation(program, "u_sky");
  const u_background = gl.getUniformLocation(program, "u_background");
  const u_foreground = gl.getUniformLocation(program, "u_foreground");
  const u_matter = gl.getUniformLocation(program, "u_matter");
  const u_show_matter = gl.getUniformLocation(program, "u_show_matter");

  let showMatter = false;

  // ── Per-map GPU resources ────────────────────────────────────────────────
  const mapGPUs: MapGPU[] = world.mapPlacements.map((placement) => {
    const { x, y, map } = placement;
    const { width: w, height: h } = map;

    // Triangle-strip quad in world-space
    //   v2──v3
    //   │ ╲  │
    //   v0──v1
    const vertices = new Float32Array([
      x,     y,       // bottom-left
      x + w, y,       // bottom-right
      x,     y + h,   // top-left
      x + w, y + h,   // top-right
    ]);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // a_position at location 0
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    return { vao, vbo, placement };
  });

  // ── Render ───────────────────────────────────────────────────────────────
  function render(camera: Camera): void {
    const camMatrix = buildCameraMatrix(camera);

    gl.useProgram(program);
    gl.uniformMatrix4fv(u_camera_matrix, false, camMatrix);

    // Assign texture units once
    gl.uniform1i(u_sky, 0);
    gl.uniform1i(u_background, 1);
    gl.uniform1i(u_foreground, 2);
    gl.uniform1i(u_matter, 3);
    gl.uniform1i(u_show_matter, showMatter ? 1 : 0);

    // Enable blending for correct alpha compositing
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    for (const { vao, placement } of mapGPUs) {
      const { x, y, map } = placement;
      const { width, height, layers } = map;

      gl.uniform2f(u_map_origin, x, y);
      gl.uniform2f(u_map_size, width, height);

      // Bind layer textures
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, layers.sky);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, layers.background);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, layers.foreground);

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, layers.matter);

      // Draw quad
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  // ── Dispose ──────────────────────────────────────────────────────────────
  function dispose(): void {
    for (const { vao, vbo, placement } of mapGPUs) {
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      const { layers } = placement.map;
      gl.deleteTexture(layers.sky);
      gl.deleteTexture(layers.background);
      gl.deleteTexture(layers.foreground);
      gl.deleteTexture(layers.matter);
    }
    gl.deleteProgram(program);
  }

  return {
    render,
    get showMatter() { return showMatter; },
    set showMatter(v: boolean) { showMatter = v; },
    dispose,
  };
}
