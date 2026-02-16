import type { Tile } from "./tile";

export interface TileMap {
    name: string,
    width: number,
    height: number,
    tiles: Array<Tile | null>
}