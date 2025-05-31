use wasm_bindgen::prelude::*;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

// Import the `console.log` function from the `console` object in the web-sys crate
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
    
    #[wasm_bindgen(js_namespace = Math)]
    fn random() -> f64;
}

// Define a macro to make it easier to call console.log
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

// Constants
const TILE_SIZE_PIXELS: f64 = 32.0;
const MAX_WATER_AMOUNT: u16 = 1024; // Maximum water amount (1024 = full)
const MAX_DIRT_MOISTURE: u16 = 256; // Maximum moisture content for dirt (1/4 of water)
const MIN_FOLIAGE_MOISTURE: u16 = 128; // Minimum moisture needed for foliage growth (half of max)
const FOLIAGE_GROWTH_CHANCE: f64 = 1.0; // Chance per simulation step for foliage to grow
const FOLIAGE_DEATH_MOISTURE: u16 = 64; // Below this moisture, foliage will die

// Light ray constants
const MAX_LIGHT_RAYS: usize = 10000; // Maximum number of active light rays
const RAY_SPEED: f64 = 100.0; // Pixels per second
const RAY_START_EPSILON: f64 = 2.0; // Distance to start ray from boundary

// Light ray structure
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LightRay {
    pub x: f64,        // Current position x
    pub y: f64,        // Current position y  
    pub vx: f64,       // Velocity x (normalized direction * speed)
    pub vy: f64,       // Velocity y (normalized direction * speed)
    pub intensity: f64, // Light intensity (0.0 to 1.0)
}

impl LightRay {
    pub fn new(start_x: f64, start_y: f64, direction_x: f64, direction_y: f64) -> Self {
        // Normalize direction and apply speed
        let length = (direction_x * direction_x + direction_y * direction_y).sqrt();
        let norm_x = if length > 0.0 { direction_x / length } else { 0.0 };
        let norm_y = if length > 0.0 { direction_y / length } else { 1.0 };
        
        LightRay {
            x: start_x, // Use the provided position directly (epsilon already applied)
            y: start_y,
            vx: norm_x * RAY_SPEED,
            vy: norm_y * RAY_SPEED,
            intensity: 1.0,
        }
    }
    
    pub fn update(&mut self, dt: f64) {
        self.x += self.vx * dt;
        self.y += self.vy * dt;
    }
    
    pub fn is_out_of_bounds(&self, world_width: f64, world_height: f64) -> bool {
        self.x < 0.0 || self.x >= world_width || self.y < 0.0 || self.y >= world_height
    }
}

// Promiser entity that moves randomly on a 2D plane
#[wasm_bindgen]
#[derive(Clone)]
pub struct Promiser {
    id: u32,
    x: f64,
    y: f64,
    vx: f64,  // velocity x
    vy: f64,  // velocity y
    size: f64,
    color: u32, // RGB color as hex
    state: u32, // 0=idle, 1=thinking, 2=speaking, 3=whispering, 4=running
    thought: String, // Current thought/message
    target_id: u32, // Target promiser for whispering (0 = none)
    state_timer: f64, // Time in current state
    is_pixel: bool, // Special promiser flag
}

#[wasm_bindgen]
impl Promiser {
    #[wasm_bindgen(constructor)]
    pub fn new(id: u32, x: f64, y: f64) -> Promiser {
        let is_pixel = id == 0; // First promiser is Pixel
        Promiser {
            id,
            x,
            y,
            vx: (random() - 0.5) * 4.0, // Random horizontal velocity between -2 and 2
            vy: -random() * 3.0 - 1.0,   // Random upward velocity between -1 and -4
            size: if is_pixel { 8.0 } else { 5.0 + random() * 10.0 }, // Pixel is slightly larger
            color: if is_pixel { 0xFF00FFFF } else { ((random() * 0xFFFFFF as f64) as u32) | 0xFF000000 }, // Pixel is bright magenta
            state: 0, // Start idle
            thought: String::new(),
            target_id: 0,
            state_timer: 0.0,
            is_pixel,
        }
    }
    
    #[wasm_bindgen(getter)]
    pub fn id(&self) -> u32 { self.id }
    
    #[wasm_bindgen(getter)]
    pub fn x(&self) -> f64 { self.x }
    
    #[wasm_bindgen(getter)]
    pub fn y(&self) -> f64 { self.y }
    
    #[wasm_bindgen(getter)]
    pub fn size(&self) -> f64 { self.size }
    
    #[wasm_bindgen(getter)]
    pub fn color(&self) -> u32 { self.color }
    
    #[wasm_bindgen(getter)]
    pub fn state(&self) -> u32 { self.state }
    
    #[wasm_bindgen(getter)]
    pub fn thought(&self) -> String { self.thought.clone() }
    
    #[wasm_bindgen(getter)]
    pub fn target_id(&self) -> u32 { self.target_id }
    
    #[wasm_bindgen(getter)]
    pub fn is_pixel(&self) -> bool { self.is_pixel }
    
    pub fn set_thought(&mut self, thought: String) {
        self.thought = thought;
        self.state = 2; // Set to speaking state
        self.state_timer = 0.0;
    }
    
    pub fn set_whisper(&mut self, thought: String, target_id: u32) {
        self.thought = thought;
        self.target_id = target_id;
        self.state = 3; // Set to whispering state
        self.state_timer = 0.0;
    }
    
    pub fn start_running(&mut self) {
        self.state = 4; // Set to running state
        self.state_timer = 0.0;
        // Increase velocity when running
        self.vx *= 2.0;
        self.vy *= 1.5;
    }
}

impl Promiser {
    // Helper method to convert pixel coordinates to tile coordinates
    fn pixel_to_tile(pixel_coord: f64) -> usize {
        (pixel_coord / TILE_SIZE_PIXELS).floor() as usize
    }
    
    // Helper method to check if a tile is solid (blocks movement)
    fn is_solid_tile(tile_type: TileType) -> bool {
        match tile_type {
            TileType::Dirt | TileType::Stone | TileType::Foliage => true,
            TileType::Air | TileType::Water => false,
        }
    }
    
    // Check if the promiser would collide with solid tiles at given position
    fn check_tile_collision(&self, x: f64, y: f64, tile_map: &TileMap) -> bool {
        // Check the four corners of the promiser's bounding box
        let left = x - self.size;
        let right = x + self.size;
        let bottom = y - self.size;
        let top = y + self.size;
        
        let positions = [
            (left, bottom),   // bottom-left
            (right, bottom),  // bottom-right
            (left, top),      // top-left
            (right, top),     // top-right
        ];
        
        for (px, py) in positions {
            if px < 0.0 || py < 0.0 { continue; }
            
            let tile_x = Self::pixel_to_tile(px);
            let tile_y = Self::pixel_to_tile(py);
            
            if let Some(tile) = tile_map.get_tile(tile_x, tile_y) {
                if Self::is_solid_tile(tile.tile_type) {
                    return true;
                }
            }
        }
        
        false
    }

    fn update(&mut self, world_width: f64, world_height: f64, dt: f64, tile_map: &TileMap) {
        // Update state timer
        self.state_timer += dt;
        
        // Handle state transitions
        match self.state {
            0 => { // Idle
                if random() < 0.002 { // 0.2% chance per frame to start thinking
                    self.state = 1;
                    self.state_timer = 0.0;
                }
            },
            1 => { // Thinking
                if self.state_timer > 2.0 + random() * 3.0 { // Think for 2-5 seconds
                    self.state = 0; // Return to idle
                    self.state_timer = 0.0;
                }
            },
            2 => { // Speaking
                if self.state_timer > 3.0 + random() * 2.0 { // Speak for 3-5 seconds
                    self.state = 0; // Return to idle
                    self.thought.clear();
                    self.state_timer = 0.0;
                }
            },
            3 => { // Whispering
                if self.state_timer > 1.0 + random() * 1.0 { // Whisper for 1-2 seconds
                    self.state = 0; // Return to idle
                    self.thought.clear();
                    self.target_id = 0;
                    self.state_timer = 0.0;
                }
            },
            4 => { // Running
                if self.state_timer > 2.0 + random() * 3.0 { // Run for 2-5 seconds
                    self.state = 0; // Return to idle
                    self.state_timer = 0.0;
                    // Reduce velocity after running
                    self.vx *= 0.6;
                    self.vy *= 0.8;
                }
            },
            _ => self.state = 0, // Reset unknown states
        }
        
        // Apply gravity to vertical velocity
        const GRAVITY: f64 = 300.0; // Pixels per second squared
        self.vy -= GRAVITY * dt;
        
        // Adjust movement speed based on state
        let speed_multiplier = match self.state {
            4 => 2.5, // Running is faster
            3 => 0.5, // Whispering is slower
            1 => 0.3, // Thinking is very slow
            _ => 1.0, // Normal speed
        };
        
        // Store old position for collision resolution
        let old_x = self.x;
        let old_y = self.y;
        
        // Calculate new position based on velocity
        let new_x = self.x + self.vx * dt * 50.0 * speed_multiplier;
        let new_y = self.y + self.vy * dt * 50.0 * speed_multiplier;
        
        // Check horizontal movement first
        self.x = new_x;
        if self.check_tile_collision(self.x, self.y, tile_map) {
            // Collision on horizontal movement - bounce and reset x
            self.vx = -self.vx * 0.5; // Bounce with energy loss
            self.x = old_x;
        }
        
        // Check vertical movement
        self.y = new_y;
        if self.check_tile_collision(self.x, self.y, tile_map) {
            // Collision on vertical movement
            if self.vy < 0.0 {
                // Falling down and hit something - land on tile
                self.vy = 0.0;
                self.y = old_y;
                // Add horizontal friction when landing on tiles
                self.vx *= 0.85;
            } else {
                // Moving up and hit something - bounce down
                self.vy = -self.vy * 0.3;
                self.y = old_y;
            }
        }
        
        // Bounce off world boundaries
        if self.x <= self.size || self.x >= world_width - self.size {
            self.vx = -self.vx * 0.8; // Add some energy loss on bounce
            self.x = self.x.clamp(self.size, world_width - self.size);
        }
        
        // Ground collision with bounce (world bottom)
        if self.y >= world_height - self.size {
            self.vy = -self.vy * 0.7; // Bounce with energy loss
            self.y = world_height - self.size;
            
            // Add some horizontal friction when on ground
            self.vx *= 0.95;
        }
        
        // Ceiling collision (world top)
        if self.y <= self.size {
            self.vy = -self.vy * 0.5;
            self.y = self.size;
        }
        
        // Occasionally add some random horizontal impulse (except when thinking)
        if self.state != 1 && random() < 0.01 {
            self.vx += (random() - 0.5) * 2.0;
        }
        
        // Clamp velocities to reasonable bounds
        let max_vx = if self.state == 4 { 6.0 } else { 4.0 };
        let max_vy = if self.state == 4 { 15.0 } else { 10.0 };
        self.vx = self.vx.clamp(-max_vx, max_vx);
        self.vy = self.vy.clamp(-max_vy, max_vy);
    }
}

// Game state containing all promisers
#[wasm_bindgen]
pub struct GameState {
    promisers: HashMap<u32, Promiser>,
    next_id: u32,
    world_width: f64,
    world_height: f64,
    last_update: f64,
    tick_count: u64,
    tile_map: TileMap, // Add tile map to game state
    light_rays: Vec<LightRay>, // Light rays for rendering
}

#[wasm_bindgen]
impl GameState {
    #[wasm_bindgen(constructor)]
    pub fn new(world_width_tiles: f64, world_height_tiles: f64) -> GameState {
        console_log!("Creating new game state with world size: {}x{} tiles", world_width_tiles, world_height_tiles);
        
        // Convert tile dimensions to pixel dimensions
        let world_width_pixels = world_width_tiles * TILE_SIZE_PIXELS;
        let world_height_pixels = world_height_tiles * TILE_SIZE_PIXELS;
        
        console_log!("World size in pixels: {}x{}", world_width_pixels, world_height_pixels);
        
        let tile_width = world_width_tiles as usize;
        let tile_height = world_height_tiles as usize;
        
        console_log!("Creating tile map with dimensions: {}x{} tiles ({}x{} pixels)", 
                     tile_width, tile_height, world_width_pixels, world_height_pixels);
        
        let mut state = GameState {
            promisers: HashMap::new(),
            next_id: 0,
            world_width: world_width_pixels,
            world_height: world_height_pixels,
            last_update: 0.0,
            tick_count: 0,
            tile_map: TileMap::new(tile_width, tile_height),
            light_rays: Vec::new(),
        };
        
        // Create initial promisers
        for _ in 0..20 {
            state.add_promiser();
        }
        
        // Add some initial water tiles for testing water simulation
        // First, create some dirt ground at the bottom for water to settle on (y=0 is bottom)
        for x in 0..tile_width {
            for y in 0..3 {
                state.tile_map.set_tile(x, y, Tile {
                    tile_type: TileType::Dirt,
                    water_amount: 0,
                });
            }
        }
        
        // Place water at the center for testing gravity (it should fall down to smaller y values)
        let center_x = tile_width / 2;
        let center_y = tile_height / 2;
        let water_size = 6; // 6x6 water block
        
        for x in (center_x.saturating_sub(water_size/2))..(center_x + water_size/2 + 1).min(tile_width) {
            for y in (center_y)..(center_y + 6).min(tile_height) {
                state.tile_map.set_tile(x, y, Tile {
                    tile_type: TileType::Water,
                    water_amount: MAX_WATER_AMOUNT,
                });
            }
        }

        state
    }
    
    pub fn add_promiser(&mut self) {
        let x = random() * self.world_width;
        let y = self.world_height; // Start from world's pixel height (top of world)
        let promiser = Promiser::new(self.next_id, x, y);
        self.promisers.insert(self.next_id, promiser);
        self.next_id += 1;
    }
    
    pub fn remove_promiser(&mut self, id: u32) {
        self.promisers.remove(&id);
    }
    
    pub fn update(&mut self, current_time: f64) {
        let dt = if self.last_update == 0.0 {
            0.016 // First frame, assume 60fps
        } else {
            (current_time - self.last_update) / 1000.0 // Convert ms to seconds
        };
        
        self.last_update = current_time;

        // Update all promisers
        for promiser in self.promisers.values_mut() {
            promiser.update(self.world_width, self.world_height, dt, &self.tile_map);
        }
    }

    /// Simple tick function that handles all internal updates
    pub fn tick(&mut self) {
        // Use a fixed timestep for consistent simulation
        let dt = 1.0 / 60.0; // 60fps
        
        // Update all promisers
        for promiser in self.promisers.values_mut() {
            promiser.update(self.world_width, self.world_height, dt, &self.tile_map);
        }
        
        // Internal timing for water simulation (every 6 ticks ≈ 100ms at 60fps)
        if self.tick_count % 6 == 0 {
            self.simulate_water();
        }
         // Internal timing for foliage simulation (every 60 ticks ≈ 1 second at 60fps)
        if self.tick_count % 60 == 0 {
            self.simulate_foliage();
        }
        
        // Update light rays every tick (for smooth movement)
        self.update_light_rays(dt);
        
        // Generate new light rays (maintain 10000 rays)
        if self.tick_count % 6 == 0 { // Generate new rays every 6 ticks (≈ 100ms at 60fps)
            self.generate_light_rays();
        }

        self.tick_count = self.tick_count.wrapping_add(1);
    }

    /// Generate new light rays from boundary locations to maintain target count
    fn generate_light_rays(&mut self) {
        let current_count = self.light_rays.len();
        if current_count >= MAX_LIGHT_RAYS {
            return;
        }
        
        let rays_to_generate = (MAX_LIGHT_RAYS - current_count).min(100); // Generate at most 100 per call
        
        for _ in 0..rays_to_generate {
            // Choose a random boundary location to spawn from
            let boundary_side = (random() * 4.0) as u32; // 0=top, 1=right, 2=bottom, 3=left
            
            let (start_x, start_y, direction_x, direction_y) = match boundary_side {
                0 => {
                    // Top boundary - spawn from top, pointing down
                    let x = random() * self.world_width;
                    let y = self.world_height;
                    (x, y, 0.0, -1.0)
                },
                1 => {
                    // Right boundary - spawn from right, pointing left
                    let x = self.world_width;
                    let y = random() * self.world_height;
                    (x, y, -1.0, 0.0)
                },
                2 => {
                    // Bottom boundary - spawn from bottom, pointing up
                    let x = random() * self.world_width;
                    let y = 0.0;
                    (x, y, 0.0, 1.0)
                },
                _ => {
                    // Left boundary - spawn from left, pointing right
                    let x = 0.0;
                    let y = random() * self.world_height;
                    (x, y, 1.0, 0.0)
                }
            };
            
            // Move spawn position slightly inward from boundary
            let actual_start_x = start_x + direction_x * RAY_START_EPSILON;
            let actual_start_y = start_y + direction_y * RAY_START_EPSILON;
            
            // Check if spawn position is valid (within bounds and not in solid tile)
            if !self.is_valid_spawn_position(actual_start_x, actual_start_y) {
                continue; // Skip this ray and try again
            }
            
            // Add full 360 degree randomness to direction
            let angle_variation = random() * 2.0 * 3.14159; // 0 to 2π radians (360 degrees)
            let cos_var = angle_variation.cos();
            let sin_var = angle_variation.sin();
            
            let final_dx = cos_var;
            let final_dy = sin_var;
            
            let light_ray = LightRay::new(actual_start_x, actual_start_y, final_dx, final_dy);
            self.light_rays.push(light_ray);
        }
    }

    /// Check if a position is valid for spawning a light ray
    /// Returns false if position is out of bounds or inside a solid tile
    fn is_valid_spawn_position(&self, x: f64, y: f64) -> bool {
        // Check bounds
        if x < 0.0 || x >= self.world_width || y < 0.0 || y >= self.world_height {
            return false;
        }
        
        // Check tile at position
        let tile_x = (x / TILE_SIZE_PIXELS).floor() as usize;
        let tile_y = (y / TILE_SIZE_PIXELS).floor() as usize;
        
        if let Some(tile) = self.tile_map.get_tile(tile_x, tile_y) {
            match tile.tile_type {
                TileType::Air | TileType::Water => true, // Allow spawning in air and water
                TileType::Dirt | TileType::Stone | TileType::Foliage => false, // Don't spawn in solid tiles
            }
        } else {
            false // No tile data available, consider invalid
        }
    }

    /// Update light ray positions and handle collisions with tiles
    fn update_light_rays(&mut self, dt: f64) {
        let mut rays_to_remove = Vec::new();
        
        for (i, ray) in self.light_rays.iter_mut().enumerate() {
            // Update ray position
            ray.update(dt);
            
            // Check if ray is out of bounds
            if ray.is_out_of_bounds(self.world_width, self.world_height) {
                rays_to_remove.push(i);
                continue;
            }
            
            // Check for tile collision
            let tile_x = (ray.x / TILE_SIZE_PIXELS).floor() as usize;
            let tile_y = (ray.y / TILE_SIZE_PIXELS).floor() as usize;
            
            if let Some(tile) = self.tile_map.get_tile(tile_x, tile_y) {
                match tile.tile_type {
                    TileType::Air => {
                        // Ray passes through air - no collision
                        continue;
                    },
                    TileType::Water => {
                        // Water partially absorbs and slows down light
                        ray.intensity *= 0.95; // Small energy loss
                        ray.vx *= 0.9; // Slow down
                        ray.vy *= 0.9;
                        
                        // Remove ray if intensity too low
                        if ray.intensity < 0.1 {
                            rays_to_remove.push(i);
                        }
                    },
                    TileType::Dirt | TileType::Stone | TileType::Foliage => {
                        // Solid tiles absorb or reflect light
                        if random() < 0.3 {
                            // 30% chance to reflect with random direction
                            let angle = random() * 2.0 * std::f64::consts::PI;
                            let speed = (ray.vx * ray.vx + ray.vy * ray.vy).sqrt() * 0.7; // Reduce speed on reflection
                            ray.vx = speed * angle.cos();
                            ray.vy = speed * angle.sin();
                            ray.intensity *= 0.5; // Lose energy on reflection
                            
                            // Remove if too weak
                            if ray.intensity < 0.1 {
                                rays_to_remove.push(i);
                            }
                        } else {
                            // 70% chance to be absorbed
                            rays_to_remove.push(i);
                        }
                    }
                }
            }
        }
        
        // Remove rays in reverse order to maintain indices
        for &i in rays_to_remove.iter().rev() {
            self.light_rays.remove(i);
        }
    }
    
    // Get compact representation for rendering
    pub fn get_state_data(&self) -> String {
        let mut data = Vec::new();
        
        for promiser in self.promisers.values() {
            data.push(format!(
                "{{\"id\":{},\"x\":{:.2},\"y\":{:.2},\"size\":{:.2},\"color\":{},\"state\":{},\"thought\":\"{}\",\"target_id\":{},\"is_pixel\":{}}}",
                promiser.id,
                promiser.x,
                promiser.y,
                promiser.size,
                promiser.color,
                promiser.state,
                promiser.thought.replace("\"", "\\\""), // Escape quotes
                promiser.target_id,
                promiser.is_pixel
            ));
        }
        
        // Serialize tile map manually to JSON
        let tile_map_json = serde_json::to_string(&self.tile_map)
            .unwrap_or_else(|_| "null".to_string());
        
        // Serialize light rays
        let mut light_ray_data = Vec::new();
        for ray in &self.light_rays {
            light_ray_data.push(format!(
                "{{\"x\":{:.2},\"y\":{:.2},\"vx\":{:.2},\"vy\":{:.2},\"intensity\":{:.2}}}",
                ray.x, ray.y, ray.vx, ray.vy, ray.intensity
            ));
        }
        
        format!("{{\"promisers\":[{}],\"tile_map\":{},\"light_rays\":[{}]}}", 
                data.join(","), tile_map_json, light_ray_data.join(","))
    }
    
    #[wasm_bindgen(getter)]
    pub fn promiser_count(&self) -> usize {
        self.promisers.len()
    }
    
    #[wasm_bindgen(getter)]
    pub fn tile_map(&self) -> JsValue {
        // Serialize the tile map to JsValue for JS interop
        serde_wasm_bindgen::to_value(&self.tile_map).unwrap()
    }
    
    pub fn make_promiser_think(&mut self, id: u32) {
        if let Some(promiser) = self.promisers.get_mut(&id) {
            promiser.state = 1; // Thinking
            promiser.state_timer = 0.0;
        }
    }
    
    pub fn make_promiser_speak(&mut self, id: u32, thought: String) {
        if let Some(promiser) = self.promisers.get_mut(&id) {
            promiser.set_thought(thought);
        }
    }
    
    pub fn make_promiser_whisper(&mut self, id: u32, thought: String, target_id: u32) {
        if let Some(promiser) = self.promisers.get_mut(&id) {
            promiser.set_whisper(thought, target_id);
        }
    }
    
    pub fn make_promiser_run(&mut self, id: u32) {
        if let Some(promiser) = self.promisers.get_mut(&id) {
            promiser.state = 3; // Running
            promiser.state_timer = 0.0;
        }
    }

    // Tile manipulation methods
    pub fn place_tile(&mut self, x: usize, y: usize, tile_type: String) {
        let tile_type_enum = match tile_type.as_str() {
            "Dirt" => TileType::Dirt,
            "Stone" => TileType::Stone,
            "Water" => TileType::Water,
            "Air" => TileType::Air,
            "Foliage" => TileType::Foliage,
            _ => TileType::Air, // Default to Air for unknown types
        };
        
        let new_tile = Tile {
            tile_type: tile_type_enum,
            water_amount: if matches!(tile_type_enum, TileType::Water) { MAX_WATER_AMOUNT } else { 0 },
        };
        
        self.tile_map.set_tile(x, y, new_tile);
        console_log!("Placed {} tile at ({}, {})", tile_type, x, y);
    }

    pub fn get_tile_at(&self, x: usize, y: usize) -> String {
        if let Some(tile) = self.tile_map.get_tile(x, y) {
            match tile.tile_type {
                TileType::Dirt => "Dirt".to_string(),
                TileType::Stone => "Stone".to_string(),
                TileType::Water => "Water".to_string(),
                TileType::Air => "Air".to_string(),
                TileType::Foliage => "Foliage".to_string(),
            }
        } else {
            "Air".to_string() // Default to Air for out-of-bounds
        }
    }

    pub fn get_pixel_id(&self) -> u32 {
        // Return the ID of the first promiser with is_pixel=true, or 0 if none found
        for promiser in self.promisers.values() {
            if promiser.is_pixel {
                return promiser.id;
            }
        }
        0 // No pixel found
    }

    pub fn get_random_promiser_id(&self) -> u32 {
        if self.promisers.is_empty() {
            return 0;
        }
        
        let promiser_ids: Vec<u32> = self.promisers.keys().cloned().collect();
        let random_index = (random() * promiser_ids.len() as f64) as usize;
        promiser_ids.get(random_index).copied().unwrap_or(0)
    }

    /// Order-independent cellular-automata water step.
    pub fn simulate_water(&mut self) {
        let w  = self.tile_map.width;
        let h  = self.tile_map.height;
        let len = w * h;

        // Signed changes for each tile (outflow = negative, inflow = positive)
        let mut delta: Vec<i32> = vec![0; len];

        // --- 1 ░ Gather phase -------------------------------------------------
        for y in 0..h {
            for x in 0..w {
                let i = y * w + x;
                let tile = &self.tile_map.tiles[i];

                // Only flowing water can move
                if tile.tile_type != TileType::Water || tile.water_amount == 0 {
                    continue;
                }

                let mut remaining = tile.water_amount;

                // helper to register a flow
                let mut push = |from_idx: usize, to_idx: usize, amount: u16| {
                    if amount == 0 { return; }
                    delta[from_idx] -= amount as i32;
                    delta[to_idx]   += amount as i32;
                };

                // ── a) Vertical – gravity first (toward smaller world-y)
                if y > 0 {
                    let j = (y - 1) * w + x;
                    let below = &self.tile_map.tiles[j];

                    if below.tile_type == TileType::Air ||
                       (below.tile_type == TileType::Water &&
                        below.water_amount < MAX_WATER_AMOUNT)
                    {
                        let room   = MAX_WATER_AMOUNT - below.water_amount;
                        let flow   = remaining.min(room);
                        remaining -= flow;
                        push(i, j, flow);
                    } else if below.tile_type == TileType::Dirt {
                        // Water can seep into dirt below due to gravity
                        let current_moisture = below.water_amount;
                        if current_moisture < MAX_DIRT_MOISTURE && remaining > 0 {
                            // Vertical seepage can be faster than horizontal due to gravity
                            let seepage_rate = 4; // Higher rate for downward seepage
                            let max_seepage = (MAX_DIRT_MOISTURE - current_moisture).min(seepage_rate).min(remaining);
                            if max_seepage > 0 {
                                remaining -= max_seepage;
                                push(i, j, max_seepage);
                            }
                        }
                    }
                }

                // ── b) Horizontal – equalise with neighbours
                // Only move half the height difference to avoid “teleporting”
                let neighbours = [
                    (x.wrapping_sub(1), y),      // left  (wraps harmlessly for x=0)
                    (x + 1,             y),      // right
                ];

                for (nx, ny) in neighbours {
                    if nx >= w { continue; }
                    let j = ny * w + nx;
                    let n_tile = &self.tile_map.tiles[j];

                    // Stone blocks water completely
                    if n_tile.tile_type == TileType::Stone {
                        continue;
                    }

                    // Handle water seepage into dirt
                    if n_tile.tile_type == TileType::Dirt {
                        
                        // Water can seep into dirt slowly
                        let current_moisture = n_tile.water_amount; 
                        if current_moisture < MAX_DIRT_MOISTURE && remaining > 0 {
                            // Slow seepage - only small amounts at a time
                            let seepage_rate = 2; // Units per simulation step
                            let max_seepage = (MAX_DIRT_MOISTURE - current_moisture).min(seepage_rate).min(remaining);
                            if max_seepage > 0 {
                                remaining -= max_seepage;
                                push(i, j, max_seepage);
                            }
                        }
                        continue; 
                    }

                    // Regular water flow for air and water tiles
                    let target = (remaining as i32 + n_tile.water_amount as i32) / 2;
                    if remaining as i32 > target {
                        let flow = (remaining as i32 - target) as u16;
                        remaining -= flow;
                        push(i, j, flow);
                    }
                }

                // ── c) Optional small upflow (pressure equalisation) -------------
                // Not strictly needed – comment out if you want one-way gravity.
            }
        }

        // --- 2 ░ Apply phase ---------------------------------------------------
        for idx in 0..len {
            let change = delta[idx];
            if change == 0 { continue; }

            let t = &mut self.tile_map.tiles[idx];
            let new_amt = (t.water_amount as i32 + change)
                .clamp(0, MAX_WATER_AMOUNT as i32) as u16;

            // Handle tile type transitions based on water content
            match t.tile_type {
                TileType::Water => {
                    if new_amt == 0 {
                        t.tile_type = TileType::Air;
                    }
                },
                TileType::Dirt => {
                    // Dirt can absorb water but stays dirt (just becomes moist)
                    // No tile type change needed
                },
                TileType::Air => {
                    if new_amt > 0 {
                        t.tile_type = TileType::Water;
                    }
                },
                TileType::Stone => {
                    // Stone doesn't change type
                },
                TileType::Foliage => {
                    // Foliage doesn't absorb water but can be destroyed if dry
                    // For now, foliage is stable
                },
            }

            t.water_amount = new_amt;
        }
    }

    /// Simulate foliage growth and death based on dirt moisture levels
    pub fn simulate_foliage(&mut self) {
        let w = self.tile_map.width;
        let h = self.tile_map.height;
        
        // Collect changes to apply after scanning
        let mut changes: Vec<(usize, usize, TileType)> = Vec::new();
        
        for y in 0..h {
            for x in 0..w {
                let i = y * w + x;
                let tile = &self.tile_map.tiles[i];
                
                match tile.tile_type {
                    TileType::Dirt => {
                        // Check if dirt has enough moisture to grow foliage
                        if tile.water_amount >= MIN_FOLIAGE_MOISTURE {
                            // Check if there's space above for foliage (if not at top edge)
                            if y + 1 < h {
                                let above_idx = (y + 1) * w + x;
                                let above_tile = &self.tile_map.tiles[above_idx];
                                
                                // Only grow foliage on air tiles above dirt
                                if above_tile.tile_type == TileType::Air && random() < FOLIAGE_GROWTH_CHANCE {
                                    // Schedule foliage growth above the dirt
                                    changes.push((x, y + 1, TileType::Foliage));
                                }
                            }
                        }
                    },
                    TileType::Foliage => {
                        // Check if foliage should die due to lack of moisture in dirt below
                        if y > 0 {
                            let below_idx = (y - 1) * w + x;
                            let below_tile = &self.tile_map.tiles[below_idx];
                            
                            // Foliage dies if the dirt below doesn't have enough moisture
                            if below_tile.tile_type == TileType::Dirt && 
                               below_tile.water_amount < FOLIAGE_DEATH_MOISTURE {
                                changes.push((x, y, TileType::Air));
                            }
                        } else {
                            // Foliage at ground level (y=0) dies immediately (no soil support)
                            changes.push((x, y, TileType::Air));
                        }
                    },
                    _ => {
                        // Other tile types don't participate in foliage simulation
                    }
                }
            }
        }
        
        // Apply all changes
        for (x, y, new_type) in changes {
            let new_tile = Tile {
                tile_type: new_type,
                water_amount: 0, // Foliage and air don't store water
            };
            self.tile_map.set_tile(x, y, new_tile);
            
            match new_type {
                TileType::Foliage => console_log!("🌱 Foliage grew at ({}, {})", x, y),
                TileType::Air => console_log!("🍂 Foliage died at ({}, {})", x, y),
                _ => {}
            }
        }
    }
}

/// Global game state instance
static mut GAME_STATE: Option<GameState> = None;

#[wasm_bindgen]
pub fn init_game(world_width_tiles: f64, world_height_tiles: f64) {
    console_log!("Initializing game with world size: {}x{} tiles", world_width_tiles, world_height_tiles);
    unsafe {
        GAME_STATE = Some(GameState::new(world_width_tiles, world_height_tiles));
    }
}

#[wasm_bindgen]
pub fn update_game(current_time: f64) -> String {
    unsafe {
        if let Some(ref mut state) = GAME_STATE {
            state.update(current_time);
            state.get_state_data()
        } else {
            "{}".to_string()
        }
    }
}

#[wasm_bindgen]
pub fn tick() -> String {
    unsafe {
        if let Some(ref mut state) = GAME_STATE {
            state.tick();
            state.get_state_data()
        } else {
            "{}".to_string()
        }
    }
}

#[wasm_bindgen]
pub fn add_promiser() {
    unsafe {
        if let Some(ref mut state) = GAME_STATE {
            state.add_promiser();
        }
    }
}

#[wasm_bindgen]
pub fn get_promiser_count() -> usize {
    unsafe {
        if let Some(ref state) = GAME_STATE {
            state.promiser_count()
        } else {
            0
        }
    }
}

#[wasm_bindgen]
pub fn make_promiser_think(id: u32) {
    unsafe {
        if let Some(ref mut state) = GAME_STATE {
            state.make_promiser_think(id);
        }
    }
}

#[wasm_bindgen]
pub fn make_promiser_speak(id: u32, thought: String) {
    unsafe {
        if let Some(ref mut state) = GAME_STATE {
            state.make_promiser_speak(id, thought);
        }
    }
}

#[wasm_bindgen]
pub fn make_promiser_whisper(id: u32, thought: String, target_id: u32) {
    unsafe {
        if let Some(ref mut state) = GAME_STATE {
            state.make_promiser_whisper(id, thought, target_id);
        }
    }
}

#[wasm_bindgen]
pub fn make_promiser_run(id: u32) {
    unsafe {
        if let Some(ref mut state) = GAME_STATE {
            state.make_promiser_run(id);
        }
    }
}

#[wasm_bindgen]
pub fn get_pixel_id() -> u32 {
    unsafe {
        if let Some(ref state) = GAME_STATE {
            state.get_pixel_id()
        } else {
            0
        }
    }
}

#[wasm_bindgen]
pub fn get_random_promiser_id() -> u32 {
    unsafe {
        if let Some(ref state) = GAME_STATE {
            state.get_random_promiser_id()
        } else {
            0
        }
    }
}

#[wasm_bindgen]
pub fn place_tile(x: usize, y: usize, tile_type: String) {
    unsafe {
        if let Some(ref mut state) = GAME_STATE {
            state.place_tile(x, y, tile_type);
        }
    }
}

#[wasm_bindgen]
pub fn get_tile_at(x: usize, y: usize) -> String {
    unsafe {
        if let Some(ref state) = GAME_STATE {
            state.get_tile_at(x, y)
        } else {
            "Air".to_string()
        }
    }
}

#[wasm_bindgen]
pub fn simulate_water() {
    unsafe {
        if let Some(ref mut state) = GAME_STATE {
            state.simulate_water();
        }
    }
}

#[wasm_bindgen]
pub fn simulate_foliage() {
    unsafe {
        if let Some(ref mut state) = GAME_STATE {
            state.simulate_foliage();
        }
    }
}

// Called when the wasm module is instantiated
#[wasm_bindgen(start)]
pub fn main() {
    console_log!("WASM game module loaded successfully!");
}


/// MARK - Start of Tile Map Section
/// Inspirations will be taken from Minecraft
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum TileType {
    Air,
    Dirt,
    Stone,
    Water,
    Foliage,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tile {
    pub tile_type: TileType,
    pub water_amount: u16, // 0 = dry, 1024 = full
}

// Tile map structure
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TileMap {
    pub width: usize,
    pub height: usize,
    pub tiles: Vec<Tile>,
}
impl TileMap {
    pub fn new(width: usize, height: usize) -> Self {
        let tiles = vec![Tile {
            tile_type: TileType::Air,
            water_amount: 0,
        }; width * height];
        TileMap { width, height, tiles }
    }

    pub fn get_tile(&self, x: usize, y: usize) -> Option<&Tile> {
        if x < self.width && y < self.height {
            Some(&self.tiles[y * self.width + x])
        } else {
            None
        }
    }

    pub fn set_tile(&mut self, x: usize, y: usize, tile: Tile) {
        if x < self.width && y < self.height {
            self.tiles[y * self.width + x] = tile;
        }
    }
}