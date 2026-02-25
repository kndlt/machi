
Directional Light Field (Per-Color)
Motivation

We want growth and rendering to respond to colored light arriving from different directions, e.g.:

Blue light arriving from the left (sky, water reflections)

Red light arriving from the right (sunset, lava, neon, fires)

A scalar light value per cell cannot express this. We instead maintain a directional light “environment map” per cell, per color band.

Data Model

We maintain 3 directional light textures:

L_R (red directional light)

L_G (green directional light)

L_B (blue directional light)

Each texture is RGBA8 and encodes 8 directional buckets.

Each bucket stores 4-bit intensity (0–15), so one texel stores:

8 directions × 4 bits = 32 bits total.

Directions (8 buckets):

TOP, TOP-RIGHT, RIGHT, BOTTOM-RIGHT, BOTTOM, BOTTOM-LEFT, LEFT, TOP-LEFT

These represent “how much light arrives from that direction” at this cell for that color band.

Packing Layout (Nibble-Aligned)

Each RGBA8 channel stores 2 buckets as high/low nibble:

R channel:

high nibble: TOP

low nibble: TOP-RIGHT

G channel:

high nibble: RIGHT

low nibble: BOTTOM-RIGHT

B channel:

high nibble: BOTTOM

low nibble: BOTTOM-LEFT

A channel:

high nibble: LEFT

low nibble: TOP-LEFT

This packing is simple because each bucket is exactly 4 bits.

Light Simulation Shader Contract

A dedicated light simulation pass updates L_R, L_G, L_B each tick.

The light simulation is not required to be physically accurate radiance.
It is a guidance field that is:

directional

colored

locally transportable

occludable by matter and canopy

Key behaviors:

Injection (sources)

Sky or emissive sources inject directional light into specific buckets.

Example: sky injects into TOP / TOP-LEFT / TOP-RIGHT buckets.

Example: a red lamp on the right injects into RIGHT bucket of L_R.

Transport (propagation)

Each bucket pulls from a neighbor’s corresponding bucket (directional transport).

Example: the TOP bucket at a cell is influenced by the TOP bucket of the cell above (or equivalently transporting “downward” from the sky direction).

Transport is attenuated per step to avoid infinite persistence.

Occlusion

Matter blocks transport strongly.

Branch canopy partially blocks transport.

Occlusion can be applied per bucket depending on the direction path.

Optional scattering (stability / softness)

A small portion of a bucket may bleed into adjacent direction buckets (e.g., TOP into TOP-LEFT/TOP-RIGHT) to reduce harsh angular artifacts.

Keep this small; it’s primarily for smoothing.

Consuming the Light Field in Branch Simulation

Branch growth and vitality can use directional light in two ways:

A) Upward phototropism

Use a weighted sum of top-facing buckets:
TOP + TOP-LEFT + TOP-RIGHT

Prefer growth into cells with higher upward light.

B) Directional color cue (optional)

Compute a per-cell RGB “available light” vector for decisions or rendering:
lightRGB = (sumTop(L_R), sumTop(L_G), sumTop(L_B))

Growth can favor brighter total luminance or bias toward certain spectra if desired.

Benefits

Allows blue-from-left and red-from-right simultaneously at the same cell.

Enables growth to seek not just brightness but directionality.

Decouples expensive multi-sample light checks from branch simulation.

Produces stable, reusable fields for rendering and ecology logic.

Costs / Caveats

Requires 3 textures and typically 3 passes (or one pass writing to multiple attachments if MRT is used).

4-bit buckets can band; acceptable for guidance fields, but not for high-fidelity lighting.

Packing/unpacking nibbles adds shader complexity; keep utility helpers.

Future Extensions

Add emissive materials as light sources.

Add per-material spectral absorption (e.g., leaves absorb red more than blue).

Increase precision (e.g., 6 bits per direction) by using RGBA16F or multiple textures per band if needed.

Add temporal smoothing to reduce flicker and quantization noise.