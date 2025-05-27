# WASM + Worker Threading

Minimal Rust WebAssembly with main thread vs worker thread execution.

## Run
```bash
wasm-pack build --target web --out-dir pkg
python3 -m http.server 8000
# Open http://localhost:8000
```

## Files
- `index.html` - page
- `machi.js` - main thread + worker coordinator  
- `wasm-worker.js` - worker thread
- `src/lib.rs` - rust wasm functions

## What it shows
- Main thread: WASM blocks UI during heavy computation
- Worker thread: WASM runs in background, UI stays responsive
- Check browser console for detailed comparison
