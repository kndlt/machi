import { useEffect, useRef } from "react";
import { useSignals } from "@preact/signals-react/runtime";
import { tileMapStore } from "../states/tileMapStore";
import { editorStore } from "../states/editorStore";

export function Inspector() {
    console.log("[render] Inspector");
    useSignals();
    const tileMap = tileMapStore.tileMap.value;
    const hovered = editorStore.hoveredTile.value;

    return (
        <div
            style={{
                width: 240,
                backgroundColor: "var(--color-panel)",
                borderLeft: "1px solid var(--gray-a5)",
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                overflow: "auto",
            }}
        >
            {/* Mini Map */}
            <Section title="MINIMAP">
                {tileMap ? <MiniMap /> : <Placeholder text="No map loaded" />}
            </Section>

            {/* Map Info */}
            <Section title="MAP">
                {tileMap ? (
                    <InfoGrid
                        rows={[
                            ["Name", tileMap.name],
                            ["Size", `${tileMap.width} × ${tileMap.height}`],
                        ]}
                    />
                ) : (
                    <Placeholder text="—" />
                )}
            </Section>

            {/* Hovered Tile */}
            <Section title="TILE">
                {hovered && tileMap ? (
                    <InfoGrid
                        rows={[
                            ["Position", `${hovered.x}, ${hovered.y}`],
                            [
                                "Matter",
                                tileMap.tiles[hovered.y * tileMap.width + hovered.x]?.matter ?? "air",
                            ],
                        ]}
                    />
                ) : (
                    <Placeholder text="Hover a tile" />
                )}
            </Section>

            {/* Controls hint */}
            <Section title="CONTROLS">
                <div style={{ color: "var(--gray-9)", fontSize: 11, lineHeight: 1.6 }}>
                    <div>Space + Drag → Pan</div>
                    <div>Scroll → Zoom</div>
                    <div>P → Pencil</div>
                    <div>E → Eraser</div>
                    <div>G → Bucket Fill</div>
                    <div>⌘Z → Undo ({tileMapStore.undoCount.value})</div>
                    <div>⌘⇧Z → Redo ({tileMapStore.redoCount.value})</div>
                    <div>⌘S → Save</div>
                    <div>⌘⇧S → Save As</div>
                    <div>⌘O → Open</div>
                </div>
            </Section>
        </div>
    );
}

// --------------- Sub-components ---------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div
                style={{
                    color: "var(--gray-9)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    marginBottom: 6,
                }}
            >
                {title}
            </div>
            {children}
        </div>
    );
}

function InfoGrid({ rows }: { rows: [string, string][] }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: "2px 8px", fontSize: 11 }}>
            {rows.map(([label, value]) => (
                <div key={label} style={{ display: "contents" }}>
                    <span style={{ color: "var(--gray-9)" }}>{label}</span>
                    <span style={{ color: "var(--gray-12)" }}>{value}</span>
                </div>
            ))}
        </div>
    );
}

function Placeholder({ text }: { text: string }) {
    return <div style={{ color: "var(--gray-8)", fontSize: 11 }}>{text}</div>;
}

function MiniMap() {
    // console.log("[render] MiniMap");
    useSignals();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const tileMap = tileMapStore.tileMap.value;
    const viewport = editorStore.viewport.value;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !tileMap) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Draw tiles
        for (let y = 0; y < tileMap.height; y++) {
            for (let x = 0; x < tileMap.width; x++) {
                const tile = tileMap.tiles[y * tileMap.width + x];
                ctx.fillStyle = tile ? "#8B4513" : "#87CEEB";
                ctx.fillRect(x, y, 1, 1);
            }
        }

        // Draw viewport rectangle
        if (viewport) {
            const TILE_SIZE = 32;
            const vx = viewport.x / TILE_SIZE;
            const vy = viewport.y / TILE_SIZE;
            const vw = viewport.w / TILE_SIZE;
            const vh = viewport.h / TILE_SIZE;

            ctx.strokeStyle = "red";
            ctx.lineWidth = 0.5;
            ctx.strokeRect(vx, vy, vw, vh);
        }
    }, [tileMap, viewport]);

    if (!tileMap) return null;

    const maxW = 216;
    const aspect = tileMap.width / tileMap.height;
    const w = aspect > 1 ? maxW : maxW * aspect;
    const h = aspect > 1 ? maxW / aspect : maxW;

    return (
        <canvas
            ref={canvasRef}
            width={tileMap.width}
            height={tileMap.height}
            style={{
                width: w,
                height: h,
                imageRendering: "pixelated",
                border: "1px solid var(--gray-a5)",
                borderRadius: 2,
            }}
        />
    );
}
