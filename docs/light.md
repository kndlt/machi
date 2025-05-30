# Sun Light System Design Document

## Overview

The Sun Light System is a photon-based lighting simulation that will serve as the foundation for future microbial simulation features. This system simulates realistic light transport through a tile-based environment, creating dynamic lighting, shadows, and heat distribution.

## Objectives

- **Primary**: Implement a photon-based lighting system that creates realistic light distribution and shadows
- **Secondary**: Establish foundation for microbial simulation that depends on light and heat
- **Tertiary**: Provide visual debugging capabilities for development and testing

## Core Requirements

### Light Source Configuration
- **Position**: Top-left corner, 30° angle from Y-axis
- **Type**: Line light source perpendicular to sun direction
- **Coverage**: Wide enough to illuminate the entire tile map
- **Scope**: Positioned outside the visible tile map boundaries

### Photon Simulation
- **Generation**: Photons spawn from the light source and travel as discrete particles
- **Movement**: One tile per tick movement toward the tile map
- **Visualization**: Rendered as short lines in debug mode
- **Lifecycle**: Continue until absorbed by tiles or exit the map

### Tile Interactions

#### Material Properties
| Tile Type | Behavior |
|-----------|----------|
| **Air** | Complete transparency - photons pass through |
| **Water** | Partial transmission with refraction |
| **Dirt** | Complete absorption |
| **Stone** | Complete absorption with diffuse reflection |

#### Light Absorption
- Tiles accumulate heat/energy when absorbing photons
- Absorption rate varies by material type
- Accumulated energy affects tile brightness rendering

### Reflection and Bouncing
- **Solid Tiles**: Photons reflect off Dirt and Stone surfaces
- **Reflection Type**: Diffuse (random direction) rather than specular
- **Energy Loss**: Each bounce reduces photon intensity
- **Convergence**: System reaches stable state over time

## Technical Specifications

### Performance Characteristics
- **Update Frequency**: Infrequent, non-real-time computation
- **Priority**: Accuracy over performance
- **Convergence**: Gradual stabilization similar to 3D rendering exposure averaging
- **Orthogonality**: Independent of existing water simulation and promiser systems

### Rendering System
- **Normal Mode**: Enhanced tile brightness based on accumulated light
- **Debug Mode**: Visible photon particles as moving line segments
- **Shadow Rendering**: Natural shadow creation from light occlusion
- **Brightness Range**: Darker unlit areas (not completely black) to brighter lit areas

### System Stability
- **Convergence**: Light distribution stabilizes over time
- **Energy Conservation**: Consideration for light energy normalization per tick
- **Steady State**: System reaches equilibrium where light input equals absorption/exit

## Implementation Phases

### Phase 1: Core System
1. Light source implementation outside tile map
2. Basic photon generation and movement
3. Simple absorption by solid tiles
4. Debug visualization mode

### Phase 2: Material Interactions
1. Differential absorption rates by tile type
2. Water refraction mechanics
3. Diffuse reflection from solid surfaces
4. Tile brightness rendering

### Phase 3: Optimization & Polish
1. Performance optimization for convergence
2. Energy normalization systems
3. Enhanced visual effects
4. System stability improvements

## Future Considerations

### Configurable Parameters
- Light source position and angle adjustment
- Intensity and color temperature controls
- Material property customization

### Integration Points
- **Microbial Simulation**: Heat and light distribution affecting organism behavior
- **Dynamic Environment**: Moving objects affecting light paths
- **Weather System**: Variable light conditions and atmospheric effects

### Advanced Features
- **Multiple Light Sources**: Support for additional light sources
- **Atmospheric Scattering**: More realistic light transport
- **Temporal Variation**: Day/night cycles and seasonal changes

## Success Criteria

1. **Visual Quality**: Realistic shadows and lighting gradients
2. **Performance**: Stable convergence without frame rate impact
3. **Accuracy**: Physically plausible light distribution
4. **Debuggability**: Clear visualization of light transport
5. **Extensibility**: Foundation ready for microbial simulation integration

## Implementation Plan

### Architecture Integration

Based on the existing WASM + Pixi.js architecture, the light system will be implemented as follows:

#### WASM Core (Rust) - `wasm/src/lib.rs`
**Simple Data Structures (Start Here):**
```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Photon {
    pub x: f32,           // position x in pixels
    pub y: f32,           // position y in pixels
    pub vx: f32,          // velocity x in pixels per tick
    pub vy: f32,          // velocity y in pixels per tick
    pub intensity: f32,   // energy level (0.0-1.0)
    pub age: u32,         // ticks since creation
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LightSource {
    pub start_x: f32,
    pub start_y: f32,
    pub end_x: f32,
    pub end_y: f32,
    pub direction_x: f32, // normalized direction vector
    pub direction_y: f32, // normalized direction vector
    pub intensity: f32,   // max photon intensity to spawn
    pub photon_spawn_rate: f32, // photons per second per unit length
}

// Extend existing Tile struct
pub struct Tile {
    pub tile_type: TileType,
    pub water_amount: u16,        // existing - keep as integer
    pub light_energy: f32,        // accumulated light energy
    pub brightness: f32,          // visual brightness (0.0-1.0)
    pub temperature: f32,         // heat from absorbed light
}
```

**Simple GameState Methods:**
```rust
impl GameState {
    pub fn new(world_width_tiles: f64, world_height_tiles: f64) -> GameState {
        // ... existing initialization ...
        
        let mut state = GameState {
            // ... existing fields ...
            photons: Vec::new(),     // Simple vector of photons
            light_source: create_light_source(world_width_pixels, world_height_pixels),
        };
        
        state
    }
    
    pub fn simulate_light(&mut self) {
        // 1. Spawn new photons from light source
        self.spawn_photons();
        
        // 2. Update existing photon positions
        self.update_photons();
        
        // 3. Handle photon-tile collisions
        self.process_photon_collisions();
        
        // 4. Calculate tile brightness
        self.calculate_tile_brightness();
    }
    
    fn spawn_photons(&mut self) {
        let photons_to_spawn = (self.light_source.photon_spawn_rate / 60.0) as u32; // per frame at 60fps
        
        for _ in 0..photons_to_spawn {
            // Interpolate along light source line
            let t = random() as f32; // 0.0-1.0
            let spawn_x = self.light_source.start_x + 
                (self.light_source.end_x - self.light_source.start_x) * t;
            let spawn_y = self.light_source.start_y + 
                (self.light_source.end_y - self.light_source.start_y) * t;
            
            let photon = Photon {
                x: spawn_x,
                y: spawn_y,
                vx: self.light_source.direction_x,
                vy: self.light_source.direction_y,
                intensity: self.light_source.intensity,
                age: 0,
            };
            
            self.photons.push(photon);
        }
    }
    
    fn update_photons(&mut self) {
        for photon in &mut self.photons {
            // Simple position update
            photon.x += photon.vx;
            photon.y += photon.vy;
            photon.age += 1;
        }
        
        // Remove expired or out-of-bounds photons
        self.photons.retain(|p| {
            p.age < 1000 &&  // max age
            p.x >= 0.0 && p.y >= 0.0 &&
            p.x < self.world_width && p.y < self.world_height
        });
    }
    
    fn process_photon_collisions(&mut self) {
        let mut photons_to_remove = Vec::new();
        
        for (i, photon) in self.photons.iter_mut().enumerate() {
            let tile_x = (photon.x / TILE_SIZE_PIXELS) as usize;
            let tile_y = (photon.y / TILE_SIZE_PIXELS) as usize;
            
            if let Some(tile) = self.tile_map.get_tile_mut(tile_x, tile_y) {
                match tile.tile_type {
                    TileType::Air => continue, // Pass through
                    TileType::Water => {
                        // Simple water interaction - just slow down
                        photon.vx *= 0.8;
                        photon.vy *= 0.8;
                        photon.intensity *= 0.95; // Small energy loss
                    },
                    TileType::Dirt | TileType::Stone => {
                        // Energy absorption
                        let absorbed_energy = photon.intensity * 0.7; // 70% absorbed
                        let reflected_energy = photon.intensity * 0.3; // 30% reflected
                        
                        // Add absorbed energy to tile
                        tile.light_energy += absorbed_energy;
                        
                        // Check if enough energy to reflect
                        if reflected_energy > 0.1 {
                            photon.intensity = reflected_energy;
                            // Simple random reflection
                            let angle = random() as f32 * 2.0 * std::f32::consts::PI;
                            let speed = (photon.vx * photon.vx + photon.vy * photon.vy).sqrt();
                            photon.vx = speed * angle.cos();
                            photon.vy = speed * angle.sin();
                        } else {
                            photons_to_remove.push(i); // Remove photon (absorbed)
                        }
                    },
                }
            }
        }
        
        // Remove absorbed photons (in reverse order to maintain indices)
        for &i in photons_to_remove.iter().rev() {
            self.photons.remove(i);
        }
    }
    
    fn calculate_tile_brightness(&mut self) {
        for tile in &mut self.tile_map.tiles {
            // Simple brightness calculation
            tile.brightness = if tile.light_energy == 0.0 {
                0.1 // 10% minimum brightness
            } else {
                (tile.light_energy * 0.5).min(1.0) // Cap at 100% brightness
            };
            
            // Temperature follows light energy
            tile.temperature = tile.light_energy * 0.3;
        }
    }
    
    pub fn get_photons_data(&self) -> String {
        // Simple serialization
        let mut data = Vec::new();
        for photon in &self.photons {
            data.push(format!(
                "{{\"x\":{:.2},\"y\":{:.2},\"intensity\":{:.3}}}",
                photon.x, photon.y, photon.intensity
            ));
        }
        format!("[{}]", data.join(","))
    }
    
    pub fn get_light_map_data(&self) -> String {
        // Export tile brightness data
        let mut brightness_data = Vec::new();
        for (i, tile) in self.tile_map.tiles.iter().enumerate() {
            if tile.brightness > 0.1 {
                brightness_data.push(format!(
                    "{{\"index\":{},\"brightness\":{:.3},\"temperature\":{:.3}}}",
                    i, tile.brightness, tile.temperature
                ));
            }
        }
        format!("[{}]", brightness_data.join(","))
    }
}
```

**SIMD Migration Path (Week 3+ Optimization):**
```rust
// When performance becomes important, migrate to this structure:
pub struct PhotonSystemSIMD {
    // Structure of Arrays for SIMD
    x: Vec<f32>,         // All x positions
    y: Vec<f32>,         // All y positions  
    vx: Vec<f32>,        // All x velocities
    vy: Vec<f32>,        // All y velocities
    intensity: Vec<f32>, // All intensities
    active_count: usize,
}

// The migration is straightforward:
// 1. Change Vec<Photon> → PhotonSystemSIMD
// 2. Replace loops with SIMD operations
// 3. Core algorithms stay the same
```

#### Frontend Integration - `public/machi.js`

**New Game Class Properties:**
```javascript
class Game {
    constructor() {
        // ... existing properties ...
        this.lightSystem = {
            enabled: true,
            debugMode: false,
            photonSprites: new Map(),
            lightContainer: null,
            lightMapTextures: new Map(),
            lastLightUpdate: 0,
            lightUpdateInterval: 100, // ms between light updates
        };
    }
}
```

**New Rendering Methods:**
```javascript
// Add to Game class
createLightSystem() {
    this.lightSystem.lightContainer = new PIXI.Container();
    this.worldContainer.addChild(this.lightSystem.lightContainer);
}

renderPhotons(photonsData) {
    // Render photons as short line sprites in debug mode
    // Update existing photon positions
    // Remove expired photons
}

updateTileBrightness(lightMapData) {
    // Apply brightness modulation to tile sprites
    // Use PIXI filters or tint for lighting effects
}
```

### Implementation Roadmap

#### Week 1: Foundation Setup
**WASM Core Development:**
1. **Day 1-2**: Add `Photon` and `LightSource` data structures
2. **Day 3-4**: Implement basic photon spawning and movement
3. **Day 5-7**: Add photon-tile collision detection

**Deliverables:**
- Photons spawn from fixed light source at 30° angle
- Photons move one tile per tick toward tile map
- Basic collision detection with solid tiles (Dirt/Stone)

#### Week 2: Photon Physics & Visualization
**WASM Development:**
1. **Day 1-3**: Implement light absorption mechanics
2. **Day 4-5**: Add diffuse reflection for solid tiles
3. **Day 6-7**: Basic water refraction (simplified)

**Frontend Development:**
1. **Day 1-2**: Create photon rendering system in Pixi.js
2. **Day 3-4**: Add debug mode toggle UI
3. **Day 5-7**: Implement tile brightness rendering

**Deliverables:**
- Photons visible as moving line segments in debug mode
- Tiles accumulate light energy and show brightness changes
- Basic reflection off Dirt/Stone tiles

#### Week 3: Advanced Physics & Optimization
**WASM Development:**
1. **Day 1-3**: Improve reflection with energy loss and diffusion
2. **Day 4-5**: Implement water refraction with proper angle calculation
3. **Day 6-7**: Add convergence mechanics and energy normalization

**Frontend Development:**
1. **Day 1-2**: Performance optimization for photon rendering
2. **Day 3-4**: Enhanced tile brightness shader effects
3. **Day 5-7**: Shadow rendering and visual polish

**Deliverables:**
- Realistic shadows cast by solid tiles
- Water tiles refract light with visible direction changes
- System reaches stable light distribution

#### Week 4: Integration & Polish
**System Integration:**
1. **Day 1-2**: Integration with existing tile placement system
2. **Day 3-4**: Performance testing and optimization
3. **Day 5-7**: Visual polish and debugging tools

**Final Features:**
- Light system works with dynamic tile placement
- Debug UI shows photon statistics and system performance
- Smooth integration with existing camera and UI systems

### Technical Implementation Details

#### Light Source Positioning
```rust
// Position light source outside top-left corner at 30° from Y-axis
fn create_light_source(world_width: f32, world_height: f32) -> LightSource {
    let angle = 30.0_f32.to_radians();
    let source_length = world_width * 1.5; // Wider than world
    
    LightSource {
        start_x: -world_width * 0.3,
        start_y: world_height + world_height * 0.2,
        end_x: -world_width * 0.3 + source_length * angle.cos(),
        end_y: world_height + world_height * 0.2 + source_length * angle.sin(),
        direction_x: angle.sin(),   // 30° from Y-axis
        direction_y: -angle.cos(),  // pointing down and right
        intensity: 1.0,
        photon_spawn_rate: 10.0,    // photons per second per unit length
    }
}
```

#### Photon Lifecycle Management
```rust
impl Photon {
    fn update(&mut self, tile_map: &TileMap) -> PhotonState {
        // Simple position update
        self.x += self.vx;
        self.y += self.vy;
        self.age += 1;
        
        // Check for tile collision
        let tile_x = (self.x / TILE_SIZE_PIXELS) as usize;
        let tile_y = (self.y / TILE_SIZE_PIXELS) as usize;
        
        if let Some(tile) = tile_map.get_tile(tile_x, tile_y) {
            match tile.tile_type {
                TileType::Air => PhotonState::Continue,
                TileType::Water => self.handle_water_interaction(tile),
                TileType::Dirt | TileType::Stone => self.handle_solid_collision(tile),
            }
        } else if self.age > self.max_age {
            PhotonState::Expired
        } else {
            PhotonState::Continue
        }
    }
    
    fn handle_solid_collision(&mut self, tile: &mut Tile) -> PhotonState {
        // Simple energy absorption
        let absorbed_energy = self.intensity * 0.7; // 70% absorbed
        let reflected_energy = self.intensity * 0.3; // 30% reflected
        
        // Add absorbed energy to tile
        tile.light_energy += absorbed_energy;
        
        // Check if enough energy to reflect
        if reflected_energy > 0.1 {
            self.intensity = reflected_energy;
            self.apply_diffuse_reflection();
            PhotonState::Reflected
        } else {
            PhotonState::Absorbed
        }
    }
}
```

#### Rendering Integration
```javascript
// Add to Game.renderFrame()
renderLightSystem(gameStateData) {
    if (!this.lightSystem.enabled) return;
    
    const now = performance.now();
    if (now - this.lightSystem.lastLightUpdate > this.lightSystem.lightUpdateInterval) {
        // Update light simulation in WASM
        this.worker.sendMessage('simulate_light');
        this.lightSystem.lastLightUpdate = now;
    }
    
    // Render photons in debug mode
    if (this.lightSystem.debugMode && gameStateData.photons) {
        this.renderPhotons(gameStateData.photons);
    }
    
    // Update tile brightness
    if (gameStateData.lightMap) {
        this.updateTileBrightness(gameStateData.lightMap);
    }
}
```

### Performance Considerations

#### WASM Optimization
- **Spatial Partitioning**: Use grid-based collision detection for photons
- **Batch Processing**: Update photons in batches to reduce function call overhead
- **Memory Pool**: Reuse photon objects to minimize allocation
- **Update Frequency**: Run light simulation at 10-20 Hz instead of 60 Hz

#### JavaScript Rendering
- **Object Pooling**: Reuse Pixi.js sprites for photons
- **Culling**: Only render photons within camera view
- **LOD**: Reduce photon detail when zoomed out
- **Batching**: Group similar photon sprites for efficient rendering

### Testing Strategy

#### Unit Tests (Rust)
- Photon collision detection accuracy
- Light energy conservation
- Reflection angle calculations
- Water refraction physics

#### Integration Tests
- WASM-JavaScript communication
- Performance under load (1000+ photons)
- Visual correctness of shadows
- System stability over time

#### Visual Debugging Tools
- Photon trajectory visualization
- Energy level heatmaps
- Performance metrics overlay
- Interactive light source positioning

This implementation plan provides a clear roadmap for integrating the Sun Light System into the existing Machi architecture while maintaining performance and visual quality.
