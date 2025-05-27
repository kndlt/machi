# WebAssembly Threading Demo

This project demonstrates the difference between running WebAssembly on the main thread vs. in a background thread using Web Workers.

## Files Overview

### Core Files
- **`index.html`** - Main HTML page
- **`machi.js`** - Main thread coordinator and WASM interface
- **`wasm-worker.js`** - Web Worker script for background WASM execution
- **`src/lib.rs`** - Rust WASM module with multiple functions
- **`pkg/`** - Generated WASM bindings and files

## Threading Models

### 1. Main Thread Execution (Original)
```javascript
// Direct WASM calls on main thread
const result = hello_world();  // Blocks UI if heavy computation
```

**Characteristics:**
- ✅ Simple and straightforward
- ✅ No message passing overhead
- ❌ Blocks the main thread during execution
- ❌ Can freeze the UI for heavy computations

### 2. Background Thread Execution (Web Workers)
```javascript
// WASM runs in Web Worker
const result = await wasmWorker.callFunction('hello_world');
```

**Characteristics:**
- ✅ Non-blocking - UI stays responsive
- ✅ True parallel execution
- ✅ Can handle heavy computations without freezing
- ❌ More complex setup required
- ❌ Message passing overhead
- ❌ Limited access to DOM from worker

## Functions Demonstrated

1. **`hello_world()`** - Simple string return
2. **`compute_fibonacci(n)`** - CPU-intensive calculation
3. **`heavy_computation()`** - Simulates very heavy work

## Key Differences Observed

### Main Thread:
- WASM executes synchronously
- Heavy computations block the browser UI
- Direct function calls (faster for simple operations)

### Worker Thread:
- WASM executes asynchronously via message passing
- Heavy computations run in background
- UI remains responsive during execution
- Small overhead for message serialization

## When to Use Each Approach

### Use Main Thread When:
- Simple, fast computations
- Need immediate results
- Working with DOM elements directly
- Simplicity is preferred

### Use Worker Thread When:
- Heavy computational workloads
- Long-running operations
- UI responsiveness is critical
- Parallel processing is beneficial

## Browser Console Output

The demo shows both execution methods with timing information:
```
🧵 === MAIN THREAD EXECUTION ===
1. Calling hello_world() on main thread...
   Result: Hello World from WebAssembly!
2. Computing fibonacci(40) on main thread...
   Result: 102334155 (took 2.50ms)

🔧 === WORKER THREAD EXECUTION ===
1. Calling hello_world() in worker thread...
   Result: Hello World from WebAssembly!
2. Computing fibonacci(40) in worker thread...
   Result: 102334155 (took 3.20ms)
3. Starting heavy computation in worker thread...
   (This runs in background - main thread stays responsive)
```

## Technical Implementation

The Web Worker implementation uses:
- ES6 modules for worker scripts
- Promise-based message passing
- Unique message IDs for request/response matching
- Error handling and cleanup

This demonstrates how WebAssembly can be used effectively in both threading models depending on your application's needs.
