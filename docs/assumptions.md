# Assumptions

This documents assumptions that we have in our repo. This is used by AI agents to better understand the repo.

1. `pnpm dev` and `pnpm dev:wasm` is running in the background.
2. test website can be reached at http://localhost:3000/.
3. lib.rs is the main file for simulation.
4. Inside Rust files, the coordinate system is that +y is upward direction in real world.
5. All simulations will prefer integer simulations rather that float. And float32 is preferred over float64. For instance water amount is stored in integer. This helps to prevent floating point errors that slowly increases/decreases overall system water volume over time.
