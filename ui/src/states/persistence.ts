import type { TileMap } from "../models/TileMap";
import type { Tile } from "../models/Tile";

const STORAGE_PREFIX = "machi:";
const AUTOSAVE_KEY = `${STORAGE_PREFIX}autosave`;
const INDEX_KEY = `${STORAGE_PREFIX}index`;

/** Minimal JSON-safe representation of a saved file. */
export interface SavedFileEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  updatedAt: number; // epoch ms
}

// ─── Serialisation helpers ──────────────────────────────────────────────────

function serialiseTileMap(tm: TileMap): string {
  // Tiles stored as a compact array of matter strings (or null)
  const tiles = tm.tiles.map((t) => (t ? t.matter : null));
  return JSON.stringify({ name: tm.name, width: tm.width, height: tm.height, tiles });
}

function deserialiseTileMap(json: string): TileMap {
  const data = JSON.parse(json);
  const tiles: Array<Tile | null> = data.tiles.map((m: string | null) =>
    m ? { matter: m as Tile["matter"] } : null,
  );
  return { name: data.name, width: data.width, height: data.height, tiles };
}

// ─── Index (list of saved files) ────────────────────────────────────────────

function loadIndex(): SavedFileEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveIndex(entries: SavedFileEntry[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Auto-save the current working map (unnamed). */
export function autosave(tm: TileMap) {
  localStorage.setItem(AUTOSAVE_KEY, serialiseTileMap(tm));
}

/** Load the auto-saved working map, if any. */
export function loadAutosave(): TileMap | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? deserialiseTileMap(raw) : null;
  } catch {
    return null;
  }
}

/** Save (or overwrite) a named file. Returns the entry. */
export function saveFile(tm: TileMap, id?: string): SavedFileEntry {
  const entries = loadIndex();
  const fileId = id ?? crypto.randomUUID();
  const key = `${STORAGE_PREFIX}file:${fileId}`;

  localStorage.setItem(key, serialiseTileMap(tm));

  const existing = entries.find((e) => e.id === fileId);
  const entry: SavedFileEntry = {
    id: fileId,
    name: tm.name,
    width: tm.width,
    height: tm.height,
    updatedAt: Date.now(),
  };

  if (existing) {
    Object.assign(existing, entry);
  } else {
    entries.push(entry);
  }
  saveIndex(entries);
  return entry;
}

/** Load a named file by id. */
export function loadFile(id: string): TileMap | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}file:${id}`);
    return raw ? deserialiseTileMap(raw) : null;
  } catch {
    return null;
  }
}

/** Delete a named file. */
export function deleteFile(id: string) {
  localStorage.removeItem(`${STORAGE_PREFIX}file:${id}`);
  const entries = loadIndex().filter((e) => e.id !== id);
  saveIndex(entries);
}

/** List all saved files. */
export function listFiles(): SavedFileEntry[] {
  return loadIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}
