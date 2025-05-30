// Game coordinator using WASM worker and Pixi.js rendering

// Class to handle WASM worker communication
class GameWorker {
    constructor() {
        this.worker = new Worker('./wasm-worker.js', { type: 'module' });
        this.messageId = 0;
        this.pendingMessages = new Map();
        this.onGameStateUpdate = null;
        
        this.worker.onmessage = (e) => {
            const { type, id, result, error, data, timestamp } = e.data;
            
            // Handle game state updates (no ID required)
            if (type === 'game_state_update') {
                if (this.onGameStateUpdate) {
                    this.onGameStateUpdate(data, timestamp);
                }
                return;
            }
            
            // Handle request/response messages
            const pending = this.pendingMessages.get(id);
            if (pending) {
                this.pendingMessages.delete(id);
                if (type === 'success') {
                    pending.resolve(result);
                } else {
                    pending.reject(new Error(error));
                }
            }
        };
    }
    
    async callFunction(type, data = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.messageId;
            this.pendingMessages.set(id, { resolve, reject });
            
            this.worker.postMessage({ type, data, id });
        });
    }
    
    // Send message without expecting response
    sendMessage(type, data = {}) {
        this.worker.postMessage({ type, data });
    }
    
    terminate() {
        this.worker.terminate();
    }
}

// Game class that manages Pixi.js rendering and game state
class Game {
    constructor() {
        this.app = null;
        this.worker = null;
        this.promiserSprites = new Map();
        this.promiserStates = new Map(); // Track previous states to avoid unnecessary redraws
        this.thoughtBubbles = new Map();
        this.container = null;
        this.uiContainer = null;
        this.tileMapContainer = null; // Container for tile map rendering
        this.isRunning = false;
        this.aiCoordinator = null;
        this.tileMapCreated = false; // Track if tile map has been created
        this.currentTileMap = null; // Store current tile map data for comparison
        this.tileGraphics = new Map(); // Store tile graphics for hover effects
        
        // Tile selection UI
        this.tileSelectionUI = null; // Container for tile selection panel
        this.selectedTileType = 'Dirt'; // Currently selected tile type
        this.tileTypes = ['Dirt', 'Stone', 'Water', 'Air']; // Available tile types
        this.tileButtons = []; // Store tile selection buttons
        this.tileColors = {
            'Dirt': 0x8B4513,
            'Stone': 0x696969,
            'Water': 0x1E90FF,
            'Air': 0x87CEEB
        };
        this.tilePlacementMode = false; // Whether we're in tile placement mode
        
        // Tile hover preview
        this.hoverPreviewTile = null; // Preview tile that follows mouse cursor
        this.mouseWorldX = 0; // Current mouse world X position
        this.mouseWorldY = 0; // Current mouse world Y position
        
        // Game settings
        this.worldWidthTiles = 25;   // Width in tiles 
        this.worldHeightTiles = 19;  // Height in tiles
        this.tileSize = 32;          // Size of each tile in pixels
        this.worldWidth = this.worldWidthTiles * this.tileSize;   // Total width in pixels
        this.worldHeight = this.worldHeightTiles * this.tileSize; // Total height in pixels
        
        // Camera system
        this.camera = {
            x: 0,
            y: 0,
            targetX: 0,
            targetY: 0,
            zoom: 1,
            targetZoom: 1,
            minZoom: 0.5,
            maxZoom: 3,
            speed: 1, // Smooth movement factor (0-1)
            zoomSpeed: 1 // Smooth zoom factor (0-1)
        };
        
        // Camera controls
        this.cameraKeys = {
            w: false,
            a: false,
            s: false,
            d: false
        };
        
        // Mouse/drag controls
        this.mouseControls = {
            isDragging: false,
            lastMouseX: 0,
            lastMouseY: 0,
            dragSensitivity: 1
        };
        
        // Camera movement speed (pixels per frame when key is held)
        this.cameraSpeed = 3;
        
        // World container that contains all game objects (affected by camera)
        this.worldContainer = null;
        
        this.lightSystem = {
            enabled: true,
            debugMode: true,
            photonSprites: new Map(),
            lightContainer: null
        };
    }
    
    async init() {
        console.log('🎮 Initializing game...');
        
        // Create Pixi.js application with fullscreen canvas
        this.app = new window.PIXI.Application();
        await this.app.init({
            width: window.innerWidth,
            height: window.innerHeight,
            backgroundColor: 0x87CEEB, // Sky blue background for air tiles
            antialias: false,              // Turn off antialiasing for pixel perfect rendering
            resolution: 1,  // Use device pixel ratio for crisp rendering
            autoDensity: true,             // Automatically adjust for high DPI displays
            roundPixels: true,             // Round pixel positions to integers
            resizeTo: window
        });
        
        // Replace loading content with game canvas
        const gameContainer = document.getElementById('gameContainer');
        const loadingDiv = gameContainer.querySelector('.loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }
        
        // Style the game container for fullscreen
        gameContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            margin: 0;
            padding: 0;
            overflow: hidden;
        `;
        
        // Style the canvas for fullscreen
        this.app.canvas.style.cssText = `
            display: block;
            position: absolute;
            top: 0;
            left: 0;
        `;
        
        gameContainer.appendChild(this.app.canvas);
        
        // Create world container that will be affected by camera movement
        this.worldContainer = new window.PIXI.Container();
        this.app.stage.addChild(this.worldContainer);
        
        // Create container for tile map (in world space)
        this.tileMapContainer = new window.PIXI.Container();
        this.worldContainer.addChild(this.tileMapContainer);
        
        // Create container for promisers (in world space)
        this.container = new window.PIXI.Container();
        this.worldContainer.addChild(this.container);
        
        // Create container for UI elements (thought bubbles, etc.) - in screen space, not affected by camera
        this.uiContainer = new window.PIXI.Container();
        this.app.stage.addChild(this.uiContainer);

        // Create tile selection UI
        this.createTileSelectionUI();
        
        // Create hover preview tile
        this.createHoverPreviewTile();
        
        // Set initial visibility for tile selection UI
        this.updateTileSelectionUIVisibility();

        // Initialize camera controls
        this.initCameraControls();
        
        // Add window resize handler
        window.addEventListener('resize', () => {
            this.app.renderer.resize(window.innerWidth, window.innerHeight);
        });
        
        // Center camera on the tile map
        const tileMapCenterX = (this.worldWidthTiles * this.tileSize) / 2;
        const tileMapCenterY = (this.worldHeightTiles * this.tileSize) / 2;
        this.camera.x = tileMapCenterX - window.innerWidth / 2;
        this.camera.y = -tileMapCenterY - window.innerHeight / 2;
        this.camera.targetX = this.camera.x;
        this.camera.targetY = this.camera.y;
        
        // Start camera update loop
        this.startCameraUpdate();

        // Initialize worker
        this.worker = new GameWorker();
        this.worker.onGameStateUpdate = (data, timestamp) => {
            this.updateRender(data, timestamp);
        };
        
        // Add UI controls
        this.createUI();
        
        // Auto-start the game
        await this.startGame();
        
        // Create light system container
        this.createLightSystem();
        
        console.log('🎮 Game initialized');
    }
    
    initCameraControls() {
        // Set up keyboard event listeners for camera controls
        document.addEventListener('keydown', (event) => {
            // Skip if HUD is visible and user might be typing
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') {
                return;
            }
            
            const key = event.key.toLowerCase();
            
            // Toggle tile placement mode with 'T' key
            if (key === 't') {
                event.preventDefault();
                this.tilePlacementMode = !this.tilePlacementMode;
                console.log(`🎨 Tile placement mode: ${this.tilePlacementMode ? 'ON' : 'OFF'}`);
                this.updateTileSelectionUIVisibility();
                return;
            }
            
            if (key in this.cameraKeys) {
                event.preventDefault();
                this.cameraKeys[key] = true;
            }
            
            // Toggle light system (L) and photon debug (P)
            if (key === 'l') {
                event.preventDefault();
                this.lightSystem.enabled = !this.lightSystem.enabled;
                console.log(`💡 Light system ${this.lightSystem.enabled ? 'ENABLED' : 'DISABLED'}`);
                return;
            }

            if (key === 'p') {
                event.preventDefault();
                this.lightSystem.debugMode = !this.lightSystem.debugMode;
                console.log(`🔦 Photon debug ${this.lightSystem.debugMode ? 'ON' : 'OFF'}`);
                return;
            }
        });
        
        document.addEventListener('keyup', (event) => {
            const key = event.key.toLowerCase();
            if (key in this.cameraKeys) {
                event.preventDefault();
                this.cameraKeys[key] = false;
            }
        });

        // Set up mouse controls for dragging
        this.app.canvas.addEventListener('mousedown', (event) => {
            if (event.button === 0) { // Left mouse button
                if (this.tilePlacementMode) {
                    // Handle tile placement when in tile placement mode
                    event.preventDefault();
                    this.placeTileAtPosition(this.mouseWorldX, this.mouseWorldY);
                } else {
                    // Start camera dragging when not in tile placement mode
                    this.mouseControls.isDragging = true;
                    this.mouseControls.lastMouseX = event.clientX;
                    this.mouseControls.lastMouseY = event.clientY;
                    this.app.canvas.style.cursor = 'grabbing';
                    event.preventDefault();
                }
            }
        });

        document.addEventListener('mousemove', (event) => {
            if (this.mouseControls.isDragging) {
                const deltaX = (event.clientX - this.mouseControls.lastMouseX) * this.mouseControls.dragSensitivity;
                const deltaY = (event.clientY - this.mouseControls.lastMouseY) * this.mouseControls.dragSensitivity;
                
                // Move camera in opposite direction to create dragging effect
                this.camera.targetX -= deltaX / this.camera.zoom;
                this.camera.targetY -= deltaY / this.camera.zoom;
                
                // Snap camera target to pixel grid immediately during drag
                this.camera.targetX = Math.round(this.camera.targetX);
                this.camera.targetY = Math.round(this.camera.targetY);
                
                this.mouseControls.lastMouseX = event.clientX;
                this.mouseControls.lastMouseY = event.clientY;
                event.preventDefault();
            }
            
            // Update mouse world coordinates for hover preview
            this.updateMouseWorldPosition(event);
        });

        document.addEventListener('mouseup', (event) => {
            if (event.button === 0) { // Left mouse button
                this.mouseControls.isDragging = false;
                this.app.canvas.style.cursor = 'grab';
                event.preventDefault();
            }
        });

        // Set up scroll wheel for zoom
        this.app.canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            
            const zoomDelta = event.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = this.camera.targetZoom * zoomDelta;
            
            // Clamp zoom within limits
            this.camera.targetZoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, newZoom));
            
            // Get mouse position relative to canvas
            const rect = this.app.canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            
            // Calculate world coordinates of mouse position before zoom
            const worldMouseX = (mouseX + this.camera.x) / this.camera.zoom;
            const worldMouseY = (mouseY + this.camera.y) / this.camera.zoom;
            
            // Adjust camera position to zoom towards mouse cursor
            const zoomRatio = this.camera.targetZoom / this.camera.zoom;
            this.camera.targetX = worldMouseX * this.camera.targetZoom - mouseX;
            this.camera.targetY = worldMouseY * this.camera.targetZoom - mouseY;
            
            // Snap camera target to pixel grid after zoom
            this.camera.targetX = Math.round(this.camera.targetX);
            this.camera.targetY = Math.round(this.camera.targetY);
        });

        // Set initial cursor style
        this.app.canvas.style.cursor = 'grab';
        
        // Add mouse enter/leave handlers for hover preview
        this.app.canvas.addEventListener('mouseenter', (event) => {
            this.updateMouseWorldPosition(event);
        });
        
        this.app.canvas.addEventListener('mouseleave', () => {
            // Hide hover preview when mouse leaves canvas
            if (this.hoverPreviewTile) {
                this.hoverPreviewTile.visible = false;
            }
        });
        
        console.log('🎥 Camera controls initialized (WASD to move, drag to pan, scroll to zoom)');
    }
    
    updateMouseWorldPosition(event) {
        // Get mouse position relative to canvas
        const rect = this.app.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        
        // Convert screen coordinates to world coordinates
        this.mouseWorldX = (mouseX + this.camera.x) / this.camera.zoom;
        this.mouseWorldY = (mouseY + this.camera.y) / this.camera.zoom;
        
        // Update hover preview tile position
        this.updateHoverPreviewTile();
    }
    
    startCameraUpdate() {
        // Camera update loop
        const updateCamera = () => {
            this.updateCameraMovement();
            this.updateCameraPosition();
            requestAnimationFrame(updateCamera);
        };
        updateCamera();
    }
    
    updateCameraMovement() {
        // Update target position based on key presses
        // Adjust movement speed based on zoom level (move faster when zoomed out)
        const adjustedSpeed = this.cameraSpeed / this.camera.zoom;
        
        if (this.cameraKeys.w) {
            this.camera.targetY -= adjustedSpeed;
        }
        if (this.cameraKeys.s) {
            this.camera.targetY += adjustedSpeed;
        }
        if (this.cameraKeys.a) {
            this.camera.targetX -= adjustedSpeed;
        }
        if (this.cameraKeys.d) {
            this.camera.targetX += adjustedSpeed;
        }
        
        // Snap camera target to pixel grid
        this.camera.targetX = Math.round(this.camera.targetX);
        this.camera.targetY = Math.round(this.camera.targetY);
    }
    
    updateCameraPosition() {
        // Smooth camera movement towards target
        const deltaX = this.camera.targetX - this.camera.x;
        const deltaY = this.camera.targetY - this.camera.y;
        const deltaZoom = this.camera.targetZoom - this.camera.zoom;
        
        this.camera.x += deltaX * this.camera.speed;
        this.camera.y += deltaY * this.camera.speed;
        this.camera.zoom += deltaZoom * this.camera.zoomSpeed;
        
        // Snap camera position to pixel grid
        this.camera.x = Math.round(this.camera.x);
        this.camera.y = Math.round(this.camera.y);
        
        // Apply camera position and zoom to world container
        this.worldContainer.x = -this.camera.x;
        this.worldContainer.y = -this.camera.y;
        this.worldContainer.scale.set(this.camera.zoom);
    }
    
    createUI() {
        const controls = document.createElement('div');
        controls.id = 'gameControls';
        controls.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 15px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            z-index: 1000;
            transition: opacity 0.3s ease;
        `;
        
        controls.innerHTML = `
            <h3 style="margin: 0 0 10px 0;">Promiser Game</h3>
            <button id="startGame">Start Game</button>
            <button id="stopGame">Stop Game</button>
            <button id="addPromiser">Add Promiser</button>
            <div style="margin-top: 10px;">
                <label style="font-size: 12px;">AI Coordinator:</label>
                <select id="aiSelector" style="margin-left: 5px; background: #333; color: white; border: 1px solid #555;">
                    <option value="openai">OpenAI</option>
                    <option value="ollama">Ollama (Local)</option>
                    <option value="test">Test AI</option>
                </select>
            </div>
            <div style="margin-top: 10px; font-size: 11px; color: #aaa;">
                <strong>Controls:</strong><br>
                ESC - Toggle HUD<br>
                WASD - Move Camera<br>
                Drag - Pan Camera<br>
                Scroll - Zoom In/Out<br>
                T - Toggle Tile Placement Mode<br>
                <span style="color: #ff6;">Click tiles to place selected type</span>
            </div>
            <div id="status" style="margin-top: 10px; font-size: 12px;">Ready to start</div>
        `;
        
        document.body.appendChild(controls);
        
        // Add event listeners
        document.getElementById('startGame').onclick = () => this.startGame();
        document.getElementById('stopGame').onclick = () => this.stopGame();
        document.getElementById('addPromiser').onclick = () => this.addPromiser();
        
        // HUD toggle functionality - start hidden by default
        let hudVisible = false;
        
        // Hide HUD by default
        controls.style.opacity = '0';
        controls.style.pointerEvents = 'none';
        
        const toggleHUD = () => {
            hudVisible = !hudVisible;
            if (hudVisible) {
                controls.style.opacity = '1';
                controls.style.pointerEvents = 'auto';
            } else {
                controls.style.opacity = '0';
                controls.style.pointerEvents = 'none';
            }
        };
        
        // ESC key toggle
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                toggleHUD();
            }
        });
        
        // Debug button to test thought bubbles
        const debugButton = document.createElement('button');
        debugButton.textContent = 'Test Bubble';
        debugButton.onclick = () => this.testThoughtBubble();
        debugButton.style.marginLeft = '5px';
        controls.appendChild(debugButton);
        
        // Set up AI selector
        const aiSelector = document.getElementById('aiSelector');
        aiSelector.value = this.getSelectedAIType();
        aiSelector.onchange = (e) => this.setAIType(e.target.value);
    }
    
    createTileSelectionUI() {
        // Create tile selection panel container
        this.tileSelectionUI = new window.PIXI.Container();
        
        // Panel background
        const panelBg = new window.PIXI.Graphics();
        panelBg.roundRect(0, 0, 300, 60, 8);
        panelBg.fill({ color: 0x000000, alpha: 0.8 });
        panelBg.stroke({ color: 0x555555, width: 2 });
        this.tileSelectionUI.addChild(panelBg);
        
        // Panel title
        const titleText = new window.PIXI.Text({
            text: 'Tile Selection (Press T to toggle placement)',
            style: {
                fontSize: 12,
                fill: 0xFFFFFF,
                fontFamily: 'Arial'
            }
        });
        titleText.x = 10;
        titleText.y = 8;
        this.tileSelectionUI.addChild(titleText);
        
        // Create tile buttons
        this.tileButtons = [];
        this.tileTypes.forEach((tileType, index) => {
            const buttonContainer = new window.PIXI.Container();
            buttonContainer.x = 10 + (index * 65);
            buttonContainer.y = 25;
            
            // Button background
            const buttonBg = new window.PIXI.Graphics();
            buttonBg.roundRect(0, 0, 60, 30, 4);
            buttonBg.fill({ color: this.tileColors[tileType], alpha: 0.8 });
            buttonBg.stroke({ color: tileType === this.selectedTileType ? 0xFFFFFF : 0x888888, width: 2 });
            
            // Button text
            const buttonText = new window.PIXI.Text({
                text: tileType,
                style: {
                    fontSize: 10,
                    fill: 0xFFFFFF,
                    fontFamily: 'Arial',
                    align: 'center'
                }
            });
            buttonText.anchor.set(0.5, 0.5);
            buttonText.x = 30;
            buttonText.y = 15;
            
            // Make button interactive
            buttonContainer.eventMode = 'static';
            buttonContainer.cursor = 'pointer';
            
            // Store tile type reference
            buttonContainer.tileType = tileType;
            buttonContainer.buttonBg = buttonBg;
            
            // Button click handler
            buttonContainer.on('pointerdown', () => {
                this.selectTileType(tileType);
            });
            
            // Hover effects
            buttonContainer.on('pointerover', () => {
                buttonBg.tint = 0xCCCCCC;
            });
            
            buttonContainer.on('pointerout', () => {
                buttonBg.tint = 0xFFFFFF;
            });
            
            buttonContainer.addChild(buttonBg);
            buttonContainer.addChild(buttonText);
            this.tileSelectionUI.addChild(buttonContainer);
            this.tileButtons.push(buttonContainer);
        });
        
        // Position panel at top center of screen
        this.tileSelectionUI.x = (window.innerWidth - 300) / 2;
        this.tileSelectionUI.y = 10;
        
        // Add to UI container
        this.uiContainer.addChild(this.tileSelectionUI);
        
        console.log('🎨 Tile selection UI created');
    }
    
    createHoverPreviewTile() {
        // Create hover preview tile that follows mouse cursor in tile placement mode
        this.hoverPreviewTile = new window.PIXI.Graphics();
        this.hoverPreviewTile.visible = false; // Hidden by default
        
        // Add to world container so it moves with camera
        this.worldContainer.addChild(this.hoverPreviewTile);
        
        console.log('🎨 Hover preview tile created');
    }
    
    updateHoverPreviewTile() {
        if (!this.hoverPreviewTile) return;
        
        if (this.tilePlacementMode && this.selectedTileType) {
            // Convert mouse world position to tile coordinates
            const tileX = Math.floor(this.mouseWorldX / this.tileSize);
            const tileY = Math.floor(-this.mouseWorldY / this.tileSize);
            console.log(tileX, tileY);
            
            // Check if position is within tile map bounds
            if (tileX >= 0 && tileX < this.worldWidthTiles && 
                tileY >= 0 && tileY < this.worldHeightTiles) {
                
                // Show and update the preview tile
                this.hoverPreviewTile.visible = true;
                
                // Clear and redraw preview tile
                this.hoverPreviewTile.clear();
                
                if (this.selectedTileType !== 'Air') {
                    // Get color for the selected tile type
                    const previewColor = this.tileColors[this.selectedTileType];
                    
                    // Draw the preview tile with semi-transparent color
                    this.hoverPreviewTile.rect(0, 0, this.tileSize, this.tileSize);
                    this.hoverPreviewTile.fill({ color: previewColor, alpha: 0.6 });
                    
                    // Add a border to make it more visible
                    this.hoverPreviewTile.stroke({ color: 0xFFFFFF, width: 2, alpha: 0.8 });
                } else {
                    // For Air tiles, show a dashed border outline
                    this.hoverPreviewTile.rect(0, 0, this.tileSize, this.tileSize);
                    this.hoverPreviewTile.stroke({ color: 0xFF0000, width: 2, alpha: 0.8 });
                    
                    // Draw diagonal lines to indicate "removal"
                    this.hoverPreviewTile.moveTo(0, 0);
                    this.hoverPreviewTile.lineTo(this.tileSize, this.tileSize);
                    this.hoverPreviewTile.moveTo(this.tileSize, 0);
                    this.hoverPreviewTile.lineTo(0, this.tileSize);
                    this.hoverPreviewTile.stroke({ color: 0xFF0000, width: 1, alpha: 0.6 });
                }
                
                // Position the preview tile at the correct world coordinates
                this.hoverPreviewTile.x = tileX * this.tileSize;
                this.hoverPreviewTile.y = -(tileY + 1) * this.tileSize;
            } else {
                // Hide preview if cursor is outside tile map bounds
                this.hoverPreviewTile.visible = false;
            }
        } else {
            // Hide preview if not in tile placement mode
            this.hoverPreviewTile.visible = false;
        }
    }
    
    selectTileType(tileType) {
        this.selectedTileType = tileType;
        console.log(`🎨 Selected tile type: ${tileType}`);
        
        // Update button appearances
        this.tileButtons.forEach(button => {
            const isSelected = button.tileType === tileType;
            button.buttonBg.stroke({ 
                color: isSelected ? 0xFFFFFF : 0x888888, 
                width: isSelected ? 3 : 2 
            });
        });
        
        // Update hover preview tile with new selection
        this.updateHoverPreviewTile();
    }
    
    updateTileSelectionUIVisibility() {
        if (this.tileSelectionUI) {
            this.tileSelectionUI.visible = this.tilePlacementMode;
            
            // Update cursor style based on placement mode
            if (this.tilePlacementMode) {
                document.body.style.cursor = 'crosshair';
            } else {
                document.body.style.cursor = 'default';
            }
        }
        
        // Update hover preview tile visibility
        this.updateHoverPreviewTile();
    }

    placeTileAtPosition(worldX, worldY) {
        console.log(`🎨 Placing tile at world position (${worldX}, ${worldY})`);
        // Convert world position to tile coordinates
        const tileX = Math.floor(worldX / this.tileSize);
        const tileY = Math.floor(-worldY / this.tileSize);
        console.log(`!!!Tile coordinates: (${tileX}, ${tileY})`);
        
        // Check if position is within tile map bounds
        if (tileX >= 0 && tileX < this.worldWidthTiles && 
            tileY >= 0 && tileY < this.worldHeightTiles) {
            
            console.log(`🎨 Placing ${this.selectedTileType} tile at (${tileX}, ${tileY})`);
            
            // Send tile placement to worker
            if (this.worker) {
                this.worker.callFunction('place_tile', {
                    x: tileX,
                    y: tileY,
                    tileType: this.selectedTileType
                }).then(() => {
                    console.log(`🎨 Successfully placed ${this.selectedTileType} tile at (${tileX}, ${tileY})`);
                }).catch(error => {
                    console.error('🎨 Error placing tile:', error);
                });
            }
            
            // For immediate visual feedback, update the tile graphic if it exists
            const tileKey = `${tileX},${tileY}`;
            const tileGraphic = this.tileGraphics.get(tileKey);
            
            if (this.selectedTileType === 'Air') {
                // If placing air, remove the existing graphic
                if (tileGraphic) {
                    this.tileMapContainer.removeChild(tileGraphic);
                    this.tileGraphics.delete(tileKey);
                }
            } else {
                // For non-air tiles, update or create the graphic
                if (tileGraphic) {
                    const newColor = this.tileColors[this.selectedTileType];
                    tileGraphic.tileData.type = this.selectedTileType;
                    tileGraphic.tileData.baseColor = newColor;
                    
                    // Redraw the tile with new color
                    tileGraphic.clear();
                    tileGraphic.rect(0, 0, this.tileSize, this.tileSize);
                    tileGraphic.fill({ color: newColor, alpha: 1.0 });
                } else {
                    // Create new graphic for non-air tile placed on air
                    const newColor = this.tileColors[this.selectedTileType];
                    const newTileGraphic = new window.PIXI.Graphics();
                    newTileGraphic.rect(0, 0, this.tileSize, this.tileSize);
                    newTileGraphic.fill({ color: newColor, alpha: 1.0 });
                    
                    // Make tile interactive for hover effects
                    newTileGraphic.eventMode = 'static';
                    newTileGraphic.cursor = 'pointer';
                    
                    // Store tile data for hover effects
                    newTileGraphic.tileData = {
                        x: tileX,
                        y: tileY,
                        type: this.selectedTileType,
                        baseColor: newColor
                    };
                    
                    // Add hover event listeners
                    newTileGraphic.on('pointerover', () => {
                        this.onTileHover(newTileGraphic, true);
                    });
                    
                    newTileGraphic.on('pointerout', () => {
                        this.onTileHover(newTileGraphic, false);
                    });
                    
                    // Position the tile directly
                    newTileGraphic.x = tileX * this.tileSize;
                    newTileGraphic.y = -(tileY + 1) * this.tileSize;
                    
                    // Store reference for hover management
                    this.tileGraphics.set(tileKey, newTileGraphic);
                    
                    // Add to tile map container
                    this.tileMapContainer.addChild(newTileGraphic);
                }
            }
        }
    }

    // ...existing code...
    
    updateStatus(message) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = message;
        }
    }
    
    async startGame() {
        if (this.isRunning) return;
        
        console.log('🎮 Starting game...');
        this.updateStatus('Starting game...');
        
        try {
            const result = await this.worker.callFunction('start_game', {
                worldWidth: this.worldWidthTiles,
                worldHeight: this.worldHeightTiles
            });
            
            this.isRunning = true;
            this.updateStatus('Game running - Promisers are moving!');
            console.log('🎮 Game started:', result);
            
            // Start AI coordinator
            this.connectAICoordinator();
            
        } catch (error) {
            console.error('🎮 Failed to start game:', error);
            this.updateStatus('Failed to start game');
        }
    }
    
    async stopGame() {
        if (!this.isRunning) return;
        
        console.log('🎮 Stopping game...');
        this.updateStatus('Stopping game...');
        
        try {
            const result = await this.worker.callFunction('stop_game');
            
            this.isRunning = false;
            this.updateStatus('Game stopped');
            console.log('🎮 Game stopped:', result);
            
            // Stop AI coordinator
            this.disconnectAICoordinator();
            
            // Clear all sprites
            this.clearSprites();
            
        } catch (error) {
            console.error('🎮 Failed to stop game:', error);
            this.updateStatus('Failed to stop game');
        }
    }
    
    async addPromiser() {
        if (!this.isRunning) return;
        
        try {
            const result = await this.worker.callFunction('add_promiser');
            console.log('🎮 Added promiser, total count:', result.count);
            this.updateStatus(`Game running - ${result.count} promisers`);
            
        } catch (error) {
            console.error('🎮 Failed to add promiser:', error);
        }
    }
    
    connectAICoordinator() {
        if (this.aiCoordinator) {
            this.aiCoordinator.close();
        }
        
        console.log('🤖 Connecting to AI coordinator...');
        
        // Get the selected AI coordinator type from the UI or default to ollama
        const aiType = this.getSelectedAIType();
        console.log(`🤖 Using AI coordinator type: ${aiType}`);
        
        // Get the promiser count for the coordinator
        const promiserCount = 20; // Default promiser count
        
        let endpoint;
        switch (aiType) {
            case 'ollama':
                endpoint = '/api/ollama-ai';
                break;
            case 'openai':
                endpoint = `/api/ai-coordinator?count=${promiserCount}`;
                break;
            case 'test':
            default:
                endpoint = `/api/test-ai?count=${promiserCount}`;
                break;
        }
        
        this.aiCoordinator = new EventSource(endpoint);
        
        this.aiCoordinator.onopen = () => {
            console.log('🤖 AI coordinator connected');
            this.updateStatus('AI coordinator connected - Promisers thinking...');
        };
        
        this.aiCoordinator.onmessage = (event) => {
            console.log('🤖 Raw event received:', event.data);
            try {
                const data = JSON.parse(event.data);
                console.log('🤖 Parsed event data:', data);
                this.handleAIAction(data);
            } catch (error) {
                console.error('🤖 Error parsing AI coordinator message:', error, event.data);
            }
        };
        
        this.aiCoordinator.onerror = (error) => {
            console.error('🤖 AI coordinator error:', error);
            this.updateStatus('AI coordinator connection error - retrying...');
            
            // Close the current connection
            if (this.aiCoordinator) {
                this.aiCoordinator.close();
                this.aiCoordinator = null;
            }
            
            // Reconnect after delay if game is still running
            setTimeout(() => {
                if (this.isRunning) {
                    console.log('🤖 Attempting to reconnect AI coordinator...');
                    this.connectAICoordinator();
                }
            }, 5000);
        };
    }
    
    getSelectedAIType() {
        // Check if there's a stored preference
        const stored = localStorage.getItem('machi-ai-type');
        if (stored) return stored;
        
        // Default based on environment - OpenAI for production/server, Ollama for local
        const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        return isProduction ? 'openai' : 'ollama';
    }
    
    setAIType(type) {
        localStorage.setItem('machi-ai-type', type);
        console.log(`🤖 AI type changed to: ${type}`);
        
        // Reconnect with new AI type
        this.connectAICoordinator();
        this.updateStatus(`Switched to ${type} AI coordinator`);
    }
    
    disconnectAICoordinator() {
        if (this.aiCoordinator) {
            console.log('🤖 Disconnecting AI coordinator...');
            this.aiCoordinator.close();
            this.aiCoordinator = null;
        }
    }
    
    async handleAIAction(data) {
        console.log('🤖 Received AI action:', data);
        
        if (data.type === 'connected') {
            console.log('🤖 AI coordinator connected:', data.message);
            this.updateStatus(data.message);
        } else if (data.type === 'ping') {
            // Just log pings quietly
            console.log('🤖 Ping received');
        } else if (data.type === 'ai_behavior') {
            // Handle Ollama AI coordinator events
            const { promiser_id, action, content } = data;
            
            console.log(`🤖 Promiser ${promiser_id} AI behavior: ${action} - "${content}"`);
            
            // Send command to WASM worker
            try {
                console.log(`🤖 Sending AI action to worker: ${action} for promiser ${promiser_id}`);
                switch (action) {
                    case 'think':
                        await this.worker.callFunction('make_promiser_think', { id: promiser_id });
                        console.log(`🤖 Sent think command for promiser ${promiser_id}`);
                        break;
                    case 'speak':
                        await this.worker.callFunction('make_promiser_speak', { id: promiser_id, thought: content });
                        console.log(`🤖 Sent speak command for promiser ${promiser_id}: "${content}"`);
                        break;
                    case 'whisper':
                        // For whisper, pick a random target
                        const targetId = Math.floor(Math.random() * 20);
                        await this.worker.callFunction('make_promiser_whisper', { id: promiser_id, thought: content, targetId });
                        console.log(`🤖 Sent whisper command for promiser ${promiser_id} to ${targetId}: "${content}"`);
                        break;
                    case 'run':
                        await this.worker.callFunction('make_promiser_run', { id: promiser_id });
                        console.log(`🤖 Sent run command for promiser ${promiser_id}`);
                        break;
                }
                
                // Show thought bubble for think, speak, and whisper actions
                if (action === 'think' || action === 'speak' || action === 'whisper') {
                    this.showThoughtBubble(promiser_id, content, action === 'whisper', action === 'think');
                }
                
            } catch (error) {
                console.error('🤖 Error sending AI action to worker:', error);
            }
        } else if (data.type === 'promiser_action') {
            // Handle test AI and OpenAI coordinator events (legacy format)
            const { promiserId, behavior, thought, targetId } = data;
            
            console.log(`🤖 Promiser ${promiserId} action: ${behavior} - "${thought}"`);
            
            // Send command to WASM worker
            try {
                console.log(`🤖 Sending AI action to worker: ${behavior} for promiser ${promiserId}`);
                switch (behavior) {
                    case 'think':
                        await this.worker.callFunction('make_promiser_think', { id: promiserId });
                        console.log(`🤖 Sent think command for promiser ${promiserId}`);
                        break;
                    case 'speak':
                        await this.worker.callFunction('make_promiser_speak', { id: promiserId, thought });
                        console.log(`🤖 Sent speak command for promiser ${promiserId}: "${thought}"`);
                        break;
                    case 'whisper':
                        await this.worker.callFunction('make_promiser_whisper', { id: promiserId, thought, targetId });
                        console.log(`🤖 Sent whisper command for promiser ${promiserId} to ${targetId}: "${thought}"`);
                        break;
                    case 'run':
                        await this.worker.callFunction('make_promiser_run', { id: promiserId });
                        console.log(`🤖 Sent run command for promiser ${promiserId}`);
                        break;
                }
                
                // Show thought bubble for think, speak, and whisper actions
                if (behavior === 'think' || behavior === 'speak' || behavior === 'whisper') {
                    this.showThoughtBubble(promiserId, thought, behavior === 'whisper', behavior === 'think');
                }
                
            } catch (error) {
                console.error('🤖 Error sending AI action to worker:', error);
            }
        } else if (data.type === 'error') {
            console.error('🤖 AI coordinator error:', data.message);
            this.updateStatus(`AI error: ${data.message}`);
        } else {
            console.log('🤖 Unknown AI action type:', data.type);
        }
    }
    
    testThoughtBubble() {
        console.log('🧪 Testing thought bubble...');
        // Get any random promiser that exists
        const promiserIds = Array.from(this.promiserSprites.keys());
        if (promiserIds.length > 0) {
            const testId = promiserIds[0];
            this.showThoughtBubble(testId, "Hmm...", false, true); // Test thought bubble
            console.log(`🧪 Created test thought bubble for promiser ${testId}`);
        } else {
            console.log('🧪 No promisers available for testing');
        }
    }
    
    showThoughtBubble(promiserId, thought, isWhisper = false, isThought = false) {
        console.log(`💭 Creating thought bubble for promiser ${promiserId}: "${thought}" (thought: ${isThought})`);
        
        // Remove existing thought bubble for this promiser
        this.removeThoughtBubble(promiserId);
        
        const sprite = this.promiserSprites.get(promiserId);
        if (!sprite) {
            console.log(`💭 No sprite found for promiser ${promiserId}`);
            return;
        }
        
        console.log(`💭 Sprite position: x=${sprite.x}, y=${sprite.y}`);
        
        // Create thought bubble container
        const bubbleContainer = new window.PIXI.Container();
        
        // Create bubble background with different styles for thoughts vs speech
        const bubble = new window.PIXI.Graphics();
        
        if (isThought) {
            // Understated thought style - just text with subtle background
            const thoughtAlpha = 0.3;
            bubble.roundRect(-35, -15, 70, 30, 8);
            bubble.fill({ color: 0x888888, alpha: thoughtAlpha });
            // No stroke for thoughts - more subtle
        } else {
            // Regular speech/whisper bubble
            const bubbleColor = isWhisper ? 0x444444 : 0xFFFFFF;
            const bubbleAlpha = isWhisper ? 0.9 : 0.95;
            bubble.roundRect(-40, -20, 80, 40, 6);
            bubble.fill({ color: bubbleColor, alpha: bubbleAlpha });
            bubble.stroke({ color: 0x000000, width: 3 });
        }
        
        // Create text with different styles for thoughts vs speech
        const text = new window.PIXI.Text({
            text: thought,
            style: {
                fontSize: isThought ? 9 : 11,
                fill: isThought ? 0xAAAAAA : (isWhisper ? 0xCCCCCC : 0x000000),
                alpha: isThought ? 0.7 : 1.0,
                align: 'center',
                wordWrap: true,
                wordWrapWidth: isThought ? 60 : 70,
                fontStyle: isThought ? 'italic' : 'normal'
            }
        });
        
        text.anchor.set(0.5, 0.5);
        text.x = 0;
        text.y = 0;
        
        bubbleContainer.addChild(bubble);
        bubbleContainer.addChild(text);
        
        // Convert world coordinates to screen coordinates for UI elements
        const screenX = sprite.x - this.camera.x;
        const screenY = sprite.y - this.camera.y - 40; // Position above the sprite
        
        bubbleContainer.x = screenX;
        bubbleContainer.y = screenY;
        
        console.log(`💭 Bubble container position: x=${bubbleContainer.x}, y=${bubbleContainer.y}`);
        
        this.uiContainer.addChild(bubbleContainer);
        this.thoughtBubbles.set(promiserId, bubbleContainer);
        
        console.log(`💭 Added thought bubble to UI container. Total bubbles: ${this.thoughtBubbles.size}`);
        
        // Ensure the UI container is on top
        this.app.stage.removeChild(this.uiContainer);
        this.app.stage.addChild(this.uiContainer);
        
        // Auto-remove after 3-5 seconds
        const duration = isWhisper ? 2000 : 4000;
        setTimeout(() => {
            console.log(`💭 Auto-removing thought bubble for promiser ${promiserId}`);
            this.removeThoughtBubble(promiserId);
        }, duration);
    }
    
    removeThoughtBubble(promiserId) {
        const bubble = this.thoughtBubbles.get(promiserId);
        if (bubble) {
            this.uiContainer.removeChild(bubble);
            this.thoughtBubbles.delete(promiserId);
        }
    }
    
    shouldRedrawSprite(promiser) {
        const previousState = this.promiserStates.get(promiser.id);
        
        // If no previous state, definitely need to draw
        if (!previousState) {
            return true;
        }
        
        // Check if any visual properties have changed
        return (
            previousState.state !== promiser.state ||
            previousState.color !== promiser.color ||
            previousState.size !== promiser.size
        );
    }
    
    updateSpriteAppearance(sprite, promiser) {
        // Clear and redraw the sprite with current state
        sprite.clear();
        
        // Different visual effects based on promiser state
        let effectColor = promiser.color & 0xFFFFFF;
        let effectAlpha = 1.0;
        
        switch (promiser.state) {
            case 1: // Thinking
                effectColor = 0xFFFF00; // Yellow glow
                effectAlpha = 0.8;
                break;
            case 2: // Speaking
                effectColor = 0x00FF00; // Green glow
                effectAlpha = 0.9;
                break;
            case 3: // Whispering
                effectColor = 0x8888FF; // Purple glow
                effectAlpha = 0.7;
                break;
            case 4: // Running
                effectColor = 0xFF4444; // Red glow
                effectAlpha = 1.0;
                // Add motion blur effect
                sprite.circle(0, 0, promiser.size + 2);
                sprite.fill({ color: effectColor, alpha: 0.3 });
                break;
        }
        
        // Draw main sprite
        sprite.circle(0, 0, promiser.size);
        sprite.fill({ color: promiser.color & 0xFFFFFF, alpha: effectAlpha });
        
        // Add special effect glow for active states
        if (promiser.state > 0) {
            sprite.circle(0, 0, promiser.size + 3);
            sprite.stroke({ color: effectColor, width: 2, alpha: 0.5 });
        }
    }
    
    updateRender(gameState, timestamp) {
        // Draw tile map if present (only once or when changed)
        if (gameState.tile_map && !this.tileMapCreated) {
            this.drawTileMap(gameState.tile_map);
            this.tileMapCreated = true;
            this.currentTileMap = gameState.tile_map;
        }
        
        // Update tile map for water simulation
        if (gameState.tile_map && this.tileMapCreated) {
            this.updateTileMap(gameState.tile_map);
        }
        
        // handle light system rendering
        if (this.lightSystem.enabled) {
            if (gameState.photons && this.lightSystem.debugMode) {
                this.renderPhotons(gameState.photons);
            }
            if (gameState.lightMap) {
                // Temporarily disabled brightness modulation until tuning values
                // this.updateTileBrightness(gameState.lightMap, gameState.tile_map.width);
            }
        }
        
        if (!gameState.promisers) return;
        
        // Update existing sprites and create new ones
        const currentIds = new Set();
        
        gameState.promisers.forEach(promiser => {
            currentIds.add(promiser.id);
            
            let sprite = this.promiserSprites.get(promiser.id);
            
            if (!sprite) {
                // Create new sprite
                sprite = new window.PIXI.Graphics();
                this.promiserSprites.set(promiser.id, sprite);
                this.container.addChild(sprite);
            }
            
            // Check if sprite needs redrawing
            if (this.shouldRedrawSprite(promiser)) {
                // Update sprite appearance based on state
                this.updateSpriteAppearance(sprite, promiser);
            }
            
            // Store current state for next frame comparison
            this.promiserStates.set(promiser.id, {
                state: promiser.state,
                color: promiser.color,
                size: promiser.size
            });
            
            sprite.x = promiser.x;
            sprite.y = -promiser.y;
            
            // Update thought bubble position if it exists (convert to screen coordinates)
            const bubble = this.thoughtBubbles.get(promiser.id);
            if (bubble) {
                const screenX = promiser.x - this.camera.x;
                const screenY = promiser.y - this.camera.y - promiser.size - 20;
                bubble.x = screenX;
                bubble.y = screenY;
            }
        });
        
        // Remove sprites for promisers that no longer exist
        for (const [id, sprite] of this.promiserSprites.entries()) {
            if (!currentIds.has(id)) {
                this.container.removeChild(sprite);
                this.promiserSprites.delete(id);
                this.promiserStates.delete(id); // Clean up stored state
                this.removeThoughtBubble(id);
            }
        }
    }
    
    drawTileMap(tileMap) {
        // Only create tiles once - this function should only be called when tile map changes
        if (this.tileMapCreated) {
            console.log('🗺️ Tile map already created, skipping recreation');
            return;
        }
        
        // Clear any existing tiles
        this.tileMapContainer.removeChildren();
        this.tileGraphics.clear(); // Clear tile graphics map
        
        console.log(`🗺️ Creating tile map: ${tileMap.width}x${tileMap.height} tiles, total: ${tileMap.tiles.length}`);
        
        // Create all tiles at once
        for (let y = 0; y < tileMap.height; y++) {
            for (let x = 0; x < tileMap.width; x++) {
                const idx = y * tileMap.width + x;
                const tile = tileMap.tiles[idx];
                
                // Skip rendering air tiles - they will show the sky background color
                if (tile.tile_type === 'Air') {
                    continue;
                }
                
                let color = 0xCCCCCC;
                
                // Improved tile colors with better visual appearance
                switch (tile.tile_type) {
                    case 'Dirt': color = 0x8B4513; break;  // Saddle brown - more natural dirt color
                    case 'Stone': color = 0x696969; break; // Dim gray - more realistic stone
                    case 'Water': color = 0x1E90FF; break; // Dodger blue - clearer water
                    default: color = 0xCCCCCC; break;      // Default gray for unknown types
                }
                
                // Create interactive tile graphic with hover effects
                const tileGraphic = new window.PIXI.Graphics();
                tileGraphic.rect(0, 0, this.tileSize, this.tileSize);
                tileGraphic.fill({ color, alpha: 1.0 }); // Full opacity for cleaner look
                
                // Make tile interactive for hover effects
                tileGraphic.eventMode = 'static';
                tileGraphic.cursor = 'pointer';
                
                // Store tile data for hover effects
                tileGraphic.tileData = {
                    x: x,
                    y: y,
                    type: tile.tile_type,
                    baseColor: color
                };
                
                // Add hover event listeners
                tileGraphic.on('pointerover', () => {
                    this.onTileHover(tileGraphic, true);
                });
                
                tileGraphic.on('pointerout', () => {
                    this.onTileHover(tileGraphic, false);
                });
                
                // Add click event listener for tile placement
                tileGraphic.on('pointerdown', (event) => {
                    if (this.tilePlacementMode) {
                        event.stopPropagation(); // Prevent camera panning
                        this.placeTileAtPosition(x * this.tileSize, -(y + 1) * this.tileSize);
                    }
                });
                
                // Position the tile directly
                tileGraphic.x = x * this.tileSize;
                tileGraphic.y = -(y + 1) * this.tileSize;
                
                // Store reference for hover management
                this.tileGraphics.set(`${x},${y}`, tileGraphic);
                
                // Add directly to tile map container
                this.tileMapContainer.addChild(tileGraphic);
            }
        }
        
        // Create red line at y=0 (world coordinates)
        const redLine = new window.PIXI.Graphics();
        redLine.moveTo(0, 0);
        redLine.lineTo(tileMap.width * this.tileSize, 0);
        redLine.stroke({ color: 0xFF0000, width: 2, alpha: 1.0 });
        redLine.y = 0; // Position at y=0 in world coordinates
        
        // Add red line to tile map container
        this.tileMapContainer.addChild(redLine);
        
        console.log(`🗺️ Tile map created with ${this.tileMapContainer.children.length} tiles and red line at y=0`);
    }
    
    updateTileMap(tileMap) {
        // Update tiles if water simulation is active
        for (let y = 0; y < tileMap.height; y++) {
            for (let x = 0; x < tileMap.width; x++) {
                const idx = y * tileMap.width + x;
                const tile = tileMap.tiles[idx];
                const tileKey = `${x},${y}`;
                const tileGraphic = this.tileGraphics.get(tileKey);
                
                if (tile.tile_type === 'Air') {
                    // If tile became air, remove its graphic
                    if (tileGraphic) {
                        this.tileMapContainer.removeChild(tileGraphic);
                        this.tileGraphics.delete(tileKey);
                    }
                } else if (tileGraphic && tile.tile_type === 'Water') {
                    // Update water tile appearance based on water amount
                    this.updateWaterTile(tileGraphic, tile);
                } else if (!tileGraphic && tile.tile_type !== 'Air') {
                    // Create graphic for non-air tile that didn't exist before
                    let color = 0xCCCCCC;
                    switch (tile.tile_type) {
                        case 'Dirt': color = 0x8B4513; break;
                        case 'Stone': color = 0x696969; break;
                        case 'Water': color = 0x1E90FF; break;
                        default: color = 0xCCCCCC; break;
                    }
                    
                    const newTileGraphic = new window.PIXI.Graphics();
                    newTileGraphic.rect(0, 0, this.tileSize, this.tileSize);
                    newTileGraphic.fill({ color, alpha: 1.0 });
                    
                    // Make tile interactive for hover effects
                    newTileGraphic.eventMode = 'static';
                    newTileGraphic.cursor = 'pointer';
                    
                    // Store tile data for hover effects
                    newTileGraphic.tileData = {
                        x: x,
                        y: y,
                        type: tile.tile_type,
                        baseColor: color
                    };
                    
                    // Add hover event listeners
                    newTileGraphic.on('pointerover', () => {
                        this.onTileHover(newTileGraphic, true);
                    });
                    
                    newTileGraphic.on('pointerout', () => {
                        this.onTileHover(newTileGraphic, false);
                    });
                    
                    // Position the tile directly
                    newTileGraphic.x = x * this.tileSize;
                    newTileGraphic.y = -(y + 1) * this.tileSize;
                    
                    // Store reference for hover management
                    this.tileGraphics.set(tileKey, newTileGraphic);
                    
                    // Add to tile map container
                    this.tileMapContainer.addChild(newTileGraphic);
                    
                    // If it's a water tile, update its appearance
                    if (tile.tile_type === 'Water') {
                        this.updateWaterTile(newTileGraphic, tile);
                    }
                }
            }
        }
    }
    
    updateWaterTile(tileGraphic, tile) {
        // Calculate water color based on amount (0 = transparent, 1024 = full blue)
        const maxWaterAmount = 1024;
        const waterAmount = tile.water_amount || 0;
        const waterRatio = waterAmount / maxWaterAmount; // Convert to 0.0-1.0 range
        const baseColor = 0x1E90FF; // Dodger blue
        const alpha = Math.max(0.2, waterRatio); // Minimum alpha for visibility
        
        // Create a darker blue for fuller water
        let color = baseColor;
        if (waterRatio > 0.5) {
            color = 0x0066CC; // Darker blue for more water
        }
        
        // Clear and redraw the tile
        tileGraphic.clear();
        
        if (waterAmount > 0 && waterAmount < maxWaterAmount) {
            // For partial water, only fill the bottom portion
            const waterHeight = waterRatio * this.tileSize;
            const airHeight = this.tileSize - waterHeight;
            
            // Draw only the water portion at the bottom, leaving air space transparent
            tileGraphic.rect(0, airHeight, this.tileSize, waterHeight);
            tileGraphic.fill({ color, alpha });
        } else if (waterAmount >= maxWaterAmount) {
            // Full water tile
            tileGraphic.rect(0, 0, this.tileSize, this.tileSize);
            tileGraphic.fill({ color, alpha });
        }
    }

    onTileHover(tileGraphic, isHovering) {
        const { x, y, type, baseColor } = tileGraphic.tileData;
        
        // Clear and redraw the tile
        tileGraphic.clear();
        tileGraphic.rect(0, 0, this.tileSize, this.tileSize);
        tileGraphic.fill({ color: baseColor, alpha: 1.0 });
        
        if (isHovering) {
            // Create inset border effect with darker top/left and lighter bottom/right
            const borderWidth = 2;
            
            // Darker shadow on top and left (inset effect)
            tileGraphic.moveTo(0, 0);
            tileGraphic.lineTo(this.tileSize, 0);
            tileGraphic.lineTo(this.tileSize - borderWidth, borderWidth);
            tileGraphic.lineTo(borderWidth, borderWidth);
            tileGraphic.lineTo(borderWidth, this.tileSize - borderWidth);
            tileGraphic.lineTo(0, this.tileSize);
            tileGraphic.closePath();
            tileGraphic.fill({ color: 0xFFFFFF, alpha: 1 });
            
            // Lighter highlight on bottom and right (inset effect)
            tileGraphic.moveTo(this.tileSize, this.tileSize);
            tileGraphic.lineTo(0, this.tileSize);
            tileGraphic.lineTo(borderWidth, this.tileSize - borderWidth);
            tileGraphic.lineTo(this.tileSize - borderWidth, this.tileSize - borderWidth);
            tileGraphic.lineTo(this.tileSize - borderWidth, borderWidth);
            tileGraphic.lineTo(this.tileSize, 0);
            tileGraphic.closePath();
            tileGraphic.fill({ color: 0xFFFFFF, alpha: 1 });
            
            // Optional: Show tile info in console (commented out to reduce spam)
            // console.log(`🎯 Hovering over tile (${x}, ${y}) - Type: ${type}`);
        }
        // When not hovering, no border is drawn (clean appearance)
    }

    clearSprites() {
        for (const sprite of this.promiserSprites.values()) {
            this.container.removeChild(sprite);
        }
        this.promiserSprites.clear();
        this.promiserStates.clear(); // Clear sprite state tracking
        
        // Clear thought bubbles
        for (const bubble of this.thoughtBubbles.values()) {
            this.uiContainer.removeChild(bubble);
        }
        this.thoughtBubbles.clear();
        
        // Clear tile map
        this.tileMapContainer.removeChildren();
        this.tileGraphics.clear(); // Clear tile graphics map
        this.tileMapCreated = false;
        this.currentTileMap = null;
        
        // Clear hover preview tile
        if (this.hoverPreviewTile) {
            this.worldContainer.removeChild(this.hoverPreviewTile);
            this.hoverPreviewTile = null;
        }
    }
    
    destroy() {
        if (this.worker) {
            this.worker.terminate();
        }
        if (this.app) {
            this.app.destroy(true);
        }
    }

    createLightSystem() {
        this.lightSystem.lightContainer = new window.PIXI.Container();
        this.worldContainer.addChild(this.lightSystem.lightContainer);
    }

    renderPhotons(photons) {
        const spritePool = this.lightSystem.photonSprites;
        const container = this.lightSystem.lightContainer;

        const activeIds = new Set();
        photons.forEach((p, idx) => {
            activeIds.add(idx);
            let g = spritePool.get(idx);
            if (!g) {
                g = new window.PIXI.Graphics();
                spritePool.set(idx, g);
                container.addChild(g);
            }
            g.clear();
            g.moveTo(0, 0);
            g.lineTo(-p.vx * 3, p.vy * 3); // small line segment
            const intensity = Math.min(1.0, p.intensity);
            const col = 0xFFFFCC;
            g.stroke({ color: col, width: 1, alpha: intensity });
            g.x = p.x;
            g.y = -p.y;
        });

        // Remove unused sprites
        for (const [idx, g] of spritePool.entries()) {
            if (!activeIds.has(idx)) {
                container.removeChild(g);
                spritePool.delete(idx);
            }
        }
    }

    updateTileBrightness(lightMap, tileMapWidth) {
        lightMap.forEach(entry => {
            const idx = entry.index;
            const brightness = entry.brightness;
            const x = idx % tileMapWidth;
            const y = Math.floor(idx / tileMapWidth);
            const key = `${x},${y}`;
            const tileGraphic = this.tileGraphics.get(key);
            if (tileGraphic) {
                tileGraphic.alpha = brightness;
            }
        });
    }
}

// Initialize and start the game
const game = new Game();

game.init().then(() => {
    console.log('🎮 Game ready! Click "Start Game" to begin.');
}).catch(error => {
    console.error('🎮 Failed to initialize game:', error);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    game.destroy();
});
