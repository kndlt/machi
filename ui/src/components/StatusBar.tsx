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
                backgroundColor: "#1e1e1e",
                borderTop: "1px solid #3e3e3e",
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                gap: 16,
                fontSize: 11,
                color: "#888",
                flexShrink: 0,
            }}
        >
            <span>Zoom: {Math.round(zoom * 100)}%</span>
            {hovered && <span>Tile: {hovered.x}, {hovered.y}</span>}
        </div>
    );
}
