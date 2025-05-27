use wasm_bindgen::prelude::*;

// Import the `console.log` function from the `console` object in the web-sys crate
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// Define a macro to make it easier to call console.log
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

// Export a `hello_world` function from Rust to JavaScript
#[wasm_bindgen]
pub fn hello_world() -> String {
    console_log!("Hello from Rust!");
    "Hello World from WebAssembly!".to_string()
}

// Export a function that does some computational work
#[wasm_bindgen]
pub fn compute_fibonacci(n: u32) -> u32 {
    console_log!("Computing fibonacci({}) in WASM...", n);
    
    if n <= 1 {
        return n;
    }
    
    let mut a = 0;
    let mut b = 1;
    
    for _ in 2..=n {
        let temp = a + b;
        a = b;
        b = temp;
    }
    
    console_log!("Fibonacci({}) = {}", n, b);
    b
}

// Export a function that simulates heavy computation
#[wasm_bindgen]
pub fn heavy_computation() -> String {
    console_log!("Starting heavy computation in WASM...");
    
    let mut result = 0;
    for i in 0..10000000 {
        result += i * i;
    }
    
    console_log!("Heavy computation completed: {}", result);
    format!("Computation result: {}", result)
}

// Called when the wasm module is instantiated
#[wasm_bindgen(start)]
pub fn main() {
    console_log!("WASM module loaded successfully!");
}
