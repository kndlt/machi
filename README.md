# Promiser Game - WebAssembly + Pixi.js

An interactive game demonstrating real-time WebAssembly game state management with Pixi.js rendering. Little creatures called "promisers" move around randomly on a 2D plane, with all game logic running in a Web Worker to keep the UI responsive.

## Features

- **Real-time Game State**: WASM manages game entities with 60fps updates
- **Web Worker Threading**: Game logic runs in background thread, UI stays responsive
- **Pixi.js Rendering**: Smooth 2D graphics with efficient sprite management
- **Interactive Controls**: Add promisers dynamically, start/stop the simulation
- **Compact State Transfer**: Optimized data serialization between worker and main thread

## Architecture

### Core Components
- **`src/lib.rs`** - Rust WASM game engine with promiser entities and game state
- **`public/wasm-worker.js`** - Web Worker running game loop and state updates
- **`public/machi.js`** - Main thread coordinator with Pixi.js rendering
- **`public/index.html`** - Game interface and canvas container

### Data Flow
1. **Game State (WASM)**: Promisers move randomly, bounce off boundaries, change direction
2. **Worker Thread**: Updates game state 60 times per second 
3. **State Transfer**: Compact JSON representation sent to main thread
4. **Rendering**: Pixi.js sprites updated with current promiser positions/colors

## Game Entities: Promisers

Promisers are autonomous entities with the following properties:
- **Position** (x, y): Current location on the 2D plane
- **Velocity** (vx, vy): Movement speed and direction
- **Size**: Visual radius (5-15 pixels)
- **Color**: Random RGB color for identification
- **Behavior**: Random movement with boundary bouncing and occasional direction changes

## Technical Implementation

### WASM Game State
```rust
// Game state contains all promisers and world bounds
pub struct GameState {
    promisers: HashMap<u32, Promiser>,
    world_width: f64,
    world_height: f64,
}

// Each promiser moves independently
impl Promiser {
    fn update(&mut self, world_width: f64, world_height: f64, dt: f64) {
        // Update position, handle boundary collisions
    }
}
```

### Worker Threading
```javascript
// Game loop running at 60fps in Web Worker
setInterval(() => {
    const stateData = update_game(performance.now());
    self.postMessage({
        type: 'game_state_update',
        data: JSON.parse(stateData)
    });
}, 16);
```

### Efficient Rendering
```javascript
// Only update sprites that exist, create/remove as needed
gameState.promisers.forEach(promiser => {
    let sprite = this.promiserSprites.get(promiser.id);
    if (!sprite) {
        sprite = new PIXI.Graphics();
        this.promiserSprites.set(promiser.id, sprite);
    }
    // Update position and appearance
});
```

## Performance Benefits

### Threading Model
- **Main Thread**: Handles UI, rendering, user interactions
- **Worker Thread**: Manages game state, physics, entity updates
- **Result**: Smooth 60fps animation with responsive controls

### State Management
- **Compact Serialization**: Only essential data transferred between threads
- **Efficient Updates**: Sprite pool management, minimal DOM manipulation
- **Memory Management**: Automatic cleanup of removed entities

## Controls

- **Start Game**: Initialize promisers and begin simulation
- **Stop Game**: Pause simulation and clear display
- **Add Promiser**: Spawn new entity with random properties

## Running the Game

1. **Build WASM**: `wasm-pack build --target web --out-dir public/pkg`
2. **Start Server**: `cd public && python3 -m http.server 8000`
3. **Open Browser**: Navigate to `http://localhost:8000`
4. **Play**: Click "Start Game" and watch the promisers move!

This project demonstrates how WebAssembly can efficiently manage real-time game state while keeping browser UI responsive through proper threading architecture.
