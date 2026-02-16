import type { Tile } from "./Tile";

export interface TileMap {
    name: string,
    width: number,
    height: number,
    tiles: Array<Tile | null>
}