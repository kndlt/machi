import { useEffect, useRef } from "react";
import { Application, Graphics, Container, FederatedPointerEvent } from "pixi.js";
import { tileMapStore } from "../states/tileMapStore";
import { editorStore } from "../states/editorStore";
import type { Tile } from "../models/Tile";

const TILE_SIZE = 32;
const RENDER_SCALE = 2;
const TILE_COLORS = {
    dirt: 0x8B4513,
    air: 0x87CEEB,
};

export function Scene() {
    const canvasRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const worldContainerRef = useRef<Container | null>(null);
    const tileContainerRef = useRef<Container | null>(null);

    // Camera state
    const cameraRef = useRef({ x: 0, y: 0, zoom: 1, targetX: 0, targetY: 0, targetZoom: 1 });
    const isPanningRef = useRef(false);
    const isPaintingRef = useRef(false);
    const lastPaintedTileRef = useRef<number | null>(null);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const spaceKeyRef = useRef(false);
    const strokeSnapshotRef = useRef<Array<Tile | null> | undefined>(undefined);

    useEffect(() => {
        if (!canvasRef.current) return;

        let app: Application;
        let worldContainer: Container;
        let tileContainer: Container;
        let tileGraphics: Graphics[] = [];
        let destroyed = false;

        const init = async () => {
            app = new Application();
            const el = canvasRef.current!;
            await app.init({
                width: el.clientWidth * RENDER_SCALE,
                height: el.clientHeight * RENDER_SCALE,
                backgroundColor: 0x2d2d2d,
                antialias: false,
                resolution: 1,          // we manage the scaling ourselves
                autoDensity: false,
            });

            if (destroyed) { app.destroy(true); return; }

            // Size the canvas element to fill the container via CSS, keeping the 2x backing buffer
            app.canvas.style.width = "100%";
            app.canvas.style.height = "100%";

            el.appendChild(app.canvas);
            appRef.current = app;

            // The stage itself works in 2x space, so scale everything up
            app.stage.scale.set(RENDER_SCALE);

            worldContainer = new Container();
            app.stage.addChild(worldContainer);
            worldContainerRef.current = worldContainer;

            tileContainer = new Container();
            worldContainer.addChild(tileContainer);
            tileContainerRef.current = tileContainer;

            // Center camera on tile map
            const tileMap = tileMapStore.tileMap.value;
            if (tileMap) {
                const canvasW = canvasRef.current!.clientWidth;
                const canvasH = canvasRef.current!.clientHeight;
                cameraRef.current.x = (tileMap.width * TILE_SIZE) / 2 - canvasW / 2;
                cameraRef.current.y = (tileMap.height * TILE_SIZE) / 2 - canvasH / 2;
                cameraRef.current.targetX = cameraRef.current.x;
                cameraRef.current.targetY = cameraRef.current.y;
            }

            renderTiles();
            setupInteraction();
            startCameraLoop();
        };

        const renderTiles = () => {
            const tileMap = tileMapStore.tileMap.value;
            if (!tileMap || !tileContainer) return;

            tileGraphics.forEach(g => g.destroy());
            tileGraphics = [];
            tileContainer.removeChildren();

            for (let y = 0; y < tileMap.height; y++) {
                for (let x = 0; x < tileMap.width; x++) {
                    const index = y * tileMap.width + x;
                    const tile = tileMap.tiles[index];
                    const graphics = new Graphics();
                    const color = tile ? TILE_COLORS[tile.matter] : TILE_COLORS.air;

                    graphics.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    graphics.fill(color);
                    graphics.stroke({ width: 1.0, color: 0x000000, alpha: 0.2 });

                    tileContainer.addChild(graphics);
                    tileGraphics.push(graphics);
                }
            }
        };

        // --- Tile editing helpers ------------------------------------------

        const floodFill = (startX: number, startY: number) => {
            const tileMap = tileMapStore.tileMap.value;
            if (!tileMap) return;

            const startIndex = startY * tileMap.width + startX;
            const targetTile = tileMap.tiles[startIndex];
            const fillTile: Tile = { matter: "dirt" };
            if (targetTile?.matter === fillTile.matter) return;

            const visited = new Set<number>();
            const queue: [number, number][] = [[startX, startY]];

            while (queue.length > 0) {
                const [x, y] = queue.shift()!;
                const index = y * tileMap.width + x;
                if (x < 0 || x >= tileMap.width || y < 0 || y >= tileMap.height) continue;
                if (visited.has(index)) continue;

                const cur = tileMap.tiles[index];
                const matches = targetTile === null ? cur === null : cur?.matter === targetTile?.matter;
                if (!matches) continue;

                visited.add(index);
                tileMap.tiles[index] = fillTile;
                queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
            }

            tileMapStore.tileMap.value = { ...tileMap };
        };

        const handleTileAction = (worldX: number, worldY: number) => {
            const tileMap = tileMapStore.tileMap.value;
            if (!tileMap) return;

            const tileX = Math.floor(worldX / TILE_SIZE);
            const tileY = Math.floor(worldY / TILE_SIZE);
            if (tileX < 0 || tileX >= tileMap.width || tileY < 0 || tileY >= tileMap.height) return;

            const tool = editorStore.activeTool.value;
            const index = tileY * tileMap.width + tileX;

            if (tool === "bucket") {
                floodFill(tileX, tileY);
                renderTiles();
            } else if (tool === "pencil") {
                if (index !== lastPaintedTileRef.current) {
                    lastPaintedTileRef.current = index;
                    tileMap.tiles[index] = { matter: "dirt" };
                    tileMapStore.tileMap.value = { ...tileMap };
                    renderTiles();
                }
            } else if (tool === "eraser") {
                if (index !== lastPaintedTileRef.current) {
                    lastPaintedTileRef.current = index;
                    tileMap.tiles[index] = null;
                    tileMapStore.tileMap.value = { ...tileMap };
                    renderTiles();
                }
            }
        };

        // --- Interaction ---------------------------------------------------

        const updateCursor = () => {
            if (!app?.canvas) return;
            if (spaceKeyRef.current) {
                app.canvas.style.cursor = isPanningRef.current ? "grabbing" : "grab";
            } else {
                const tool = editorStore.activeTool.value;
                app.canvas.style.cursor = tool === "bucket" ? "pointer" : "crosshair";
            }
        };

        const setupInteraction = () => {
            app.stage.eventMode = "static";
            app.stage.hitArea = app.screen;

            // Prevent context menu on right-click so we can use it for panning
            app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

            app.stage.on("pointerdown", (e: FederatedPointerEvent) => {
                if (spaceKeyRef.current || e.button === 1 || e.button === 2) {
                    isPanningRef.current = true;
                    lastMouseRef.current = { x: e.global.x, y: e.global.y };
                    app.canvas.style.cursor = "grabbing";
                } else if (e.button === 0) {
                    // Snapshot tiles before this stroke for undo
                    strokeSnapshotRef.current = tileMapStore.snapshotTiles();
                    isPaintingRef.current = true;
                    lastPaintedTileRef.current = null;
                    const worldPos = worldContainer.toLocal(e.global);
                    handleTileAction(worldPos.x, worldPos.y);
                }
            });

            app.stage.on("pointermove", (e: FederatedPointerEvent) => {
                // Update hovered tile for Inspector
                const worldPos = worldContainer.toLocal(e.global);
                const tileMap = tileMapStore.tileMap.value;
                if (tileMap) {
                    const tx = Math.floor(worldPos.x / TILE_SIZE);
                    const ty = Math.floor(worldPos.y / TILE_SIZE);
                    if (tx >= 0 && tx < tileMap.width && ty >= 0 && ty < tileMap.height) {
                        editorStore.hoveredTile.value = { x: tx, y: ty };
                    } else {
                        editorStore.hoveredTile.value = null;
                    }
                }

                if (isPanningRef.current) {
                    const dx = e.global.x - lastMouseRef.current.x;
                    const dy = e.global.y - lastMouseRef.current.y;
                    const camera = cameraRef.current;
                    camera.targetX -= dx / camera.zoom;
                    camera.targetY -= dy / camera.zoom;
                    lastMouseRef.current = { x: e.global.x, y: e.global.y };
                } else if (isPaintingRef.current) {
                    const tool = editorStore.activeTool.value;
                    if (tool === "pencil" || tool === "eraser") {
                        handleTileAction(worldPos.x, worldPos.y);
                    }
                }
            });

            const stopPan = () => {
                // If we were painting, commit the stroke to undo history
                if (isPaintingRef.current && strokeSnapshotRef.current) {
                    tileMapStore.pushUndo(strokeSnapshotRef.current);
                    strokeSnapshotRef.current = undefined;
                }
                isPanningRef.current = false;
                isPaintingRef.current = false;
                lastPaintedTileRef.current = null;
                updateCursor();
            };
            app.stage.on("pointerup", stopPan);
            app.stage.on("pointerupoutside", stopPan);

            // Two-finger scroll → pan, pinch-to-zoom (Ctrl+wheel) → zoom around cursor
            app.canvas.addEventListener("wheel", (e: WheelEvent) => {
                e.preventDefault();
                const camera = cameraRef.current;
                if (e.ctrlKey || e.metaKey) {
                    // Pinch-to-zoom on trackpad (or Ctrl+scroll)
                    // Zoom toward the cursor position so the point under the finger stays fixed
                    const rect = app.canvas.getBoundingClientRect();
                    const cursorX = e.clientX - rect.left;
                    const cursorY = e.clientY - rect.top;

                    // World position under the cursor before zoom
                    const worldXBefore = camera.targetX + cursorX / camera.targetZoom;
                    const worldYBefore = camera.targetY + cursorY / camera.targetZoom;

                    const zoomDelta = e.deltaY > 0 ? 0.95 : 1.05;
                    const newZoom = Math.max(0.25, Math.min(4, camera.targetZoom * zoomDelta));

                    // Adjust camera so the same world point stays under the cursor
                    camera.targetX = worldXBefore - cursorX / newZoom;
                    camera.targetY = worldYBefore - cursorY / newZoom;
                    camera.targetZoom = newZoom;
                } else {
                    // Two-finger scroll → pan
                    camera.targetX += e.deltaX / camera.zoom;
                    camera.targetY += e.deltaY / camera.zoom;
                }
            });

            // Keyboard shortcuts
            const onKeyDown = (e: KeyboardEvent) => {
                if (e.code === "Space" && !spaceKeyRef.current) {
                    e.preventDefault();
                    spaceKeyRef.current = true;
                    updateCursor();
                }
                // Undo: Cmd+Z (Mac) / Ctrl+Z
                if (e.code === "KeyZ" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                    e.preventDefault();
                    tileMapStore.undo();
                    renderTiles();
                }
                // Redo: Cmd+Shift+Z / Ctrl+Shift+Z  or  Cmd+Y / Ctrl+Y
                if (
                    (e.code === "KeyZ" && (e.metaKey || e.ctrlKey) && e.shiftKey) ||
                    (e.code === "KeyY" && (e.metaKey || e.ctrlKey))
                ) {
                    e.preventDefault();
                    tileMapStore.redo();
                    renderTiles();
                }
                // Tool hotkeys
                if (e.code === "KeyP") editorStore.activeTool.value = "pencil";
                if (e.code === "KeyE") editorStore.activeTool.value = "eraser";
                if (e.code === "KeyG") editorStore.activeTool.value = "bucket";
                // Cmd+0 → reset zoom to 100%
                if (e.code === "Digit0" && (e.metaKey || e.ctrlKey)) {
                    cameraRef.current.targetZoom = 1;
                }
            };
            const onKeyUp = (e: KeyboardEvent) => {
                if (e.code === "Space") {
                    e.preventDefault();
                    spaceKeyRef.current = false;
                    isPanningRef.current = false;
                    updateCursor();
                }
            };
            window.addEventListener("keydown", onKeyDown);
            window.addEventListener("keyup", onKeyUp);
        };

        const startCameraLoop = () => {
            /** Clamp camera so the tile map is always at least partially visible. */
            const clampCamera = () => {
                const tileMap = tileMapStore.tileMap.value;
                if (!tileMap || !canvasRef.current) return;

                const cw = canvasRef.current.clientWidth;
                const ch = canvasRef.current.clientHeight;
                const camera = cameraRef.current;
                const viewW = cw / camera.zoom;
                const viewH = ch / camera.zoom;
                const mapW = tileMap.width * TILE_SIZE;
                const mapH = tileMap.height * TILE_SIZE;

                // Camera x/y is the world-space top-left of the viewport.
                // Allow panning until the viewport just barely touches the map edge.
                const minX = -viewW + TILE_SIZE;
                const maxX = mapW - TILE_SIZE;
                const minY = -viewH + TILE_SIZE;
                const maxY = mapH - TILE_SIZE;

                camera.targetX = Math.max(minX, Math.min(maxX, camera.targetX));
                camera.targetY = Math.max(minY, Math.min(maxY, camera.targetY));
                camera.x = Math.max(minX, Math.min(maxX, camera.x));
                camera.y = Math.max(minY, Math.min(maxY, camera.y));
            };

            const loop = () => {
                if (destroyed) return;
                const camera = cameraRef.current;
                if (!worldContainerRef.current) return;

                camera.x += (camera.targetX - camera.x) * 0.15;
                camera.y += (camera.targetY - camera.y) * 0.15;
                camera.zoom += (camera.targetZoom - camera.zoom) * 0.15;

                clampCamera();

                worldContainerRef.current.position.set(
                    Math.round(-camera.x * camera.zoom),
                    Math.round(-camera.y * camera.zoom),
                );
                worldContainerRef.current.scale.set(camera.zoom);

                // Publish viewport for minimap
                const cw = canvasRef.current?.clientWidth ?? 0;
                const ch = canvasRef.current?.clientHeight ?? 0;
                editorStore.viewport.value = {
                    x: camera.x,
                    y: camera.y,
                    w: cw / camera.zoom,
                    h: ch / camera.zoom,
                };
                editorStore.zoom.value = camera.zoom;

                requestAnimationFrame(loop);
            };
            loop();
        };

        init();

        return () => {
            destroyed = true;
            worldContainerRef.current = null;
            tileContainerRef.current = null;
            appRef.current?.destroy(true);
            appRef.current = null;
        };
    }, []);

    return <div ref={canvasRef} style={{ width: "100%", height: "100%", overflow: "hidden" }} />;
}
