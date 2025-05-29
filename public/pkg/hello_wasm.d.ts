/* tslint:disable */
/* eslint-disable */
export function init_game(world_width_tiles: number, world_height_tiles: number): void;
export function update_game(current_time: number): string;
export function add_promiser(): void;
export function get_promiser_count(): number;
export function make_promiser_think(id: number): void;
export function make_promiser_speak(id: number, thought: string): void;
export function make_promiser_whisper(id: number, thought: string, target_id: number): void;
export function make_promiser_run(id: number): void;
export function get_pixel_id(): number;
export function get_random_promiser_id(): number;
export function place_tile(x: number, y: number, tile_type: string): void;
export function get_tile_at(x: number, y: number): string;
export function simulate_water(): void;
export function main(): void;
export class GameState {
  free(): void;
  constructor(world_width_tiles: number, world_height_tiles: number);
  add_promiser(): void;
  remove_promiser(id: number): void;
  update(current_time: number): void;
  get_state_data(): string;
  make_promiser_think(id: number): void;
  make_promiser_speak(id: number, thought: string): void;
  make_promiser_whisper(id: number, thought: string, target_id: number): void;
  make_promiser_run(id: number): void;
  place_tile(x: number, y: number, tile_type: string): void;
  get_tile_at(x: number, y: number): string;
  get_pixel_id(): number;
  get_random_promiser_id(): number;
  /**
   * Order-independent cellular-automata water step.
   */
  simulate_water(): void;
  readonly promiser_count: number;
  readonly tile_map: any;
}
export class Promiser {
  free(): void;
  constructor(id: number, x: number, y: number);
  set_thought(thought: string): void;
  set_whisper(thought: string, target_id: number): void;
  start_running(): void;
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color: number;
  readonly state: number;
  readonly thought: string;
  readonly target_id: number;
  readonly is_pixel: boolean;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_promiser_free: (a: number, b: number) => void;
  readonly promiser_new: (a: number, b: number, c: number) => number;
  readonly promiser_id: (a: number) => number;
  readonly promiser_x: (a: number) => number;
  readonly promiser_y: (a: number) => number;
  readonly promiser_size: (a: number) => number;
  readonly promiser_color: (a: number) => number;
  readonly promiser_state: (a: number) => number;
  readonly promiser_thought: (a: number) => [number, number];
  readonly promiser_target_id: (a: number) => number;
  readonly promiser_is_pixel: (a: number) => number;
  readonly promiser_set_thought: (a: number, b: number, c: number) => void;
  readonly promiser_set_whisper: (a: number, b: number, c: number, d: number) => void;
  readonly promiser_start_running: (a: number) => void;
  readonly __wbg_gamestate_free: (a: number, b: number) => void;
  readonly gamestate_new: (a: number, b: number) => number;
  readonly gamestate_add_promiser: (a: number) => void;
  readonly gamestate_remove_promiser: (a: number, b: number) => void;
  readonly gamestate_update: (a: number, b: number) => void;
  readonly gamestate_get_state_data: (a: number) => [number, number];
  readonly gamestate_promiser_count: (a: number) => number;
  readonly gamestate_tile_map: (a: number) => any;
  readonly gamestate_make_promiser_think: (a: number, b: number) => void;
  readonly gamestate_make_promiser_speak: (a: number, b: number, c: number, d: number) => void;
  readonly gamestate_make_promiser_whisper: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly gamestate_make_promiser_run: (a: number, b: number) => void;
  readonly gamestate_place_tile: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly gamestate_get_tile_at: (a: number, b: number, c: number) => [number, number];
  readonly gamestate_get_pixel_id: (a: number) => number;
  readonly gamestate_get_random_promiser_id: (a: number) => number;
  readonly gamestate_simulate_water: (a: number) => void;
  readonly init_game: (a: number, b: number) => void;
  readonly update_game: (a: number) => [number, number];
  readonly add_promiser: () => void;
  readonly get_promiser_count: () => number;
  readonly make_promiser_think: (a: number) => void;
  readonly make_promiser_speak: (a: number, b: number, c: number) => void;
  readonly make_promiser_whisper: (a: number, b: number, c: number, d: number) => void;
  readonly make_promiser_run: (a: number) => void;
  readonly get_pixel_id: () => number;
  readonly get_random_promiser_id: () => number;
  readonly place_tile: (a: number, b: number, c: number, d: number) => void;
  readonly get_tile_at: (a: number, b: number) => [number, number];
  readonly simulate_water: () => void;
  readonly main: () => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
