import { signal } from "@preact/signals-react";

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
  const hoveredTile = signal<{ x: number; y: number } | null>(null);
  const viewport = signal<Viewport | null>(null);

  return {
    activeTool,
    hoveredTile,
    viewport,
  };
}

export type EditorStore = ReturnType<typeof createEditorStore>;

export const editorStore = createEditorStore();
