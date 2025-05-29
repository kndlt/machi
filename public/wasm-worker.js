// Web Worker script for running WASM game state in background thread
import init, { 
    init_game, 
    update_game, 
    add_promiser, 
    get_promiser_count,
    make_promiser_think,
    make_promiser_speak,
    make_promiser_whisper,
    make_promiser_run,
    get_pixel_id,
    get_random_promiser_id
} from './pkg/hello_wasm.js';

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

function startGameLoop(worldWidthTiles, worldHeightTiles) {
    if (gameRunning) return;
    
    console.log('🎮 Worker: Starting game loop...');
    init_game(worldWidthTiles, worldHeightTiles);
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
                startGameLoop(data.worldWidth || 25, data.worldHeight || 19);
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
                
            case 'make_promiser_think':
                console.log('🤖 Worker: Making promiser think:', data.id);
                make_promiser_think(data.id);
                result = { status: 'promiser_thinking', id: data.id };
                break;
                
            case 'make_promiser_speak':
                console.log('🤖 Worker: Making promiser speak:', data.id, data.thought);
                make_promiser_speak(data.id, data.thought);
                result = { status: 'promiser_speaking', id: data.id, thought: data.thought };
                break;
                
            case 'make_promiser_whisper':
                make_promiser_whisper(data.id, data.thought, data.targetId);
                result = { status: 'promiser_whispering', id: data.id, thought: data.thought, targetId: data.targetId };
                break;
                
            case 'make_promiser_run':
                make_promiser_run(data.id);
                result = { status: 'promiser_running', id: data.id };
                break;
                
            case 'get_pixel_id':
                result = { pixelId: get_pixel_id() };
                break;
                
            case 'get_random_promiser_id':
                result = { promiserId: get_random_promiser_id() };
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
