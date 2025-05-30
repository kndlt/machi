// Promiser subsystem (no direct JS exposure – GameState handles serialization)
// If direct JS access is desired later, we can add wasm_bindgen wrappers.

// use wasm_bindgen::prelude::*; // not needed for core logic
use serde::{Serialize, Deserialize};
use crate::tile::{TileMap, TileType, TILE_SIZE_PIXELS};
use crate::random;

#[derive(Clone, Serialize, Deserialize)]
pub struct Promiser {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub size: f64,
    pub color: u32,
    pub state: u32,
    pub thought: String,
    pub target_id: u32,
    pub state_timer: f64,
    pub is_pixel: bool,
}

impl Promiser {
    pub fn new(id: u32, x: f64, y: f64) -> Promiser {
        let is_pixel = id == 0;
        Promiser {
            id,
            x,
            y,
            vx: (random() - 0.5) * 4.0,
            vy: -random() * 3.0 - 1.0,
            size: if is_pixel { 8.0 } else { 5.0 + random() * 10.0 },
            color: if is_pixel { 0xFF00FFFF } else { ((random() * 0xFFFFFF as f64) as u32) | 0xFF000000 },
            state: 0,
            thought: String::new(),
            target_id: 0,
            state_timer: 0.0,
            is_pixel,
        }
    }

    // ----- state mutation helpers -------------------------------------
    pub fn set_thought(&mut self, thought: String) {
        self.thought = thought;
        self.state = 2;
        self.state_timer = 0.0;
    }

    pub fn set_whisper(&mut self, thought: String, target_id: u32) {
        self.thought = thought;
        self.target_id = target_id;
        self.state = 3;
        self.state_timer = 0.0;
    }

    pub fn start_running(&mut self) {
        self.state = 4;
        self.state_timer = 0.0;
        self.vx *= 2.0;
        self.vy *= 1.5;
    }
}

impl Promiser {
    fn pixel_to_tile(pixel_coord: f64) -> usize {
        (pixel_coord / TILE_SIZE_PIXELS).floor() as usize
    }

    fn is_solid_tile(tile_type: TileType) -> bool {
        matches!(tile_type, TileType::Dirt | TileType::Stone)
    }

    fn check_tile_collision(&self, x: f64, y: f64, tile_map: &TileMap) -> bool {
        let left = x - self.size;
        let right = x + self.size;
        let bottom = y - self.size;
        let top = y + self.size;
        let positions = [ (left, bottom), (right, bottom), (left, top), (right, top) ];
        for (px, py) in positions {
            if px < 0.0 || py < 0.0 { continue; }
            let tx = Self::pixel_to_tile(px);
            let ty = Self::pixel_to_tile(py);
            if let Some(tile) = tile_map.get_tile(tx, ty) {
                if Self::is_solid_tile(tile.tile_type) { return true; }
            }
        }
        false
    }

    pub fn update(&mut self, world_width: f64, world_height: f64, dt: f64, tile_map: &TileMap) {
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

        // Apply gravity to vertical velocity (downward is negative because +y is up)
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