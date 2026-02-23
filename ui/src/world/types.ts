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
  map: GameMap;       // loaded map data
}

export interface GameMap {
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
  // matter and support not rendered in Phase 01
}
