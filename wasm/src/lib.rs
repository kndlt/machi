use wasm_bindgen::prelude::*;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

// ------- sub-modules ---------------------------------------------------
mod tile;
mod promiser;

pub use tile::{Tile, TileType, TileMap, Float};
pub use promiser::Promiser;

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
use crate::tile::{TILE_SIZE_PIXELS, MAX_WATER_AMOUNT};

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

        // Light system step (run every frame for now)
        self.simulate_light();
    }
    
    // ---------------------------------------------------------------------
    // LIGHT SYSTEM ---------------------------------------------------------
    fn simulate_light(&mut self) {
        // 1. Spawn new photons
        let photons_per_frame = (self.light_source.photon_spawn_rate / 60.0) as u32;
        for _ in 0..photons_per_frame {
            let t = random() as Float; // 0.0 - 1.0
            let spawn_x = self.light_source.start_x +
                (self.light_source.end_x - self.light_source.start_x) * t;
            let spawn_y = self.light_source.start_y +
                (self.light_source.end_y - self.light_source.start_y) * t;

            self.photons.push(Photon {
                x: spawn_x,
                y: spawn_y,
                vx: self.light_source.direction_x,
                vy: self.light_source.direction_y,
                intensity: self.light_source.intensity,
                age: 0,
            });
        }

        // 2. Update photon positions & remove old/out-of-bounds later
        for p in &mut self.photons {
            p.x += p.vx;
            p.y += p.vy;
            p.age += 1;
        }

        let world_w = self.world_width as Float;
        let world_h = self.world_height as Float;
        self.photons.retain(|p| {
            p.age < 1000 && p.x >= 0.0 && p.y >= 0.0 && p.x < world_w && p.y < world_h && p.intensity > 0.05
        });

        // 3. Handle collisions / energy deposition
        let mut removals = Vec::new();
        for (idx, photon) in self.photons.iter_mut().enumerate() {
            let tile_x = (photon.x as f64 / TILE_SIZE_PIXELS) as usize;
            let tile_y = (photon.y as f64 / TILE_SIZE_PIXELS) as usize;

            if let Some(tile) = self.tile_map.get_tile_mut(tile_x, tile_y) {
                match tile.tile_type {
                    TileType::Air => {},
                    TileType::Water => {
                        // simple refraction/slowdown
                        photon.vx *= 0.8;
                        photon.vy *= 0.8;
                        photon.intensity *= 0.95;
                    },
                    TileType::Dirt | TileType::Stone => {
                        let absorbed = photon.intensity * 0.7;
                        let reflected = photon.intensity * 0.3;
                        tile.light_energy += absorbed as Float;

                        if reflected > 0.1 {
                            photon.intensity = reflected;
                            // diffuse reflection random dir
                            let angle = (random() as Float) * std::f32::consts::TAU;
                            let speed = (photon.vx * photon.vx + photon.vy * photon.vy).sqrt();
                            photon.vx = speed * angle.cos();
                            photon.vy = speed * angle.sin();
                        } else {
                            removals.push(idx);
                        }
                    },
                }
            } else {
                // out of map (should be caught earlier but just in case)
                removals.push(idx);
            }
        }

        // remove photons marked absorbed (reverse to keep indices valid)
        for i in removals.iter().rev() {
            self.photons.remove(*i);
        }

        // 4. Update tile brightness & temperature
        for tile in &mut self.tile_map.tiles {
            if tile.light_energy == 0.0 {
                tile.brightness = 0.1;
            } else {
                tile.brightness = (tile.light_energy * 0.5).min(1.0);
            }
            tile.temperature = tile.light_energy * 0.3;
            // slowly decay energy for next frame to allow convergence
            tile.light_energy *= 0.95;
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
                promiser.thought.replace("\"", "\\\""),
                promiser.target_id,
                promiser.is_pixel
            ));
        }
        
        // Serialize tile map manually to JSON
        let tile_map_json = serde_json::to_string(&self.tile_map)
            .unwrap_or_else(|_| "null".to_string());
        
        format!("{{\"promisers\":[{}],\"tile_map\":{}}}", data.join(","), tile_map_json)
    }
    
    pub fn get_photons_data(&self) -> String {
        let mut data = Vec::new();
        for p in &self.photons {
            data.push(format!("{{\"x\":{:.1},\"y\":{:.1},\"intensity\":{:.3}}}", p.x, p.y, p.intensity));
        }
        format!("[{}]", data.join(","))
    }

    pub fn get_light_map_data(&self) -> String {
        let mut data = Vec::new();
        for (idx, tile) in self.tile_map.tiles.iter().enumerate() {
            if tile.brightness > 0.1 {
                data.push(format!(
                    "{{\"index\":{},\"brightness\":{:.3},\"temperature\":{:.3}}}",
                    idx, tile.brightness, tile.temperature));
            }
        }
        format!("[{}]", data.join(","))
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
        crate::water::simulate_water_step(&mut self.tile_map);
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

#[wasm_bindgen]
pub fn get_photons_data() -> String {
    unsafe {
        if let Some(ref state) = GAME_STATE {
            state.get_photons_data()
        } else {
            "[]".to_string()
        }
    }
}

#[wasm_bindgen]
pub fn get_light_map_data() -> String {
    unsafe {
        if let Some(ref state) = GAME_STATE {
            state.get_light_map_data()
        } else {
            "[]".to_string()
        }
    }
}

// Called when the wasm module is instantiated
#[wasm_bindgen(start)]
pub fn main() {
    console_log!("WASM game module loaded successfully!");
}

// Water simulation module
mod water;