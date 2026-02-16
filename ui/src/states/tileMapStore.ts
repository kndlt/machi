import { signal } from "@preact/signals-react";
import type { TileMap } from "../models/TileMap";
import type { Tile } from "../models/Tile";
import * as persistence from "./persistence";
import type { SavedFileEntry } from "./persistence";

const MAX_UNDO = 50;

type TileSnapshot = Array<Tile | null>;

function createTileMapStore() {
  const tileMap = signal<TileMap | undefined>();

  /** The id of the currently-open named file, or null for unsaved. */
  const currentFileId = signal<string | null>(null);

  /** Reactive list of saved files for the file browser. */
  const savedFiles = signal<SavedFileEntry[]>(persistence.listFiles());

  // Undo / redo stacks store tile-array snapshots
  const undoStack: TileSnapshot[] = [];
  const redoStack: TileSnapshot[] = [];
  // Reactive counter so UI can reflect undo/redo availability
  const undoCount = signal(0);
  const redoCount = signal(0);

  const initTileMapStore = () => {
    console.log("Initializing tile map store...");

    // Try loading autosave first
    const autosaved = persistence.loadAutosave();
    if (autosaved) {
      tileMap.value = autosaved;
      currentFileId.value = null;
    } else {
      const width = 80;
      const height = 60;
      const numTiles = width * height;
      const initialTileMap: TileMap = {
        name: "Untitled",
        width,
        height,
        tiles: new Array(numTiles).fill(null),
      };
      tileMap.value = initialTileMap;
      currentFileId.value = null;
    }

    undoStack.length = 0;
    redoStack.length = 0;
    undoCount.value = 0;
    redoCount.value = 0;
    savedFiles.value = persistence.listFiles();
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

    // Auto-persist after every stroke
    const current2 = tileMap.value;
    if (current2) {
      persistence.autosave(current2);
      // If this is a named file, also persist to its slot
      if (currentFileId.value) {
        persistence.saveFile(current2, currentFileId.value);
        savedFiles.value = persistence.listFiles();
      }
    }
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

  // ─── File management ───────────────────────────────────────────────────

  /** Save current map as a new named file (prompts for name externally). */
  const saveAs = (name: string) => {
    const tm = tileMap.value;
    if (!tm) return;
    tm.name = name;
    tileMap.value = { ...tm };
    const entry = persistence.saveFile(tm);
    currentFileId.value = entry.id;
    persistence.autosave(tm);
    savedFiles.value = persistence.listFiles();
  };

  /** Load a named file by id. */
  const openFile = (id: string) => {
    const tm = persistence.loadFile(id);
    if (!tm) return;
    tileMap.value = tm;
    currentFileId.value = id;
    persistence.autosave(tm);
    undoStack.length = 0;
    redoStack.length = 0;
    undoCount.value = 0;
    redoCount.value = 0;
    savedFiles.value = persistence.listFiles();
  };

  /** Delete a named file. If it's the currently-open file, create a new blank map. */
  const deleteFileById = (id: string) => {
    persistence.deleteFile(id);
    if (currentFileId.value === id) {
      newFile();
    }
    savedFiles.value = persistence.listFiles();
  };

  /** Create a fresh blank map, discarding the current one. */
  const newFile = () => {
    const width = 80;
    const height = 60;
    tileMap.value = {
      name: "Untitled",
      width,
      height,
      tiles: new Array(width * height).fill(null),
    };
    currentFileId.value = null;
    undoStack.length = 0;
    redoStack.length = 0;
    undoCount.value = 0;
    redoCount.value = 0;
    persistence.autosave(tileMap.value);
  };

  /** Rename the current map (and re-save if named). */
  const rename = (name: string) => {
    const tm = tileMap.value;
    if (!tm) return;
    tm.name = name;
    tileMap.value = { ...tm };
    persistence.autosave(tm);
    if (currentFileId.value) {
      persistence.saveFile(tm, currentFileId.value);
      savedFiles.value = persistence.listFiles();
    }
  };

  return {
    tileMap,
    currentFileId,
    savedFiles,
    undoCount,
    redoCount,
    initTileMapStore,
    snapshotTiles,
    pushUndo,
    undo,
    redo,
    saveAs,
    openFile,
    deleteFileById,
    newFile,
    rename,
  };
}


export type TileMapStore = ReturnType<typeof createTileMapStore>;

export const tileMapStore = createTileMapStore();

// @ts-expect-error Exposed for debugging
window.tileMapStore = tileMapStore;