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
        this.container = null;
        this.isRunning = false;
        
        // Game settings
        this.worldWidth = 800;
        this.worldHeight = 600;
    }
    
    async init() {
        console.log('🎮 Initializing game...');
        
        // Create Pixi.js application
        this.app = new window.PIXI.Application();
        await this.app.init({
            width: this.worldWidth,
            height: this.worldHeight,
            backgroundColor: 0x1a1a2e,
            antialias: true
        });
        
        // Replace loading content with game canvas
        const gameContainer = document.getElementById('gameContainer');
        const loadingDiv = gameContainer.querySelector('.loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }
        gameContainer.appendChild(this.app.canvas);
        
        // Create container for promisers
        this.container = new window.PIXI.Container();
        this.app.stage.addChild(this.container);
        
        // Initialize worker
        this.worker = new GameWorker();
        this.worker.onGameStateUpdate = (data, timestamp) => {
            this.updateRender(data, timestamp);
        };
        
        // Add UI controls
        this.createUI();
        
        console.log('🎮 Game initialized');
    }
    
    createUI() {
        const controls = document.createElement('div');
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
        `;
        
        controls.innerHTML = `
            <h3 style="margin: 0 0 10px 0;">Promiser Game</h3>
            <button id="startGame">Start Game</button>
            <button id="stopGame">Stop Game</button>
            <button id="addPromiser">Add Promiser</button>
            <div id="status" style="margin-top: 10px; font-size: 12px;">Ready to start</div>
        `;
        
        document.body.appendChild(controls);
        
        // Add event listeners
        document.getElementById('startGame').onclick = () => this.startGame();
        document.getElementById('stopGame').onclick = () => this.stopGame();
        document.getElementById('addPromiser').onclick = () => this.addPromiser();
    }
    
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
                worldWidth: this.worldWidth,
                worldHeight: this.worldHeight
            });
            
            this.isRunning = true;
            this.updateStatus('Game running - Promisers are moving!');
            console.log('🎮 Game started:', result);
            
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
    
    updateRender(gameState, timestamp) {
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
            
            // Update sprite appearance and position
            sprite.clear();
            sprite.circle(0, 0, promiser.size);
            sprite.fill({ color: promiser.color & 0xFFFFFF }); // Remove alpha from color
            sprite.x = promiser.x;
            sprite.y = promiser.y;
        });
        
        // Remove sprites for promisers that no longer exist
        for (const [id, sprite] of this.promiserSprites.entries()) {
            if (!currentIds.has(id)) {
                this.container.removeChild(sprite);
                this.promiserSprites.delete(id);
            }
        }
    }
    
    clearSprites() {
        for (const sprite of this.promiserSprites.values()) {
            this.container.removeChild(sprite);
        }
        this.promiserSprites.clear();
    }
    
    destroy() {
        if (this.worker) {
            this.worker.terminate();
        }
        if (this.app) {
            this.app.destroy(true);
        }
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
