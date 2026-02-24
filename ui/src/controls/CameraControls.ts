/**
 * CameraControls — keyboard (arrow keys) + mouse drag pan + wheel zoom.
 *
 * Zoom is centered on the mouse cursor position.
 */

import type { Camera } from "../renderer/Camera";
import { screenToWorld } from "../renderer/Camera";
import type { MapRenderer } from "../renderer/MapRenderer";

const PAN_SPEED = 5;         // pixels per frame at 1× zoom

/** Zoom snap levels — integers + clean fractions for pixel-perfect rendering */
const ZOOM_SNAPS = [0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 12, 16, 32, 64];

export interface CameraControls {
  dispose(): void;
}

export function createCameraControls(
  canvas: HTMLCanvasElement,
  camera: Camera,
  mapRenderer: MapRenderer
): CameraControls {
  // ── Keyboard state ─────────────────────────────────────────────────────
  const keys = new Set<string>();

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      mapRenderer.viewMode = mapRenderer.viewMode + 1; // cycles 0→1→2→0
      return;
    }
    if (e.key === "f" || e.key === "F") {
      mapRenderer.foliageEnabled = !mapRenderer.foliageEnabled;
      return;
    }
    if (e.key === "o" || e.key === "O") {
      mapRenderer.outlineEnabled = !mapRenderer.outlineEnabled;
      return;
    }
    keys.add(e.key);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.key);
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // Tick keyboard pan every frame
  let rafId = 0;
  const tickKeys = () => {
    const speed = PAN_SPEED / camera.zoom;
    if (keys.has("ArrowLeft")  || keys.has("a")) camera.x -= speed;
    if (keys.has("ArrowRight") || keys.has("d")) camera.x += speed;
    if (keys.has("ArrowDown")  || keys.has("s")) camera.y -= speed;
    if (keys.has("ArrowUp")    || keys.has("w")) camera.y += speed;
    rafId = requestAnimationFrame(tickKeys);
  };
  rafId = requestAnimationFrame(tickKeys);

  // ── Mouse drag ─────────────────────────────────────────────────────────
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return; // left button only
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    // Screen right → world right (positive X), screen down → world down (negative Y)
    camera.x -= dx / camera.zoom;
    camera.y += dy / camera.zoom;
  };

  const onMouseUp = () => {
    dragging = false;
  };

  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  // ── Mouse wheel zoom ──────────────────────────────────────────────────
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();

    // World position under mouse before zoom
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = screenToWorld(camera, sx, sy);

    // Snap to next/prev zoom level
    const direction = e.deltaY < 0 ? 1 : -1;
    const currentIdx = ZOOM_SNAPS.findIndex((z) => z >= camera.zoom - 0.001);
    const nextIdx = Math.max(0, Math.min(ZOOM_SNAPS.length - 1,
      (currentIdx === -1 ? ZOOM_SNAPS.length - 1 : currentIdx) + direction
    ));
    camera.zoom = ZOOM_SNAPS[nextIdx];

    // World position under mouse after zoom
    const after = screenToWorld(camera, sx, sy);

    // Adjust camera so the world-point stays under the cursor
    camera.x -= after.wx - before.wx;
    camera.y -= after.wy - before.wy;
  };

  canvas.addEventListener("wheel", onWheel, { passive: false });

  // ── Dispose ────────────────────────────────────────────────────────────
  function dispose(): void {
    cancelAnimationFrame(rafId);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    canvas.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    canvas.removeEventListener("wheel", onWheel);
  }

  return { dispose };
}
