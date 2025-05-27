import init, { hello_world, compute_fibonacci, heavy_computation } from './pkg/hello_wasm.js';

// Class to handle WASM worker communication
class WasmWorker {
    constructor() {
        this.worker = new Worker('./wasm-worker.js', { type: 'module' });
        this.messageId = 0;
        this.pendingMessages = new Map();
        
        this.worker.onmessage = (e) => {
            const { type, id, result, error } = e.data;
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
    
    terminate() {
        this.worker.terminate();
    }
}

let wasmWorker;

async function runMainThread() {
    console.log('\n🧵 === MAIN THREAD EXECUTION ===');
    
    // Initialize the wasm module on main thread
    await init();
    
    // Test 1: Simple hello world
    console.log('1. Calling hello_world() on main thread...');
    const message = hello_world();
    console.log('   Result:', message);
    
    // Test 2: Fibonacci calculation
    console.log('2. Computing fibonacci(40) on main thread...');
    const start = performance.now();
    const fib = compute_fibonacci(40);
    const end = performance.now();
    console.log(`   Result: ${fib} (took ${(end - start).toFixed(2)}ms)`);
}

async function runWorkerThread() {
    console.log('\n🔧 === WORKER THREAD EXECUTION ===');
    
    wasmWorker = new WasmWorker();
    
    // Test 1: Simple hello world in worker
    console.log('1. Calling hello_world() in worker thread...');
    try {
        const message = await wasmWorker.callFunction('hello_world');
        console.log('   Result:', message);
    } catch (error) {
        console.error('   Error:', error);
    }
    
    // Test 2: Fibonacci calculation in worker
    console.log('2. Computing fibonacci(40) in worker thread...');
    const start = performance.now();
    try {
        const fib = await wasmWorker.callFunction('fibonacci', { n: 40 });
        const end = performance.now();
        console.log(`   Result: ${fib} (took ${(end - start).toFixed(2)}ms)`);
    } catch (error) {
        console.error('   Error:', error);
    }
    
    // Test 3: Heavy computation in worker (non-blocking)
    console.log('3. Starting heavy computation in worker thread...');
    console.log('   (This runs in background - main thread stays responsive)');
    
    wasmWorker.callFunction('heavy_computation')
        .then(result => {
            console.log('   Heavy computation result:', result);
            updateStatus('✅ All worker operations completed!');
        })
        .catch(error => {
            console.error('   Heavy computation error:', error);
        });
}

function updateStatus(message) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

async function run() {
    console.log('🚀 === WASM THREADING DEMONSTRATION ===');
    
    // Update HTML with status
    document.body.innerHTML += `
        <div style="padding: 20px; font-family: Arial, sans-serif;">
            <h2>WebAssembly Threading Demo</h2>
            <p id="status">🔄 Running tests...</p>
            <div style="margin-top: 20px;">
                <h3>Key Differences:</h3>
                <ul>
                    <li><strong>Main Thread:</strong> WASM blocks the UI during execution</li>
                    <li><strong>Worker Thread:</strong> WASM runs in background, UI stays responsive</li>
                </ul>
                <p><em>Check the browser console for detailed logs!</em></p>
            </div>
        </div>
    `;
    
    try {
        // Run main thread tests
        await runMainThread();
        
        // Small delay to show the difference
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Run worker thread tests
        await runWorkerThread();
        
        updateStatus('🔄 Tests running... (worker operations in progress)');
        
    } catch (error) {
        console.error('Error:', error);
        updateStatus('❌ Error occurred during tests');
    }
}

// Cleanup worker on page unload
window.addEventListener('beforeunload', () => {
    if (wasmWorker) {
        wasmWorker.terminate();
    }
});

// Run the function when the page loads
run().catch(console.error);
