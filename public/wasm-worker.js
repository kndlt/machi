// Web Worker script for running WASM game state in background thread
import init, { init_game, update_game, add_promiser, get_promiser_count } from './pkg/hello_wasm.js';

console.log('🎮 Worker: Starting WASM game worker...');

// Initialize WASM module
let wasmInitialized = false;
let gameRunning = false;
let updateInterval = null;

async function initWasm() {
    if (!wasmInitialized) {
        await init();
        wasmInitialized = true;
        console.log('🎮 Worker: WASM game module initialized in worker thread');
    }
}

function startGameLoop(worldWidth, worldHeight) {
    if (gameRunning) return;
    
    console.log('🎮 Worker: Starting game loop...');
    init_game(worldWidth, worldHeight);
    gameRunning = true;
    
    // Update game state every 16ms (approximately 60fps)
    updateInterval = setInterval(() => {
        const currentTime = performance.now();
        const stateData = update_game(currentTime);
        
        // Send compact state to main thread for rendering
        self.postMessage({
            type: 'game_state_update',
            data: JSON.parse(stateData),
            timestamp: currentTime
        });
    }, 16);
    
    console.log('🎮 Worker: Game loop started');
}

function stopGameLoop() {
    if (!gameRunning) return;
    
    console.log('🎮 Worker: Stopping game loop...');
    gameRunning = false;
    
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
    
    console.log('🎮 Worker: Game loop stopped');
}

// Listen for messages from main thread
self.onmessage = async function(e) {
    const { type, data, id } = e.data;
    
    console.log(`🎮 Worker: Received message type: ${type}`);
    
    try {
        // Initialize WASM if not already done
        await initWasm();
        
        let result;
        
        switch (type) {
            case 'start_game':
                startGameLoop(data.worldWidth || 800, data.worldHeight || 600);
                result = { status: 'game_started' };
                break;
                
            case 'stop_game':
                stopGameLoop();
                result = { status: 'game_stopped' };
                break;
                
            case 'add_promiser':
                add_promiser();
                result = { 
                    status: 'promiser_added',
                    count: get_promiser_count()
                };
                break;
                
            case 'get_status':
                result = {
                    gameRunning,
                    promiserCount: get_promiser_count(),
                    wasmInitialized
                };
                break;
                
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
        
        // Send result back to main thread (if ID provided)
        if (id !== undefined) {
            self.postMessage({
                type: 'success',
                id: id,
                result: result
            });
        }
        
    } catch (error) {
        console.error('🎮 Worker: Error:', error);
        if (id !== undefined) {
            self.postMessage({
                type: 'error',
                id: id,
                error: error.message
            });
        }
    }
};
