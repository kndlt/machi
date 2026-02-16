import { useEffect, useRef, useState } from "react";
import { Application, Graphics, Container, FederatedPointerEvent } from "pixi.js";
import { tileMapStore } from "../states/tileMapStore";
import type { Tile } from "../models/Tile";

const TILE_SIZE = 32;
const TILE_COLORS = {
    dirt: 0x8B4513,
    air: 0x87CEEB,
};

type Tool = 'pencil' | 'bucket';

export function Scene() {
    const canvasRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const worldContainerRef = useRef<Container | null>(null);
    const tileContainerRef = useRef<Container | null>(null);
    
    // Camera
    const cameraRef = useRef({ x: 0, y: 0, zoom: 1, targetX: 0, targetY: 0, targetZoom: 1 });
    
    // Interaction
    const [tool, setTool] = useState<Tool>('pencil');
    const toolRef = useRef<Tool>('pencil');
    const isPanningRef = useRef(false);
    const isPaintingRef = useRef(false);
    const lastPaintedTileRef = useRef<number | null>(null);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const spaceKeyRef = useRef(false);

    useEffect(() => {
        toolRef.current = tool;
    }, [tool]);

    // Flood fill algorithm
    const floodFill = (startX: number, startY: number) => {
        const tileMap = tileMapStore.tileMap.value;
        if (!tileMap) return;

        const startIndex = startY * tileMap.width + startX;
        const targetTile = tileMap.tiles[startIndex];
        const fillTile: Tile = { matter: "dirt" };
        
        // Don't fill if already the same
        if (targetTile?.matter === fillTile.matter) return;
        
        const visited = new Set<number>();
        const queue: [number, number][] = [[startX, startY]];
        
        while (queue.length > 0) {
            const [x, y] = queue.shift()!;
            const index = y * tileMap.width + x;
            
            if (x < 0 || x >= tileMap.width || y < 0 || y >= tileMap.height) continue;
            if (visited.has(index)) continue;
            
            const currentTile = tileMap.tiles[index];
            const matches = targetTile === null 
                ? currentTile === null 
                : currentTile?.matter === targetTile?.matter;
            
            if (!matches) continue;
            
            visited.add(index);
            tileMap.tiles[index] = fillTile;
            
            queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        
        tileMapStore.tileMap.value = { ...tileMap };
    };

    useEffect(() => {
        if (!canvasRef.current) return;

        let app: Application;
        let worldContainer: Container;
        let tileContainer: Container;
        let tileGraphics: Graphics[] = [];

        const init = async () => {
            app = new Application();
            await app.init({
                width: window.innerWidth,
                height: window.innerHeight,
                backgroundColor: 0x2d2d2d,
                antialias: false,
            });

            canvasRef.current!.appendChild(app.canvas);
            appRef.current = app;

            worldContainer = new Container();
            app.stage.addChild(worldContainer);
            worldContainerRef.current = worldContainer;

            tileContainer = new Container();
            worldContainer.addChild(tileContainer);
            tileContainerRef.current = tileContainer;

            // Center camera
            const tileMap = tileMapStore.tileMap.value;
            if (tileMap) {
                cameraRef.current.x = (tileMap.width * TILE_SIZE) / 2 - window.innerWidth / 2;
                cameraRef.current.y = (tileMap.height * TILE_SIZE) / 2 - window.innerHeight / 2;
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
                    graphics.stroke({ width: 0.5, color: 0x000000, alpha: 0.2 });

                    tileContainer.addChild(graphics);
                    tileGraphics.push(graphics);
                }
            }
        };

        const handleTileClick = (worldX: number, worldY: number) => {
            const tileMap = tileMapStore.tileMap.value;
            if (!tileMap) return;

            const tileX = Math.floor(worldX / TILE_SIZE);
            const tileY = Math.floor(worldY / TILE_SIZE);
            
            if (tileX < 0 || tileX >= tileMap.width || tileY < 0 || tileY >= tileMap.height) return;

            if (toolRef.current === 'bucket') {
                floodFill(tileX, tileY);
                renderTiles();
            } else {
                const index = tileY * tileMap.width + tileX;
                if (index !== lastPaintedTileRef.current) {
                    lastPaintedTileRef.current = index;
                    tileMap.tiles[index] = tileMap.tiles[index] ? null : { matter: "dirt" };
                    tileMapStore.tileMap.value = { ...tileMap };
                    renderTiles();
                }
            }
        };

        const setupInteraction = () => {
            app.stage.eventMode = 'static';
            app.stage.hitArea = app.screen;

            app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
                if (e.button !== 0) return;

                if (spaceKeyRef.current) {
                    isPanningRef.current = true;
                    lastMouseRef.current = { x: e.global.x, y: e.global.y };
                    app.canvas.style.cursor = 'grabbing';
                } else {
                    isPaintingRef.current = true;
                    lastPaintedTileRef.current = null;
                    const worldPos = worldContainer.toLocal(e.global);
                    handleTileClick(worldPos.x, worldPos.y);
                }
            });

            app.stage.on('pointermove', (e: FederatedPointerEvent) => {
                if (isPanningRef.current) {
                    const dx = e.global.x - lastMouseRef.current.x;
                    const dy = e.global.y - lastMouseRef.current.y;
                    const camera = cameraRef.current;
                    camera.targetX -= dx / camera.zoom;
                    camera.targetY -= dy / camera.zoom;
                    lastMouseRef.current = { x: e.global.x, y: e.global.y };
                } else if (isPaintingRef.current && toolRef.current === 'pencil') {
                    const worldPos = worldContainer.toLocal(e.global);
                    handleTileClick(worldPos.x, worldPos.y);
                }
            });

            app.stage.on('pointerup', () => {
                isPanningRef.current = false;
                isPaintingRef.current = false;
                lastPaintedTileRef.current = null;
                updateCursor();
            });

            app.stage.on('pointerupoutside', () => {
                isPanningRef.current = false;
                isPaintingRef.current = false;
                lastPaintedTileRef.current = null;
                updateCursor();
            });

            // Zoom
            app.canvas.addEventListener('wheel', (e: WheelEvent) => {
                e.preventDefault();
                const camera = cameraRef.current;
                const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
                camera.targetZoom = Math.max(0.25, Math.min(4, camera.targetZoom * zoomDelta));
            });

            // Spacebar panning
            window.addEventListener('keydown', (e) => {
                if (e.code === 'Space' && !spaceKeyRef.current) {
                    e.preventDefault();
                    spaceKeyRef.current = true;
                    updateCursor();
                }
            });

            window.addEventListener('keyup', (e) => {
                if (e.code === 'Space') {
                    e.preventDefault();
                    spaceKeyRef.current = false;
                    isPanningRef.current = false;
                    updateCursor();
                }
            });

            updateCursor();
        };

        const updateCursor = () => {
            if (!app.canvas) return;
            if (spaceKeyRef.current) {
                app.canvas.style.cursor = isPanningRef.current ? 'grabbing' : 'grab';
            } else {
                app.canvas.style.cursor = toolRef.current === 'pencil' ? 'crosshair' : 'pointer';
            }
        };

        const startCameraLoop = () => {
            const loop = () => {
                const camera = cameraRef.current;
                
                if (!worldContainerRef.current) return;
                
                // Smooth interpolation
                camera.x += (camera.targetX - camera.x) * 0.15;
                camera.y += (camera.targetY - camera.y) * 0.15;
                camera.zoom += (camera.targetZoom - camera.zoom) * 0.15;
                
                worldContainerRef.current.position.set(-camera.x * camera.zoom, -camera.y * camera.zoom);
                worldContainerRef.current.scale.set(camera.zoom);
                
                requestAnimationFrame(loop);
            };
            loop();
        };

        init();

        return () => {
            worldContainerRef.current = null;
            tileContainerRef.current = null;
            appRef.current?.destroy(true);
            appRef.current = null;
        };
    }, []);

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative' }}>
            {/* Left Tool Panel */}
            <div style={{
                width: 60,
                backgroundColor: '#1e1e1e',
                borderRight: '1px solid #3e3e3e',
                display: 'flex',
                flexDirection: 'column',
                padding: '8px 4px',
                gap: 4,
                zIndex: 10,
            }}>
                <ToolButton 
                    icon="✏️" 
                    label="Pencil" 
                    active={tool === 'pencil'} 
                    onClick={() => setTool('pencil')} 
                />
                <ToolButton 
                    icon="🪣" 
                    label="Bucket" 
                    active={tool === 'bucket'} 
                    onClick={() => setTool('bucket')} 
                />
            </div>

            {/* Canvas */}
            <div ref={canvasRef} style={{ flex: 1, overflow: 'hidden' }} />

            {/* Right Navigator Panel */}
            <div style={{
                width: 200,
                backgroundColor: '#1e1e1e',
                borderLeft: '1px solid #3e3e3e',
                padding: 12,
                zIndex: 10,
            }}>
                <div style={{ color: '#ccc', fontSize: 12, marginBottom: 8, fontWeight: 600 }}>
                    NAVIGATOR
                </div>
                <MiniMap />
                <div style={{ color: '#888', fontSize: 11, marginTop: 12 }}>
                    <div>Zoom: {Math.round(cameraRef.current.zoom * 100)}%</div>
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #3e3e3e' }}>
                        <strong style={{ color: '#aaa' }}>Controls:</strong>
                        <div>Space + Drag: Pan</div>
                        <div>Scroll: Zoom</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ToolButton({ icon, label, active, onClick }: { 
    icon: string; 
    label: string; 
    active: boolean; 
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            style={{
                width: 52,
                height: 52,
                backgroundColor: active ? '#094771' : '#2d2d2d',
                border: active ? '1px solid #0e639c' : '1px solid #3e3e3e',
                borderRadius: 4,
                fontSize: 24,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.1s',
            }}
            onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = '#383838';
            }}
            onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = '#2d2d2d';
            }}
        >
            {icon}
        </button>
    );
}

function MiniMap() {
    const tileMap = tileMapStore.tileMap.value;
    if (!tileMap) return null;

    const maxSize = 176;
    const aspectRatio = tileMap.width / tileMap.height;
    const width = aspectRatio > 1 ? maxSize : maxSize * aspectRatio;
    const height = aspectRatio > 1 ? maxSize / aspectRatio : maxSize;

    return (
        <div style={{
            width,
            height,
            backgroundColor: '#3e3e3e',
            border: '1px solid #555',
            position: 'relative',
        }}>
            <canvas
                width={tileMap.width}
                height={tileMap.height}
                style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
                ref={(canvas) => {
                    if (!canvas) return;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;

                    for (let y = 0; y < tileMap.height; y++) {
                        for (let x = 0; x < tileMap.width; x++) {
                            const tile = tileMap.tiles[y * tileMap.width + x];
                            ctx.fillStyle = tile ? '#8B4513' : '#87CEEB';
                            ctx.fillRect(x, y, 1, 1);
                        }
                    }
                }}
            />
        </div>
    );
}
