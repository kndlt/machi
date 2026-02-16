import { useEffect, useRef } from "react";
import { Application, Graphics, Container, FederatedPointerEvent } from "pixi.js";
import { tileMapStore } from "../states/tileMapStore";
import { editorStore } from "../states/editorStore";
import { autosave, saveFile } from "../states/persistence";
import type { Tile } from "../models/Tile";

const TILE_SIZE = 8;
const RENDER_SCALE = 2;
const ZOOM_STOPS = [
    0.125, 1/6, 0.25, 1/3, 0.5, 2/3, 1, 2, 3, 4,
];
const TILE_COLORS: Record<string, number> = {
    dirt: 0x8B4513,
    water: 0x1E90FF,
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
        let gridContainer: Container;
        let gridNormal: Graphics;
        let gridThick: Graphics;
        let tileGraphics: Graphics[] = [];
        let resizeObserverRef: ResizeObserver | null = null;
        let unsubscribe: (() => void) | null = null;
        let onKeyDown: ((e: KeyboardEvent) => void) | null = null;
        let onKeyUp: ((e: KeyboardEvent) => void) | null = null;
        let onWheel: ((e: WheelEvent) => void) | null = null;
        let onContextMenu: ((e: Event) => void) | null = null;
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

            gridContainer = new Container();
            worldContainer.addChild(gridContainer);

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

            // Re-render when the tileMap signal changes (e.g. New, Open, undo/redo)
            unsubscribe = tileMapStore.tileMap.subscribe((tm) => {
                if (!tm) return;
                renderTiles();
            });

            // Resize renderer buffer when the container changes size
            const resizeObserver = new ResizeObserver((entries) => {
                const entry = entries[0];
                if (!entry || !app?.renderer) return;
                const w = entry.contentRect.width;
                const h = entry.contentRect.height;
                if (w > 0 && h > 0) {
                    app.renderer.resize(w * RENDER_SCALE, h * RENDER_SCALE);
                }
            });
            resizeObserver.observe(el);
            resizeObserverRef = resizeObserver;
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
                    const color = tile ? (TILE_COLORS[tile.matter] ?? 0xFF00FF) : TILE_COLORS.air;

                    graphics.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    graphics.fill(color);

                    tileContainer.addChild(graphics);
                    tileGraphics.push(graphics);
                }
            }

            // Render grid lines in a separate container (two layers: normal + thick)
            gridContainer.removeChildren();

            const buildGrid = (strokeWidth: number) => {
                const g = new Graphics();
                g.setStrokeStyle({ width: strokeWidth, color: 0x000000, alpha: 0.2 });
                for (let y = 0; y <= tileMap.height; y++) {
                    g.moveTo(0, y * TILE_SIZE);
                    g.lineTo(tileMap.width * TILE_SIZE, y * TILE_SIZE);
                }
                for (let x = 0; x <= tileMap.width; x++) {
                    g.moveTo(x * TILE_SIZE, 0);
                    g.lineTo(x * TILE_SIZE, tileMap.height * TILE_SIZE);
                }
                g.stroke();
                return g;
            };

            gridNormal = buildGrid(1.0);
            gridThick = buildGrid(2.0);
            gridNormal.visible = false;
            gridThick.visible = false;
            gridContainer.addChild(gridNormal);
            gridContainer.addChild(gridThick);
        };

        /** Repaint a single tile graphic in-place (no destroy/recreate). */
        const updateTileGraphic = (index: number) => {
            const tileMap = tileMapStore.tileMap.value;
            if (!tileMap) return;
            const g = tileGraphics[index];
            if (!g) return;
            const tile = tileMap.tiles[index];
            const color = tile ? (TILE_COLORS[tile.matter] ?? 0xFF00FF) : TILE_COLORS.air;
            const x = index % tileMap.width;
            const y = Math.floor(index / tileMap.width);
            g.clear();
            g.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            g.fill(color);
        };

        /** Bresenham line from (x0,y0) to (x1,y1) — returns all tile coords along the path. */
        const bresenhamLine = (x0: number, y0: number, x1: number, y1: number): [number, number][] => {
            const points: [number, number][] = [];
            const dx = Math.abs(x1 - x0);
            const dy = -Math.abs(y1 - y0);
            const sx = x0 < x1 ? 1 : -1;
            const sy = y0 < y1 ? 1 : -1;
            let err = dx + dy;
            let cx = x0, cy = y0;
            while (true) {
                points.push([cx, cy]);
                if (cx === x1 && cy === y1) break;
                const e2 = 2 * err;
                if (e2 >= dy) { err += dy; cx += sx; }
                if (e2 <= dx) { err += dx; cy += sy; }
            }
            return points;
        };

        // --- Tile editing helpers ------------------------------------------

        const floodFill = (startX: number, startY: number) => {
            const tileMap = tileMapStore.tileMap.value;
            if (!tileMap) return;

            const startIndex = startY * tileMap.width + startX;
            const targetTile = tileMap.tiles[startIndex];
            const matter = editorStore.activeMatter.value;
            const fillValue: Tile | null = matter ? { matter } : null;

            // Skip if the target is already the fill value
            const targetMatter = targetTile?.matter ?? null;
            const fillMatter = fillValue?.matter ?? null;
            if (targetMatter === fillMatter) return;

            const visited = new Set<number>();
            const queue: [number, number][] = [[startX, startY]];
            let head = 0;

            while (head < queue.length) {
                const [x, y] = queue[head++];
                const index = y * tileMap.width + x;
                if (x < 0 || x >= tileMap.width || y < 0 || y >= tileMap.height) continue;
                if (visited.has(index)) continue;

                const cur = tileMap.tiles[index];
                const matches = targetTile === null ? cur === null : cur?.matter === targetTile?.matter;
                if (!matches) continue;

                visited.add(index);
                tileMap.tiles[index] = fillValue;
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
            } else if (tool === "pencil" || tool === "eraser") {
                if (index !== lastPaintedTileRef.current) {
                    const matter = editorStore.activeMatter.value;
                    const newTile: Tile | null = matter ? { matter } : null;

                    // Interpolate from last painted tile to current tile
                    const lastIdx = lastPaintedTileRef.current;
                    if (lastIdx !== null) {
                        const lastX = lastIdx % tileMap.width;
                        const lastY = Math.floor(lastIdx / tileMap.width);
                        const line = bresenhamLine(lastX, lastY, tileX, tileY);
                        for (const [lx, ly] of line) {
                            const li = ly * tileMap.width + lx;
                            if (li !== lastIdx) {
                                tileMap.tiles[li] = newTile;
                                updateTileGraphic(li);
                            }
                        }
                    } else {
                        tileMap.tiles[index] = newTile;
                        updateTileGraphic(index);
                    }

                    lastPaintedTileRef.current = index;
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
            onContextMenu = (e) => e.preventDefault();
            app.canvas.addEventListener("contextmenu", onContextMenu);

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
                    // Reassign signal so persistence / React subscribers update
                    const tm = tileMapStore.tileMap.value;
                    if (tm) tileMapStore.tileMap.value = { ...tm };
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
            onWheel = (e: WheelEvent) => {
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
                    const newZoom = Math.max(0.125, Math.min(4, camera.targetZoom * zoomDelta));

                    // Adjust camera so the same world point stays under the cursor
                    camera.targetX = worldXBefore - cursorX / newZoom;
                    camera.targetY = worldYBefore - cursorY / newZoom;
                    camera.targetZoom = newZoom;
                } else {
                    // Two-finger scroll → pan
                    camera.targetX += e.deltaX / camera.zoom;
                    camera.targetY += e.deltaY / camera.zoom;
                }
            };
            app.canvas.addEventListener("wheel", onWheel, { passive: false });

            // Keyboard shortcuts
            onKeyDown = (e: KeyboardEvent) => {
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
                if (!e.metaKey && !e.ctrlKey) {
                    if (e.code === "KeyP") editorStore.activeTool.value = "pencil";
                    if (e.code === "KeyE") editorStore.activeTool.value = "eraser";
                    if (e.code === "KeyG") editorStore.activeTool.value = "bucket";
                }
                // Cmd+S → save (auto-save named, or prompt Save As for unnamed)
                if (e.code === "KeyS" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                    e.preventDefault();
                    if (tileMapStore.currentFileId.value) {
                        const tm = tileMapStore.tileMap.value;
                        if (tm) {
                            autosave(tm);
                            saveFile(tm, tileMapStore.currentFileId.value!);
                        }
                    } else {
                        editorStore.activeDialog.value = "saveAs";
                    }
                }
                // Cmd+Shift+S → Save As
                if (e.code === "KeyS" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
                    e.preventDefault();
                    editorStore.activeDialog.value = "saveAs";
                }
                // Cmd+O → Open file browser
                if (e.code === "KeyO" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    editorStore.activeDialog.value = "fileBrowser";
                }
                // Cmd+0 → fit entire map in canvas
                if (e.code === "Digit0" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    const camera = cameraRef.current;
                    const canvas = canvasRef.current;
                    const tm = tileMapStore.tileMap.value;
                    if (!canvas || !tm) return;
                    const rect = canvas.getBoundingClientRect();
                    const mapW = tm.width * TILE_SIZE;
                    const mapH = tm.height * TILE_SIZE;
                    const padding = 16; // px breathing room
                    const zoom = Math.min(
                        (rect.width - padding * 2) / mapW,
                        (rect.height - padding * 2) / mapH,
                    );
                    camera.targetZoom = Math.max(0.125, Math.min(4, zoom));
                    // Center the map
                    camera.targetX = (mapW - rect.width / camera.targetZoom) / 2;
                    camera.targetY = (mapH - rect.height / camera.targetZoom) / 2;
                }
                // Cmd+= / Cmd+- → snap to next/prev Photoshop-style zoom stop
                if ((e.code === "Equal" || e.code === "Minus") && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    const camera = cameraRef.current;
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    const rect = canvas.getBoundingClientRect();
                    const cx = rect.width / 2;
                    const cy = rect.height / 2;
                    const worldXBefore = camera.targetX + cx / camera.targetZoom;
                    const worldYBefore = camera.targetY + cy / camera.targetZoom;

                    const cur = camera.targetZoom;
                    let newZoom = cur;
                    const eps = 0.001;
                    if (e.code === "Equal") {
                        // zoom in → next stop above current
                        for (let i = 0; i < ZOOM_STOPS.length; i++) {
                            if (ZOOM_STOPS[i] > cur + eps) { newZoom = ZOOM_STOPS[i]; break; }
                        }
                    } else {
                        // zoom out → next stop below current
                        for (let i = ZOOM_STOPS.length - 1; i >= 0; i--) {
                            if (ZOOM_STOPS[i] < cur - eps) { newZoom = ZOOM_STOPS[i]; break; }
                        }
                    }

                    camera.targetX = worldXBefore - cx / newZoom;
                    camera.targetY = worldYBefore - cy / newZoom;
                    camera.targetZoom = newZoom;
                }
            };
            onKeyUp = (e: KeyboardEvent) => {
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

                const dx = camera.targetX - camera.x;
                const dy = camera.targetY - camera.y;
                const dz = camera.targetZoom - camera.zoom;
                camera.x += Math.abs(dx) < 0.01 ? dx : dx * 0.15;
                camera.y += Math.abs(dy) < 0.01 ? dy : dy * 0.15;
                camera.zoom += Math.abs(dz) < 0.0001 ? dz : dz * 0.15;

                clampCamera();

                worldContainerRef.current.position.set(
                    Math.round(-camera.x * camera.zoom),
                    Math.round(-camera.y * camera.zoom),
                );
                worldContainerRef.current.scale.set(camera.zoom);

                // Toggle grid: thick stroke at 0.25–0.5, normal at >=0.5, hidden below 0.25
                gridContainer.visible = camera.zoom >= 0.24;
                gridNormal.visible = camera.zoom >= 0.5;
                gridThick.visible = camera.zoom >= 0.24 && camera.zoom < 0.5;

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
            unsubscribe?.();
            resizeObserverRef?.disconnect();
            if (onKeyDown) window.removeEventListener("keydown", onKeyDown);
            if (onKeyUp) window.removeEventListener("keyup", onKeyUp);
            if (appRef.current?.canvas) {
                if (onWheel) appRef.current.canvas.removeEventListener("wheel", onWheel);
                if (onContextMenu) appRef.current.canvas.removeEventListener("contextmenu", onContextMenu);
            }
            worldContainerRef.current = null;
            tileContainerRef.current = null;
            appRef.current?.destroy(true);
            appRef.current = null;
        };
    }, []);

    return <div ref={canvasRef} style={{ width: "100%", height: "100%", overflow: "hidden" }} />;
}
