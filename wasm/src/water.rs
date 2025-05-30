use crate::tile::{TileMap, TileType, MAX_WATER_AMOUNT};

/// Order-independent cellular-automata water step operating directly on the TileMap.
pub fn simulate_water_step(tile_map: &mut TileMap) {
    let w = tile_map.width;
    let h = tile_map.height;
    let len = w * h;

    // Signed changes for each tile (outflow = negative, inflow = positive)
    let mut delta: Vec<i32> = vec![0; len];

    // ─── 1 ░ Gather phase ────────────────────────────────────────────────
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            let tile = &tile_map.tiles[i];

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

            // a) Vertical – gravity first (toward smaller world-y)
            if y > 0 {
                let j = (y - 1) * w + x;
                let below = &tile_map.tiles[j];

                if below.tile_type == TileType::Air ||
                   (below.tile_type == TileType::Water && below.water_amount < MAX_WATER_AMOUNT)
                {
                    let room = MAX_WATER_AMOUNT - below.water_amount;
                    let flow = remaining.min(room);
                    remaining -= flow;
                    push(i, j, flow);
                }
            }

            // b) Horizontal – equalise with neighbours (left & right)
            let neighbours = [
                (x.wrapping_sub(1), y),
                (x + 1,             y),
            ];

            for (nx, ny) in neighbours {
                if nx >= w { continue; }
                let j = ny * w + nx;
                let n_tile = &tile_map.tiles[j];

                if matches!(n_tile.tile_type, TileType::Stone | TileType::Dirt) {
                    continue; // solid wall
                }

                let target = (remaining as i32 + n_tile.water_amount as i32) / 2;
                if remaining as i32 > target {
                    let flow = (remaining as i32 - target) as u16;
                    remaining -= flow;
                    push(i, j, flow);
                }
            }
        }
    }

    // ─── 2 ░ Apply phase ────────────────────────────────────────────────
    for idx in 0..len {
        let change = delta[idx];
        if change == 0 { continue; }

        let t = &mut tile_map.tiles[idx];
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