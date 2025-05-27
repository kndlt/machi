use wasm_bindgen::prelude::*;
use std::collections::HashMap;

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
}

#[wasm_bindgen]
impl Promiser {
    #[wasm_bindgen(constructor)]
    pub fn new(id: u32, x: f64, y: f64) -> Promiser {
        Promiser {
            id,
            x,
            y,
            vx: (random() - 0.5) * 4.0, // Random horizontal velocity between -2 and 2
            vy: -random() * 3.0 - 1.0,   // Random upward velocity between -1 and -4
            size: 5.0 + random() * 10.0, // Size between 5 and 15
            color: ((random() * 0xFFFFFF as f64) as u32) | 0xFF000000, // Random color with full alpha
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
}

impl Promiser {
    fn update(&mut self, world_width: f64, world_height: f64, dt: f64) {
        // Apply gravity to vertical velocity
        const GRAVITY: f64 = 300.0; // Pixels per second squared
        self.vy += GRAVITY * dt;
        
        // Update position based on velocity
        self.x += self.vx * dt * 50.0; // Scale horizontal velocity
        self.y += self.vy * dt * 50.0; // Scale vertical velocity
        
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
        
        // Occasionally add some random horizontal impulse
        if random() < 0.01 {
            self.vx += (random() - 0.5) * 2.0;
        }
        
        // Clamp velocities to reasonable bounds
        self.vx = self.vx.clamp(-4.0, 4.0);
        self.vy = self.vy.clamp(-10.0, 10.0);
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
}

#[wasm_bindgen]
impl GameState {
    #[wasm_bindgen(constructor)]
    pub fn new(world_width: f64, world_height: f64) -> GameState {
        console_log!("Creating new game state with world size: {}x{}", world_width, world_height);
        
        let mut state = GameState {
            promisers: HashMap::new(),
            next_id: 0,
            world_width,
            world_height,
            last_update: 0.0,
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
                "{{\"id\":{},\"x\":{:.2},\"y\":{:.2},\"size\":{:.2},\"color\":{}}}",
                promiser.id,
                promiser.x,
                promiser.y,
                promiser.size,
                promiser.color
            ));
        }
        
        format!("{{\"promisers\":[{}]}}", data.join(","))
    }
    
    #[wasm_bindgen(getter)]
    pub fn promiser_count(&self) -> usize {
        self.promisers.len()
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

// Called when the wasm module is instantiated
#[wasm_bindgen(start)]
pub fn main() {
    console_log!("WASM game module loaded successfully!");
}
