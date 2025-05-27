/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const __wbg_promiser_free: (a: number, b: number) => void;
export const promiser_new: (a: number, b: number, c: number) => number;
export const promiser_id: (a: number) => number;
export const promiser_x: (a: number) => number;
export const promiser_y: (a: number) => number;
export const promiser_size: (a: number) => number;
export const promiser_color: (a: number) => number;
export const __wbg_gamestate_free: (a: number, b: number) => void;
export const gamestate_new: (a: number, b: number) => number;
export const gamestate_add_promiser: (a: number) => void;
export const gamestate_remove_promiser: (a: number, b: number) => void;
export const gamestate_update: (a: number, b: number) => void;
export const gamestate_get_state_data: (a: number) => [number, number];
export const gamestate_promiser_count: (a: number) => number;
export const init_game: (a: number, b: number) => void;
export const update_game: (a: number) => [number, number];
export const add_promiser: () => void;
export const get_promiser_count: () => number;
export const main: () => void;
export const __wbindgen_export_0: WebAssembly.Table;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_start: () => void;
