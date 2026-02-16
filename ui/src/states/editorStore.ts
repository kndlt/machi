import { signal } from "@preact/signals-react";
import type { TileMatter } from "../models/Tile";

export type Tool = "pencil" | "eraser" | "bucket";

export interface Viewport {
  /** Camera x in world-pixels */
  x: number;
  /** Camera y in world-pixels */
  y: number;
  /** Visible width in world-pixels */
  w: number;
  /** Visible height in world-pixels */
  h: number;
}

function createEditorStore() {
  const activeTool = signal<Tool>("pencil");
  const activeMatter = signal<TileMatter | null>("dirt");
  const hoveredTile = signal<{ x: number; y: number } | null>(null);
  const viewport = signal<Viewport | null>(null);
  const zoom = signal(1);

  /** Which dialog is currently open (null = none). */
  const activeDialog = signal<"fileBrowser" | "saveAs" | null>(null);

  return {
    activeTool,
    activeMatter,
    hoveredTile,
    viewport,
    zoom,
    activeDialog,
  };
}

export type EditorStore = ReturnType<typeof createEditorStore>;

export const editorStore = createEditorStore();
