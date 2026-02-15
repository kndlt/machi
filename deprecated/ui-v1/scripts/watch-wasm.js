#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Starting WASM file watcher...');

let isBuilding = false;
let buildQueue = false;

function buildWasm() {
  if (isBuilding) {
    buildQueue = true;
    return;
  }

  isBuilding = true;
  console.log('🔨 Building WASM...');
  
  const buildProcess = spawn('wasm-pack', ['build', '--target', 'web', '--out-dir', '../public/pkg'], {
    cwd: path.join(__dirname, '../wasm'),
    stdio: 'inherit'
  });

  buildProcess.on('close', (code) => {
    isBuilding = false;
    if (code === 0) {
      console.log('✅ WASM build completed successfully!');
    } else {
      console.log(`❌ WASM build failed with code ${code}`);
    }

    if (buildQueue) {
      buildQueue = false;
      setTimeout(buildWasm, 100); // Small delay to avoid rapid rebuilds
    }
  });

  buildProcess.on('error', (err) => {
    isBuilding = false;
    console.error('❌ Failed to start build process:', err);
  });
}

// Watch the wasm/src directory
const wasmSrcDir = path.join(__dirname, '../wasm/src');

console.log(`👀 Watching ${wasmSrcDir} for changes...`);

fs.watch(wasmSrcDir, { recursive: true }, (eventType, filename) => {
  if (filename && filename.endsWith('.rs')) {
    console.log(`📝 File changed: ${filename}`);
    buildWasm();
  }
});

// Initial build
buildWasm();

console.log('🚀 WASM watcher is running. Press Ctrl+C to stop.');
