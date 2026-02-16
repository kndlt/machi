import { signal } from "@preact/signals-react";
import type { TileMap } from "../models/TileMap";
import type { Tile } from "../models/Tile";

const MAX_UNDO = 50;

type TileSnapshot = Array<Tile | null>;

function createTileMapStore() {
  const tileMap = signal<TileMap | undefined>();

  // Undo / redo stacks store tile-array snapshots
  const undoStack: TileSnapshot[] = [];
  const redoStack: TileSnapshot[] = [];
  // Reactive counter so UI can reflect undo/redo availability
  const undoCount = signal(0);
  const redoCount = signal(0);

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
    undoStack.length = 0;
    redoStack.length = 0;
    undoCount.value = 0;
    redoCount.value = 0;
  };

  /** Take a snapshot of the current tiles (call before a stroke begins). */
  const snapshotTiles = (): TileSnapshot | undefined => {
    const tm = tileMap.value;
    if (!tm) return undefined;
    return tm.tiles.slice();
  };

  /** Push a pre-stroke snapshot onto the undo stack (call after the stroke ends).
   *  Only pushes if tiles actually changed. */
  const pushUndo = (before: TileSnapshot) => {
    const tm = tileMap.value;
    if (!tm) return;
    // Quick equality check — if nothing changed, skip
    const current = tm.tiles;
    let changed = false;
    for (let i = 0; i < current.length; i++) {
      if (before[i]?.matter !== current[i]?.matter) { changed = true; break; }
    }
    if (!changed) return;

    undoStack.push(before);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    // Any new edit kills the redo branch
    redoStack.length = 0;
    undoCount.value = undoStack.length;
    redoCount.value = 0;
  };

  const undo = () => {
    const tm = tileMap.value;
    if (!tm || undoStack.length === 0) return;
    // Save current state to redo
    redoStack.push(tm.tiles.slice());
    // Restore previous state
    const prev = undoStack.pop()!;
    tileMap.value = { ...tm, tiles: prev };
    undoCount.value = undoStack.length;
    redoCount.value = redoStack.length;
  };

  const redo = () => {
    const tm = tileMap.value;
    if (!tm || redoStack.length === 0) return;
    // Save current state to undo
    undoStack.push(tm.tiles.slice());
    // Restore next state
    const next = redoStack.pop()!;
    tileMap.value = { ...tm, tiles: next };
    undoCount.value = undoStack.length;
    redoCount.value = redoStack.length;
  };

  return {
    tileMap,
    undoCount,
    redoCount,
    initTileMapStore,
    snapshotTiles,
    pushUndo,
    undo,
    redo,
  };
}


export type TileMapStore = ReturnType<typeof createTileMapStore>;

export const tileMapStore = createTileMapStore();

// @ts-expect-error Exposed for debugging
window.tileMapStore = tileMapStore;