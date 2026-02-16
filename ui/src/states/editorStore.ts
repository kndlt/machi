import { signal } from "@preact/signals-react";

export type Tool = "pencil" | "eraser" | "bucket";

function createEditorStore() {
  const activeTool = signal<Tool>("pencil");
  const hoveredTile = signal<{ x: number; y: number } | null>(null);

  return {
    activeTool,
    hoveredTile,
  };
}

export type EditorStore = ReturnType<typeof createEditorStore>;

export const editorStore = createEditorStore();
