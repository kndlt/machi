/**
 * CameraControls — keyboard (arrow keys) + mouse drag pan + wheel zoom.
 *
 * Zoom is centered on the mouse cursor position.
 */

import type { Camera } from "../renderer/Camera";
import { screenToWorld, MIN_ZOOM, MAX_ZOOM } from "../renderer/Camera";

const PAN_SPEED = 5;         // pixels per frame at 1× zoom
const ZOOM_FACTOR = 1.1;     // multiplier per wheel notch

export interface CameraControls {
  dispose(): void;
}

export function createCameraControls(
  canvas: HTMLCanvasElement,
  camera: Camera
): CameraControls {
  // ── Keyboard state ─────────────────────────────────────────────────────
  const keys = new Set<string>();

  const onKeyDown = (e: KeyboardEvent) => {
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

    // Apply zoom
    const direction = e.deltaY < 0 ? 1 : -1;
    const newZoom = camera.zoom * Math.pow(ZOOM_FACTOR, direction);
    camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

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
