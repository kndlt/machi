# Branch Sim v0.16

Currently, the dirt provide infinite amount of resources.

We need a way to limit that.

Easiest would be to initialize all the dirt cells to have fixed amount of resources.

Then whenever the root cell takes 1, it is decremented 1.

## Implementation Plan

### Goal

Make nutrients finite using one shared 8-bit nutrient field (no separate dirt-vs-branch nutrient maps).

### Core Rule

- Nutrient is one scalar value per cell (`0..255`).
- Dirt initialization uses `branch2.png` value if present; only fallback to `DIRT_RESOURCE_INITIAL` when not authored.
- When a root grows into cell `A`, it takes ownership of nutrient `A` (no separate gather tick from that dirt cell).
- `ROOT_GATHER_RATE` is removed.
- No nutrient diffusion between dirt cells (for now).

### Storage Choice

Use one existing 8-bit nutrient field in `branch_tex2` as the canonical nutrient value.

Reason:
- Minimizes channel usage and avoids dual bookkeeping (dirt stock + branch resource).
- Keeps all nutrient accounting in one conserved quantity.

### Encoding

- Add constants:
	- `DIRT_RESOURCE_INITIAL`
	- `NUTRIENT_MIN = 0.0`
	- `NUTRIENT_MAX = 255.0`
- Add helpers:
	- `unpackNutrient(vec4 branchTex2)`
	- `packNutrient(float nutrient)`

### Initialization Rule

For dirt cells:

1. If nutrient is authored in `branch2.png`, keep authored value.
2. Else initialize to `DIRT_RESOURCE_INITIAL`.

Practical approach:
- Treat authored-nonzero as explicit input data.
- Use fallback initialization only for uninitialized/no-data dirt cells.

### Authored Value Policy (Explicit)

For v0.16, use this deterministic rule:

- `branch2.png` nutrient value is always treated as authored per pixel.
- Zero/neutral values are valid authored data points (no per-pixel fallback trigger).

Note:
- Fallback `DIRT_RESOURCE_INITIAL` applies only when authored texture data is unavailable (e.g., missing map), not when a pixel value is zero/neutral.

### Ownership Rule Update

Current behavior:
- Root on dirt continuously gathers from underlying dirt stock.

Change to:
1. On root growth claim into candidate cell `A`, read nutrient at `A`.
2. Transfer ownership of that nutrient into the root network state at spawn/claim time.
3. Mark/update nutrient at `A` as consumed according to ownership model.

This preserves conservation with no per-tick gather constant.

### Writeback Rule

Always preserve/update the chosen nutrient field in both occupied and empty-cell paths.

Important:
- Do not reset nutrient accidentally when writing other branch metadata.
- Use a single helper for metadata + nutrient writeback to avoid partial-field clobbering.

### Origin/Topology Interaction

No topology changes required.

- `isChildOf/getParent` and direction+error logic remain unchanged.
- Nutrient ownership transfer happens at root growth/claim events, not via continuous dirt gather.

### Phase Rollout

1. Add constants + nutrient pack/unpack helpers.
2. Define authored-vs-fallback dirt initialization behavior.
3. Remove `ROOT_GATHER_RATE` pathway.
4. Implement root-claim ownership transfer for nutrient at candidate cell.
5. Ensure non-claim paths preserve nutrient field unchanged.

### Validation Checklist

- Authored nutrient values from `branch2.png` are respected.
- Fallback initialization applies only where authored value is absent.
- Root nutrient increases when a root claim takes ownership of nutrient at target cell.
- No per-tick gather effect remains (`ROOT_GATHER_RATE` removed).
- No diffusion occurs between dirt cells.
- No regressions in parent-child topology behavior.
- Nutrient ownership transfer is deterministic across runs.

### Optional Follow-ups

- Different `DIRT_RESOURCE_INITIAL` by biome/noise.
- Optional diffusion/advection (explicitly deferred for now).
- Optional regeneration (explicitly deferred for now).