import { useSignals } from "@preact/signals-react/runtime";
import { editorStore } from "../states/editorStore";
import { tileMapStore } from "../states/tileMapStore";

export function StatusBar() {
    // console.log("[render] StatusBar");
    useSignals();
    const zoom = editorStore.zoom.value;
    const hovered = editorStore.hoveredTile.value;
    const mapName = tileMapStore.tileMap.value?.name ?? "—";
    const isSaved = tileMapStore.currentFileId.value !== null;

    return (
        <div
            style={{
                height: 24,
                backgroundColor: "var(--color-panel)",
                borderTop: "1px solid var(--gray-a5)",
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                gap: 16,
                fontSize: 11,
                color: "var(--gray-9)",
                flexShrink: 0,
            }}
        >
            <span>{mapName}{!isSaved && " (unsaved)"}</span>
            <span>Zoom: {Math.round(zoom * 100)}%</span>
            {hovered && <span>Tile: {hovered.x}, {hovered.y}</span>}
        </div>
    );
}
