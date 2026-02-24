/** World & Map type definitions for Phase 01 */

export interface World {
  title: string;
  description: string;
  mapPlacements: MapPlacement[];
}

export interface MapPlacement {
  path: string;       // relative path to map.xml
  x: number;          // world-space X position
  y: number;          // world-space Y position
  map: WorldMap;       // loaded map data
}

export interface WorldMap {
  title: string;
  description: string;
  width: number;      // map width in pixels
  height: number;     // map height in pixels
  layers: MapLayers;
}

export interface MapLayers {
  sky: WebGLTexture | null;
  background: WebGLTexture | null;
  foreground: WebGLTexture | null;
  support: WebGLTexture | null;
  matter: WebGLTexture | null;
  /** Simulation-produced foliage layer (GPU texture, written by SimulationRenderer) */
  foliage: WebGLTexture | null;
  /** Simulation-produced noise gradient (GPU texture, written by SimulationRenderer) */
  noise: WebGLTexture | null;
}
