/** Orthographic camera — state + matrix builder */

export interface Camera {
  x: number;          // world-space X (center)
  y: number;          // world-space Y (center)
  zoom: number;       // 1.0 = one world-pixel per screen-pixel
  viewportWidth: number;
  viewportHeight: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4.0;

export function createCamera(): Camera {
  return { x: 0, y: 0, zoom: 1, viewportWidth: 1, viewportHeight: 1 };
}

/**
 * Build a column-major 4×4 orthographic projection matrix.
 * Maps world-space to clip-space, encoding camera position and zoom.
 */
export function buildCameraMatrix(cam: Camera): Float32Array {
  const halfW = (cam.viewportWidth / cam.zoom) / 2;
  const halfH = (cam.viewportHeight / cam.zoom) / 2;

  const left   = cam.x - halfW;
  const right  = cam.x + halfW;
  const bottom = cam.y - halfH;
  const top    = cam.y + halfH;
  const near   = -1;
  const far    =  1;

  // Column-major 4×4 orthographic matrix
  const m = new Float32Array(16);
  m[0]  =  2 / (right - left);
  m[5]  =  2 / (top - bottom);
  m[10] = -2 / (far - near);
  m[12] = -(right + left) / (right - left);
  m[13] = -(top + bottom) / (top - bottom);
  m[14] = -(far + near) / (far - near);
  m[15] =  1;

  return m;
}

/**
 * Convert a screen-space pixel coordinate to world-space,
 * accounting for camera position and zoom.
 */
export function screenToWorld(
  cam: Camera,
  screenX: number,
  screenY: number
): { wx: number; wy: number } {
  // Screen origin is top-left; world origin is bottom-left
  const wx = cam.x + (screenX - cam.viewportWidth / 2) / cam.zoom;
  const wy = cam.y + (cam.viewportHeight / 2 - screenY) / cam.zoom;
  return { wx, wy };
}
