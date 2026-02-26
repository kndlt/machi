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

  const visionEl = document.createElement("div");
  visionEl.textContent = "Building the physics where digital souls will live.";
  visionEl.style.cssText =
    "position:absolute;right:12px;bottom:10px;" +
    "color:rgba(196,255,214,0.52);font:11px monospace;letter-spacing:0.03em;" +
    "pointer-events:none;z-index:9;text-shadow:0 0 1px #000";
  canvas.parentElement?.appendChild(visionEl);

  const resourceLegendEl = document.createElement("div");
  resourceLegendEl.style.cssText =
    "position:absolute;left:10px;bottom:12px;display:none;flex-direction:column;gap:4px;" +
    "color:rgba(210,255,220,0.9);font:11px monospace;pointer-events:none;z-index:10;" +
    "text-shadow:0 0 1px #000";

  const resourceLegendTitleEl = document.createElement("div");
  resourceLegendTitleEl.textContent = "resource heat";
  resourceLegendEl.appendChild(resourceLegendTitleEl);

  const gradientWrapEl = document.createElement("div");
  gradientWrapEl.style.cssText =
    "position:relative;width:190px;height:12px;border:1px solid rgba(0,0,0,0.55);" +
    "background:rgba(0,0,0,0.2)";

  const gradientBarEl = document.createElement("div");
  gradientBarEl.style.cssText =
    "position:absolute;inset:0;" +
    "background:linear-gradient(90deg," +
    "rgb(13,26,115) 0%," +
    "rgb(0,191,255) 35%," +
    "rgb(255,242,26) 65%," +
    "rgb(242,26,13) 100%)";
  gradientWrapEl.appendChild(gradientBarEl);

  const midMarkerEl = document.createElement("div");
  midMarkerEl.style.cssText =
    "position:absolute;left:50%;top:-2px;transform:translateX(-0.5px);" +
    "width:1px;height:16px;background:rgba(255,255,255,0.95)";
  gradientWrapEl.appendChild(midMarkerEl);
  resourceLegendEl.appendChild(gradientWrapEl);

  const resourceLegendScaleEl = document.createElement("div");
  resourceLegendScaleEl.style.cssText =
    "display:flex;justify-content:space-between;align-items:center;width:190px;" +
    "color:rgba(210,255,220,0.82)";
  resourceLegendScaleEl.innerHTML = "<span>-127</span><span>0</span><span>+127</span>";
  resourceLegendEl.appendChild(resourceLegendScaleEl);

  canvas.parentElement?.appendChild(resourceLegendEl);

  let frameCount = 0;
  let lastFpsTime = performance.now();
  let frameTimes: number[] = [];

  const MODE_NAMES = [
    "visual",
    "matter",
    "segmentation",
    "foliage",
    "branch-id",
    "branch-dir",
    "branch-err",
    "branch-a",
    "noise",
    "dir-light",
    "branch-inhib",
    "resource",
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
      resourceLegendEl.style.display = mapRenderer.viewMode === 11 ? "flex" : "none";

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
    visionEl.remove();
    resourceLegendEl.remove();
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
