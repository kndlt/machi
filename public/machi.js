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
        this.thoughtBubbles = new Map();
        this.container = null;
        this.uiContainer = null;
        this.isRunning = false;
        this.aiCoordinator = null;
        
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
        
        // Create container for UI elements (thought bubbles, etc.)
        this.uiContainer = new window.PIXI.Container();
        this.app.stage.addChild(this.uiContainer);
        
        // Initialize worker
        this.worker = new GameWorker();
        this.worker.onGameStateUpdate = (data, timestamp) => {
            this.updateRender(data, timestamp);
        };
        
        // Add UI controls
        this.createUI();
        
        // Auto-start the game
        await this.startGame();
        
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
            <div style="margin-top: 10px;">
                <label style="font-size: 12px;">AI Coordinator:</label>
                <select id="aiSelector" style="margin-left: 5px; background: #333; color: white; border: 1px solid #555;">
                    <option value="ollama">Ollama (Local)</option>
                    <option value="test">Test AI</option>
                    <option value="openai">OpenAI</option>
                </select>
            </div>
            <div id="status" style="margin-top: 10px; font-size: 12px;">Ready to start</div>
        `;
        
        document.body.appendChild(controls);
        
        // Add event listeners
        document.getElementById('startGame').onclick = () => this.startGame();
        document.getElementById('stopGame').onclick = () => this.stopGame();
        document.getElementById('addPromiser').onclick = () => this.addPromiser();
        
        // Set up AI selector
        const aiSelector = document.getElementById('aiSelector');
        aiSelector.value = this.getSelectedAIType();
        aiSelector.onchange = (e) => this.setAIType(e.target.value);
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
        
        // Default to Ollama for local AI
        return 'ollama';
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
                
                // Show thought bubble if it's a speaking/whispering action
                if (action === 'speak' || action === 'whisper') {
                    this.showThoughtBubble(promiser_id, content, action === 'whisper');
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
                
                // Show thought bubble if it's a speaking/whispering action
                if (behavior === 'speak' || behavior === 'whisper') {
                    this.showThoughtBubble(promiserId, thought, behavior === 'whisper');
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
    
    showThoughtBubble(promiserId, thought, isWhisper = false) {
        // Remove existing thought bubble for this promiser
        this.removeThoughtBubble(promiserId);
        
        const sprite = this.promiserSprites.get(promiserId);
        if (!sprite) return;
        
        // Create thought bubble container
        const bubbleContainer = new window.PIXI.Container();
        
        // Create bubble background
        const bubble = new window.PIXI.Graphics();
        const bubbleColor = isWhisper ? 0x444444 : 0xFFFFFF;
        const bubbleAlpha = isWhisper ? 0.7 : 0.9;
        
        bubble.roundRect(-50, -30, 100, 20, 10);
        bubble.fill({ color: bubbleColor, alpha: bubbleAlpha });
        bubble.stroke({ color: 0x000000, width: 1 });
        
        // Create text
        const text = new window.PIXI.Text({
            text: thought,
            style: {
                fontSize: 10,
                fill: isWhisper ? 0xCCCCCC : 0x000000,
                align: 'center',
                wordWrap: true,
                wordWrapWidth: 90
            }
        });
        
        text.anchor.set(0.5, 0.5);
        text.x = 0;
        text.y = -20;
        
        bubbleContainer.addChild(bubble);
        bubbleContainer.addChild(text);
        bubbleContainer.x = sprite.x;
        bubbleContainer.y = sprite.y - sprite.width - 20;
        
        this.uiContainer.addChild(bubbleContainer);
        this.thoughtBubbles.set(promiserId, bubbleContainer);
        
        // Auto-remove after 3-5 seconds
        const duration = isWhisper ? 2000 : 4000;
        setTimeout(() => {
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
            
            // Update sprite appearance based on state
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
            
            sprite.x = promiser.x;
            sprite.y = promiser.y;
            
            // Update thought bubble position if it exists
            const bubble = this.thoughtBubbles.get(promiser.id);
            if (bubble) {
                bubble.x = promiser.x;
                bubble.y = promiser.y - promiser.size - 20;
            }
        });
        
        // Remove sprites for promisers that no longer exist
        for (const [id, sprite] of this.promiserSprites.entries()) {
            if (!currentIds.has(id)) {
                this.container.removeChild(sprite);
                this.promiserSprites.delete(id);
                this.removeThoughtBubble(id);
            }
        }
    }
    
    clearSprites() {
        for (const sprite of this.promiserSprites.values()) {
            this.container.removeChild(sprite);
        }
        this.promiserSprites.clear();
        
        // Clear thought bubbles
        for (const bubble of this.thoughtBubbles.values()) {
            this.uiContainer.removeChild(bubble);
        }
        this.thoughtBubbles.clear();
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
