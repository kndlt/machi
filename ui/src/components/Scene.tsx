import { useEffect, useRef } from "react";
import { Application, Graphics, Container, FederatedPointerEvent } from "pixi.js";
import { tileMapStore } from "../states/tileMapStore";
import type { Tile } from "../models/Tile";

const TILE_SIZE = 32;
const TILE_COLORS = {
    dirt: 0x8B4513,  // Brown
    air: 0x87CEEB,   // Sky blue
};

export function Scene() {
    const canvasRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const worldContainerRef = useRef<Container | null>(null);
    const tileContainerRef = useRef<Container | null>(null);
    const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
    const isDraggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (!canvasRef.current) return;

        let app: Application;
        let worldContainer: Container;
        let tileContainer: Container;
        let tileGraphics: Graphics[] = [];

        const initPixi = async () => {
            // Create PixiJS application
            app = new Application();
            await app.init({
                width: window.innerWidth,
                height: window.innerHeight,
                backgroundColor: 0x1a1a1a,
                antialias: false,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
            });

            canvasRef.current!.appendChild(app.canvas);
            appRef.current = app;

            // Create world container (affected by camera)
            worldContainer = new Container();
            app.stage.addChild(worldContainer);
            worldContainerRef.current = worldContainer;

            // Create tile container
            tileContainer = new Container();
            worldContainer.addChild(tileContainer);
            tileContainerRef.current = tileContainer;

            // Center camera on world
            const tileMap = tileMapStore.tileMap.value;
            if (tileMap) {
                cameraRef.current.x = -(tileMap.width * TILE_SIZE) / 2 + window.innerWidth / 2;
                cameraRef.current.y = -(tileMap.height * TILE_SIZE) / 2 + window.innerHeight / 2;
                updateCamera();
            }

            // Render initial tiles
            renderTiles();

            // Set up interaction
            app.stage.eventMode = 'static';
            app.stage.hitArea = app.screen;

            // Mouse drag for panning
            app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
                isDraggingRef.current = true;
                lastMouseRef.current = { x: e.global.x, y: e.global.y };
            });

            app.stage.on('pointermove', (e: FederatedPointerEvent) => {
                if (isDraggingRef.current) {
                    const dx = e.global.x - lastMouseRef.current.x;
                    const dy = e.global.y - lastMouseRef.current.y;
                    cameraRef.current.x += dx;
                    cameraRef.current.y += dy;
                    updateCamera();
                    lastMouseRef.current = { x: e.global.x, y: e.global.y };
                }
            });

            app.stage.on('pointerup', () => {
                isDraggingRef.current = false;
            });

            app.stage.on('pointerupoutside', () => {
                isDraggingRef.current = false;
            });

            // Mouse wheel for zoom
            app.canvas.addEventListener('wheel', (e: WheelEvent) => {
                e.preventDefault();
                const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
                cameraRef.current.zoom = Math.max(0.1, Math.min(5, cameraRef.current.zoom * zoomDelta));
                updateCamera();
            });

            // Click to place tiles
            app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
                if (e.button === 0) { // Left click
                    const worldPos = worldContainer.toLocal(e.global);
                    const tileX = Math.floor(worldPos.x / TILE_SIZE);
                    const tileY = Math.floor(worldPos.y / TILE_SIZE);
                    
                    const tileMap = tileMapStore.tileMap.value;
                    if (tileMap && tileX >= 0 && tileX < tileMap.width && tileY >= 0 && tileY < tileMap.height) {
                        const index = tileY * tileMap.width + tileX;
                        // Toggle tile
                        const newTile: Tile | null = tileMap.tiles[index] ? null : { matter: "dirt" };
                        tileMap.tiles[index] = newTile;
                        tileMapStore.tileMap.value = { ...tileMap };
                        renderTiles();
                    }
                }
            });

            // Window resize
            const handleResize = () => {
                app.renderer.resize(window.innerWidth, window.innerHeight);
            };
            window.addEventListener('resize', handleResize);

            return () => {
                window.removeEventListener('resize', handleResize);
            };
        };

        const updateCamera = () => {
            if (worldContainerRef.current) {
                const { x, y, zoom } = cameraRef.current;
                worldContainerRef.current.position.set(x, y);
                worldContainerRef.current.scale.set(zoom, zoom);
            }
        };

        const renderTiles = () => {
            const tileMap = tileMapStore.tileMap.value;
            if (!tileMap || !tileContainer) return;

            // Clear existing tiles
            tileGraphics.forEach(g => g.destroy());
            tileGraphics = [];
            tileContainer.removeChildren();

            // Render tiles
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

        initPixi();

        return () => {
            if (appRef.current) {
                appRef.current.destroy(true, { children: true });
                appRef.current = null;
            }
        };
    }, []);

    return (
        <div 
            ref={canvasRef} 
            style={{ 
                width: '100%', 
                height: '100%',
                overflow: 'hidden',
                cursor: isDraggingRef.current ? 'grabbing' : 'grab'
            }} 
        />
    );
}