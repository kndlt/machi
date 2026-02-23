/**
 * WebGLRenderer — owns the GL context, resize handling, clear, and animation loop.
 */

import type { Camera } from "./Camera";
import type { LayerRenderer } from "./LayerRenderer";

export interface WebGLRenderer {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  /** Start the rAF loop. Returns a stop function. */
  start(camera: Camera, layerRenderer: LayerRenderer): () => void;
  /** Resize viewport to match canvas CSS size. */
  resize(camera: Camera): void;
  dispose(): void;
}

export function createWebGLRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const glOrNull = canvas.getContext("webgl2", { antialias: false });
  if (!glOrNull) {
    throw new Error("WebGL2 not supported");
  }
  const gl: WebGL2RenderingContext = glOrNull;

  // ── Resize ───────────────────────────────────────────────────────────────
  function resize(camera: Camera): void {
    // Intentionally ignoring devicePixelRatio for chunky pixel-art look.
    // imageRendering: pixelated on the canvas CSS handles browser upscale.
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    camera.viewportWidth = canvas.width;
    camera.viewportHeight = canvas.height;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // ── Animation loop ────────────────────────────────────────────────────────
  function start(camera: Camera, layerRenderer: LayerRenderer): () => void {
    let rafId = 0;

    const onResize = () => resize(camera);
    window.addEventListener("resize", onResize);

    // Initial size
    resize(camera);

    const tick = () => {
      gl.clearColor(0.08, 0.08, 0.10, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      layerRenderer.render(camera);

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }

  // ── Dispose ──────────────────────────────────────────────────────────────
  function dispose(): void {
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }

  return { gl, canvas, start, resize, dispose };
}
