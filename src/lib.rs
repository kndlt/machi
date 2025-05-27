use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[wasm_bindgen]
pub fn hello_world() -> String {
    console_log!("Hello from Rust!");
    "Hello World from WebAssembly!".to_string()
}

#[wasm_bindgen]
pub fn heavy_work() -> u32 {
    console_log!("Starting heavy computation...");
    let mut result = 0;
    for i in 0..5000000 {
        result += i;
    }
    console_log!("Heavy work done: {}", result);
    result
}

#[wasm_bindgen(start)]
pub fn main() {
    console_log!("WASM loaded!");
}
