# Branch Sim 20: Refactor to Integer Textures (`RGBA8UI`)

This document outlines the plan to refactor the simulation and rendering pipeline to use integer-based textures (`RGBA8UI`) instead of the current floating-point textures with manual byte packing/unpacking.

## Motivation

The current simulation shaders (`simulation.frag`, `noise.frag`) rely on a series of `pack...` and `unpack...` helper functions to convert floating-point values in the range `[0, 1]` to and from 8-bit integer representations. This approach has several drawbacks:

1.  **Complexity:** It adds significant complexity to the shader code, making it harder to read, reason about, and maintain.
2.  **Precision Issues:** It has led to subtle precision and rounding errors, such as the recently fixed direction encoding that resulted in `185.8°` instead of `180°`.
3.  **Inefficiency:** It requires extra arithmetic operations on the GPU that could be avoided by using native integer texture formats.

By switching to `gl.RGBA8UI` textures, we can work with integer values (0-255) directly in the shaders, simplifying the logic and improving correctness.

## Refactoring Plan

This is a significant architectural change that will affect multiple parts of the codebase. The transition will be performed in the following steps:

### 1. Update Texture Creation

All simulation textures (foliage, noise, light, etc.) that currently store packed byte data will be recreated with an integer-based internal format.

-   **File:** `ui/src/utils/gl-utils.ts`
-   **Change:** Modify the `createTexture` function to accept a format parameter. Update calls to it in `FoliageSim.ts`, `NoiseSim.ts`, and `LightSim.ts` to specify `gl.RGBA8UI` as the internal format and `gl.UNSIGNED_BYTE` as the data type for the simulation textures.

### 2. Modify GLSL Shaders

The shaders will be updated to work with integer samplers and data types.

-   **Files:** `ui/src/shaders/simulation.frag`, `ui/src/shaders/noise.frag`, `ui/src/shaders/map.frag`
-   **Changes:**
    -   Change `sampler2D` uniforms that point to simulation textures to `usampler2D`.
    -   Change fragment shader outputs from `vec4` to `uvec4`.
    -   The `texture()` function on a `usampler2D` will now return a `uvec4` containing integer values from 0 to 255.
    -   Remove all `pack...` and `unpack...` helper functions (`packDirErr`, `unpackByte`, `unpackDir`, `unpackErr`, etc.).
    -   Replace all calls to these functions with direct integer arithmetic (e.g., bit shifting and masking if necessary, though direct channel access should suffice for most cases).

### 3. Update CPU-Side Logic

The TypeScript code that interacts with these textures will need to be adjusted.

-   **File:** `ui/src/App.tsx`
-   **Change:** The `readPixels` implementation for the simulation will now return a `Uint8Array` or `Uint32Array` instead of a `Float32Array`. The hover-over tooltip logic will be updated to read integer values directly from this array.

-   **File:** `ui/src/simulation/NoiseSim.ts`
-   **Change:** The `generateInitialNoise` function already produces a `Uint8Array`, which is correct. No major change is needed here, but we will verify its integration with the new integer texture format.

## Expected Outcome

After this refactoring, the shader code will be significantly cleaner and more direct. The manual float-to-byte conversions will be gone, eliminating a class of potential bugs and making the simulation logic easier to verify. This will provide a more robust foundation for future development.
