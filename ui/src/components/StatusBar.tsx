import { useSignals } from "@preact/signals-react/runtime";
import { editorStore } from "../states/editorStore";

export function StatusBar() {
    useSignals();
    const zoom = editorStore.zoom.value;
    const hovered = editorStore.hoveredTile.value;

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
            <span>Zoom: {Math.round(zoom * 100)}%</span>
            {hovered && <span>Tile: {hovered.x}, {hovered.y}</span>}
        </div>
    );
}
