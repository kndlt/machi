# Live WASM Development Setup

This setup allows you to make changes to your Rust code and see them reflected in your WebAssembly application immediately.

## Quick Start

### Option 1: Run Everything Together (Recommended)
```bash
npm run dev:full
```
This starts both the Next.js development server and the WASM file watcher in one command.

### Option 2: Run Separately
In one terminal:
```bash
npm run dev
```

In another terminal:
```bash
npm run dev:wasm
```

## How It Works

- **File Watcher**: The `scripts/watch-wasm.js` script monitors your `wasm/src/` directory for changes to `.rs` files
- **Auto-rebuild**: When you save a Rust file, it automatically runs `wasm-pack build` to rebuild your WASM module
- **Live Reload**: Your Next.js development server will automatically pick up the new WASM files and reload the page

## VS Code Integration

If you're using VS Code, you can use the built-in task runner:

1. Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Tasks: Run Task"
3. Select either:
   - "Watch WASM" - Just the WASM watcher
   - "Dev Full (Next.js + WASM)" - Both Next.js and WASM watcher

## Testing the Setup

1. Start the development environment: `npm run dev:full`
2. Make a small change to your Rust code in `wasm/src/lib.rs` (e.g., change a constant value)
3. Save the file
4. Watch the terminal - you should see the WASM rebuild automatically
5. Refresh your browser to see the changes

## Available Scripts

- `npm run dev` - Start Next.js development server only
- `npm run dev:wasm` - Start WASM file watcher only  
- `npm run dev:full` - Start both Next.js and WASM watcher
- `npm run build:wasm` - Build WASM once without watching

## Troubleshooting

If the watcher doesn't work:
1. Make sure `wasm-pack` is installed: `cargo install wasm-pack`
2. Check that you're in the correct directory when running the commands
3. Look for error messages in the terminal output
