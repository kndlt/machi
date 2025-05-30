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

// --- NEW: common scalar alias preferred by simulation ---------------
pub type Float = f32;

// --- NEW: Light-system core data structures -------------------------
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Photon {
    pub x: Float,
    pub y: Float,
    pub vx: Float,
    pub vy: Float,
    pub intensity: Float,
    pub age: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LightSource {
    pub start_x: Float,
    pub start_y: Float,
    pub end_x: Float,
    pub end_y: Float,
    pub direction_x: Float,
    pub direction_y: Float,
    pub intensity: Float,
    pub photon_spawn_rate: Float,
}

fn create_light_source(world_width: Float, world_height: Float) -> LightSource {
    let angle = 30.0_f32.to_radians();
    let source_length = world_width * 1.5;

    LightSource {
        start_x: -world_width * 0.3,
        start_y: world_height + world_height * 0.2,
        end_x: -world_width * 0.3 + source_length * angle.cos(),
        end_y: world_height + world_height * 0.2 + source_length * angle.sin(),
        direction_x: angle.sin(),
        direction_y: -angle.cos(),
        intensity: 1.0,
        photon_spawn_rate: 10.0,
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
            TileType::Dirt | TileType::Stone => true,
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
    last_light_step_ms: f64,
    photons: Vec<Photon>,
    light_source: LightSource,
    tile_map: TileMap, // Add tile map to game state
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
            last_light_step_ms: 0.0,
            photons: Vec::new(),
            light_source: create_light_source(world_width_pixels as Float, world_height_pixels as Float),
            tile_map: TileMap::new(tile_width, tile_height),
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
                    light_energy: 0.0,
                    brightness: 0.0,
                    temperature: 0.0,
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
                    light_energy: 0.0,
                    brightness: 0.0,
                    temperature: 0.0,
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
        
        format!("{{\"promisers\":[{}],\"tile_map\":{}}}", data.join(","), tile_map_json)
    }
    
    // --- NEW: light-system data export stubs ---------------------------
    pub fn get_photons_data(&self) -> String {
        "[]".to_string() // placeholder until light simulation is implemented
    }

    pub fn get_light_map_data(&self) -> String {
        "[]".to_string() // placeholder until light simulation is implemented
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
            _ => TileType::Air, // Default to Air for unknown types
        };
        
        let new_tile = Tile {
            tile_type: tile_type_enum,
            water_amount: if matches!(tile_type_enum, TileType::Water) { MAX_WATER_AMOUNT } else { 0 },
            light_energy: 0.0,
            brightness: 0.0,
            temperature: 0.0,
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
                    }
                }

                // ── b) Horizontal – equalise with neighbours
                // Only move half the height difference to avoid "teleporting"
                let neighbours = [
                    (x.wrapping_sub(1), y),      // left  (wraps harmlessly for x=0)
                    (x + 1,             y),      // right
                ];

                for (nx, ny) in neighbours {
                    if nx >= w { continue; }
                    let j = ny * w + nx;
                    let n_tile = &self.tile_map.tiles[j];

                    if n_tile.tile_type == TileType::Stone || n_tile.tile_type == TileType::Dirt {
                        continue; // solid wall
                    }

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

            // Flip tile_type depending on new water level
            if new_amt == 0 {
                if t.tile_type == TileType::Water {
                    t.tile_type = TileType::Air;
                }
            } else {
                t.tile_type = TileType::Water;
            }

            t.water_amount = new_amt;
        }
    }
}

// Global game state instance
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
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tile {
    pub tile_type: TileType,
    pub water_amount: u16, // 0 = dry, 1024 = full
    // --- NEW: lighting-related fields ---------------------------------
    pub light_energy: Float,
    pub brightness: Float,
    pub temperature: Float,
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
            light_energy: 0.0,
            brightness: 0.0,
            temperature: 0.0,
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

    pub fn get_tile_mut(&mut self, x: usize, y: usize) -> Option<&mut Tile> {
        if x < self.width && y < self.height {
            Some(&mut self.tiles[y * self.width + x])
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