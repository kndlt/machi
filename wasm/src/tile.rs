use serde::{Serialize, Deserialize};

// Common scalar alias for simulation.
pub type Float = f32;

// Coordinate conversion constant (pixels per tile)
pub const TILE_SIZE_PIXELS: f64 = 32.0;

// Fluid simulation constant – full water level per tile.
pub const MAX_WATER_AMOUNT: u16 = 1024;

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
    pub water_amount: u16, // 0 = dry, MAX_WATER_AMOUNT = full
    // Lighting fields
    pub light_energy: Float,
    pub brightness: Float,
    pub temperature: Float,
}

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