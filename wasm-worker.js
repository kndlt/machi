import init, { hello_world, heavy_work } from './pkg/hello_wasm.js';

let wasmReady = false;

async function initWasm() {
    if (!wasmReady) {
        await init();
        wasmReady = true;
        console.log('🔧 Worker: WASM ready');
    }
}

self.onmessage = async function(e) {
    const { type, id } = e.data;
    
    try {
        await initWasm();
        
        let result;
        switch (type) {
            case 'hello':
                result = hello_world();
                break;
            case 'heavy':
                result = heavy_work();
                break;
            default:
                throw new Error(`Unknown type: ${type}`);
        }
        
        self.postMessage({ id, result });
        
    } catch (error) {
        self.postMessage({ id, error: error.message });
    }
};
