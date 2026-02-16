import { signal } from "@preact/signals-react";
import type { TileMap } from "../models/TileMap";

function createTileMapStore() {
  const tileMap = signal<TileMap | undefined>();

  const initTileMapStore = () => {
    console.log("Initializing tile map store...");
    const width = 80;
    const height = 60;
    const numTiles = width * height;
    const initialTileMap: TileMap = {
      name: "Test Map",
      width,
      height,
      tiles: new Array(numTiles).fill(null)
    };
    tileMap.value = initialTileMap;
  }

  return {
    tileMap,
    initTileMapStore
  };
}


export type TileMapStore = ReturnType<typeof createTileMapStore>;

export const tileMapStore = createTileMapStore();

// @ts-expect-error Exposed for debugging
window.tileMapStore = tileMapStore;