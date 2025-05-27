let wasm;

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder('utf-8') : { encode: () => { throw Error('TextEncoder not available') } } );

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}
/**
 * @param {number} world_width
 * @param {number} world_height
 */
export function init_game(world_width, world_height) {
    wasm.init_game(world_width, world_height);
}

/**
 * @param {number} current_time
 * @returns {string}
 */
export function update_game(current_time) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.update_game(current_time);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

export function add_promiser() {
    wasm.add_promiser();
}

/**
 * @returns {number}
 */
export function get_promiser_count() {
    const ret = wasm.get_promiser_count();
    return ret >>> 0;
}

/**
 * @param {number} id
 */
export function make_promiser_think(id) {
    wasm.make_promiser_think(id);
}

/**
 * @param {number} id
 * @param {string} thought
 */
export function make_promiser_speak(id, thought) {
    const ptr0 = passStringToWasm0(thought, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.make_promiser_speak(id, ptr0, len0);
}

/**
 * @param {number} id
 * @param {string} thought
 * @param {number} target_id
 */
export function make_promiser_whisper(id, thought, target_id) {
    const ptr0 = passStringToWasm0(thought, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.make_promiser_whisper(id, ptr0, len0, target_id);
}

/**
 * @param {number} id
 */
export function make_promiser_run(id) {
    wasm.make_promiser_run(id);
}

/**
 * @returns {number}
 */
export function get_pixel_id() {
    const ret = wasm.get_pixel_id();
    return ret >>> 0;
}

/**
 * @returns {number}
 */
export function get_random_promiser_id() {
    const ret = wasm.get_random_promiser_id();
    return ret >>> 0;
}

export function main() {
    wasm.main();
}

const GameStateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_gamestate_free(ptr >>> 0, 1));

export class GameState {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GameStateFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_gamestate_free(ptr, 0);
    }
    /**
     * @param {number} world_width
     * @param {number} world_height
     */
    constructor(world_width, world_height) {
        const ret = wasm.gamestate_new(world_width, world_height);
        this.__wbg_ptr = ret >>> 0;
        GameStateFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    add_promiser() {
        wasm.gamestate_add_promiser(this.__wbg_ptr);
    }
    /**
     * @param {number} id
     */
    remove_promiser(id) {
        wasm.gamestate_remove_promiser(this.__wbg_ptr, id);
    }
    /**
     * @param {number} current_time
     */
    update(current_time) {
        wasm.gamestate_update(this.__wbg_ptr, current_time);
    }
    /**
     * @returns {string}
     */
    get_state_data() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.gamestate_get_state_data(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get promiser_count() {
        const ret = wasm.gamestate_promiser_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} id
     */
    make_promiser_think(id) {
        wasm.gamestate_make_promiser_think(this.__wbg_ptr, id);
    }
    /**
     * @param {number} id
     * @param {string} thought
     */
    make_promiser_speak(id, thought) {
        const ptr0 = passStringToWasm0(thought, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.gamestate_make_promiser_speak(this.__wbg_ptr, id, ptr0, len0);
    }
    /**
     * @param {number} id
     * @param {string} thought
     * @param {number} target_id
     */
    make_promiser_whisper(id, thought, target_id) {
        const ptr0 = passStringToWasm0(thought, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.gamestate_make_promiser_whisper(this.__wbg_ptr, id, ptr0, len0, target_id);
    }
    /**
     * @param {number} id
     */
    make_promiser_run(id) {
        wasm.gamestate_make_promiser_run(this.__wbg_ptr, id);
    }
    /**
     * @returns {number}
     */
    get_pixel_id() {
        const ret = wasm.gamestate_get_pixel_id(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get_random_promiser_id() {
        const ret = wasm.gamestate_get_random_promiser_id(this.__wbg_ptr);
        return ret >>> 0;
    }
}

const PromiserFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_promiser_free(ptr >>> 0, 1));

export class Promiser {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PromiserFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_promiser_free(ptr, 0);
    }
    /**
     * @param {number} id
     * @param {number} x
     * @param {number} y
     */
    constructor(id, x, y) {
        const ret = wasm.promiser_new(id, x, y);
        this.__wbg_ptr = ret >>> 0;
        PromiserFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    get id() {
        const ret = wasm.promiser_id(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get x() {
        const ret = wasm.promiser_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get y() {
        const ret = wasm.promiser_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get size() {
        const ret = wasm.promiser_size(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get color() {
        const ret = wasm.promiser_color(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get state() {
        const ret = wasm.promiser_state(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    get thought() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.promiser_thought(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get target_id() {
        const ret = wasm.promiser_target_id(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {boolean}
     */
    get is_pixel() {
        const ret = wasm.promiser_is_pixel(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {string} thought
     */
    set_thought(thought) {
        const ptr0 = passStringToWasm0(thought, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.promiser_set_thought(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} thought
     * @param {number} target_id
     */
    set_whisper(thought, target_id) {
        const ptr0 = passStringToWasm0(thought, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.promiser_set_whisper(this.__wbg_ptr, ptr0, len0, target_id);
    }
    start_running() {
        wasm.promiser_start_running(this.__wbg_ptr);
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_log_3e1d3769809ccdf9 = function(arg0, arg1) {
        console.log(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_random_51ee17b1acdb17db = function() {
        const ret = Math.random();
        return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_export_0;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
        ;
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('hello_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
