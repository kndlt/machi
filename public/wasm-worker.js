// Web Worker script for running WASM in background thread
import init, { hello_world, compute_fibonacci, heavy_computation } from './pkg/hello_wasm.js';

console.log('🔧 Worker: Starting WASM worker...');

// Initialize WASM module
let wasmInitialized = false;

async function initWasm() {
    if (!wasmInitialized) {
        await init();
        wasmInitialized = true;
        console.log('🔧 Worker: WASM module initialized in worker thread');
    }
}

// Listen for messages from main thread
self.onmessage = async function(e) {
    const { type, data, id } = e.data;
    
    console.log(`🔧 Worker: Received message type: ${type}`);
    
    try {
        // Initialize WASM if not already done
        await initWasm();
        
        let result;
        
        switch (type) {
            case 'hello_world':
                result = hello_world();
                break;
                
            case 'fibonacci':
                result = compute_fibonacci(data.n);
                break;
                
            case 'heavy_computation':
                result = heavy_computation();
                break;
                
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
        
        // Send result back to main thread
        self.postMessage({
            type: 'success',
            id: id,
            result: result
        });
        
    } catch (error) {
        console.error('🔧 Worker: Error:', error);
        self.postMessage({
            type: 'error',
            id: id,
            error: error.message
        });
    }
};
