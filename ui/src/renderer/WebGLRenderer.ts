/**
 * WebGLRenderer — owns the GL context, resize handling, clear, and animation loop.
 */

import type { Camera } from "./Camera";
import type { MapRenderer } from "./MapRenderer";
import type { SimulationRenderer } from "../simulation/SimulationRenderer";

export interface WebGLRenderer {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  /** Start the rAF loop. Returns a stop function. */
  start(camera: Camera, mapRenderer: MapRenderer, simulation?: SimulationRenderer): () => void;
  /** Resize viewport to match canvas CSS size. */
  resize(camera: Camera): void;
  /** Simulation tick interval in ms (lower = faster). */
  simInterval: number;
  /** Delay in ms before first simulation tick starts after loop start. */
  simStartDelayMs: number;
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

  // ── FPS meter ──────────────────────────────────────────────────────────────
  const fpsEl = document.createElement("div");
  fpsEl.style.cssText =
    "position:absolute;top:8px;left:8px;color:#0f0;font:12px monospace;" +
    "pointer-events:none;z-index:10;text-shadow:0 0 2px #000";
  canvas.parentElement?.appendChild(fpsEl);

  let frameCount = 0;
  let lastFpsTime = performance.now();
  let frameTimes: number[] = [];

  const MODE_NAMES = [
    "visual",
    "matter",
    "segmentation",
    "foliage",
    "branch-r",
    "branch-dir",
    "branch-err",
    "branch-a",
    "noise",
    "dir-light",
  ];

  function updateFps(frameMs: number, viewMode: number, foliageEnabled: boolean) {
    frameCount++;
    frameTimes.push(frameMs);
    const now = performance.now();
    const elapsed = now - lastFpsTime;
    if (elapsed >= 1000) {
      const fps = Math.round((frameCount * 1000) / elapsed);
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const max = Math.max(...frameTimes);
      const mode = MODE_NAMES[viewMode] ?? `mode ${viewMode}`;
      const foliage = foliageEnabled ? "foliage ON" : "foliage OFF";
      fpsEl.textContent = `${fps} FPS | ${avg.toFixed(1)}ms avg | ${max.toFixed(1)}ms max | ${mode} | ${foliage} | sim ${simInterval}ms`;
      frameCount = 0;
      lastFpsTime = now;
      frameTimes = [];
    }
  }

  // ── Animation loop ────────────────────────────────────────────────────────
  let simInterval = 1000; // ms between simulation steps
  let simStartDelayMs = 0;

  function start(camera: Camera, mapRenderer: MapRenderer, simulation?: SimulationRenderer): () => void {
    let rafId = 0;
    const simStartAt = performance.now() + simStartDelayMs;
    let lastSimTime = simStartAt - simInterval;

    const onResize = () => resize(camera);
    window.addEventListener("resize", onResize);

    // Initial size
    resize(camera);

    const tick = () => {
      const t0 = performance.now();

      // Tick simulation on a timer
      if (simulation && t0 >= simStartAt && t0 - lastSimTime >= simInterval) {
        simulation.step();
        lastSimTime = t0;
      }

      gl.clearColor(0.08, 0.08, 0.10, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      mapRenderer.render(camera);

      const t1 = performance.now();
      updateFps(t1 - t0, mapRenderer.viewMode, mapRenderer.foliageEnabled);

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
    fpsEl.remove();
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }

  return {
    gl,
    canvas,
    start,
    resize,
    get simInterval() { return simInterval; },
    set simInterval(v: number) { simInterval = Math.max(8, v); },
    get simStartDelayMs() { return simStartDelayMs; },
    set simStartDelayMs(v: number) { simStartDelayMs = Math.max(0, Math.round(v)); },
    dispose,
  };
}
