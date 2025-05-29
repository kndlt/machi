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
    fn update(&mut self, world_width: f64, world_height: f64, dt: f64) {
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
        self.vy += GRAVITY * dt;
        
        // Adjust movement speed based on state
        let speed_multiplier = match self.state {
            4 => 2.5, // Running is faster
            3 => 0.5, // Whispering is slower
            1 => 0.3, // Thinking is very slow
            _ => 1.0, // Normal speed
        };
        
        // Update position based on velocity
        self.x += self.vx * dt * 50.0 * speed_multiplier; 
        self.y += self.vy * dt * 50.0 * speed_multiplier;
        
        // Bounce off world boundaries
        if self.x <= self.size || self.x >= world_width - self.size {
            self.vx = -self.vx * 0.8; // Add some energy loss on bounce
            self.x = self.x.clamp(self.size, world_width - self.size);
        }
        
        // Ground collision with bounce
        if self.y >= world_height - self.size {
            self.vy = -self.vy * 0.7; // Bounce with energy loss
            self.y = world_height - self.size;
            
            // Add some horizontal friction when on ground
            self.vx *= 0.95;
        }
        
        // Ceiling collision
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
    tile_map: TileMap, // Add tile map to game state
}

#[wasm_bindgen]
impl GameState {
    #[wasm_bindgen(constructor)]
    pub fn new(world_width: f64, world_height: f64) -> GameState {
        console_log!("Creating new game state with world size: {}x{}", world_width, world_height);
        
        // Create a fixed 8x8 tile grid - each tile is 16x16 pixels
        let tile_width = 8;
        let tile_height = 8;
        
        console_log!("Creating tile map with dimensions: {}x{} tiles ({}x{} pixels)", 
                     tile_width, tile_height, tile_width * 16, tile_height * 16);
        
        let mut state = GameState {
            promisers: HashMap::new(),
            next_id: 0,
            world_width,
            world_height,
            last_update: 0.0,
            tile_map: TileMap::new(tile_width, tile_height),
        };
        
        // Create initial promisers
        for _ in 0..20 {
            state.add_promiser();
        }
        
        state
    }
    
    pub fn add_promiser(&mut self) {
        let x = random() * self.world_width;
        let y = random() * (self.world_height * 0.3); // Spawn in upper 30% of screen
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
            promiser.update(self.world_width, self.world_height, dt);
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
            promiser.start_running();
        }
    }
    
    pub fn get_pixel_id(&self) -> u32 {
        for promiser in self.promisers.values() {
            if promiser.is_pixel {
                return promiser.id;
            }
        }
        0 // Return 0 if no Pixel found
    }
    
    pub fn get_random_promiser_id(&self) -> u32 {
        if self.promisers.is_empty() {
            return 0;
        }
        let index = (random() * self.promisers.len() as f64) as usize;
        self.promisers.keys().nth(index).copied().unwrap_or(0)
    }
}

// Global game state instance
static mut GAME_STATE: Option<GameState> = None;

#[wasm_bindgen]
pub fn init_game(world_width: f64, world_height: f64) {
    console_log!("Initializing game with world size: {}x{}", world_width, world_height);
    unsafe {
        GAME_STATE = Some(GameState::new(world_width, world_height));
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

// Called when the wasm module is instantiated
#[wasm_bindgen(start)]
pub fn main() {
    console_log!("WASM game module loaded successfully!");
}


/// MARK - Start of Tile Map Section
/// Inspirations will be taken from Minecraft
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum TileType {
    Air,
    Dirt,
    Stone,
    Water,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tile {
    pub tile_type: TileType,
    pub water_amount: f32, // 0.0 = dry, 1.0 = full
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
            water_amount: 0.0,
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