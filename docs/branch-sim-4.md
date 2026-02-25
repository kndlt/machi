# Branch Simulator v0.4 — Current Implementation Summary

This document summarizes the **current shipped behavior** in `ui/src/shaders/simulation.frag` and related debug views.

## High-Level Model

We currently run a deterministic, single-pass branch growth automaton on the foliage texture.

- Branches only exist in **AIR** cells.
- Existing branch cells persist.
- Empty cells only become branch if they have **exactly one** neighboring branch source.
- No automatic dirt seeding is active.
- Water adjacency is treated as a hard exclusion zone.

## Branch Texture Layout (Current)

`u_foliage` / output branch map channels:

- `R`: occupancy (`1.0` = branch, `0.0` = empty)
- `G`: heading angle (`0..1`, full 256-level encoding in RGBA8)
- `B`: line-step error accumulator (`0..1`) for rasterized straight growth
- `A`: occupancy alpha (`1.0` for branch)

## Growth Rule (As Implemented)

For each empty AIR cell:

1. Scan 8 neighbors.
2. Reject if touching water.
3. Reject unless there is exactly one branch neighbor.
4. Read source heading from `G` and error term from `B`.
5. Compute line stepping from heading:
	- primary step (major-axis step)
	- secondary step (diagonal correction)
	- `slopeMix` ratio
6. Advance error accumulator (`errNext = err + slopeMix`):
	- if overflow, expected step = secondary and error wraps
	- otherwise expected step = primary
7. Only the candidate cell matching that expected step is accepted.
8. Child branch writes:
	- occupancy on
	- same heading (`G` inherited)
	- updated error accumulator (`B`)

Result: branch tips extend in deterministic pixel-raster straight lines while preserving high-resolution angle encoding.

## What This Solves

- Avoids noisy wobble/jitter in tip growth.
- Supports effectively continuous heading control while still growing on a pixel grid.
- Prevents clumped fill by enforcing the single-source-neighbor constraint.

## Known Constraints / Current Tradeoffs

- `B` is now used for line error state, so it is no longer a mirror occupancy channel.
- Branching (tip splitting), thickening, and elongation mechanics are not yet implemented.
- `u_light` is bound but currently unused by this branch shader.
- `u_noise` is also currently unused in the deterministic growth path.

## Debug Views (Map Shader)

In `map.frag` current view modes are:

- `4`: branch `R` (occupancy)
- `5`: branch `G` (direction hue wheel)
- `6`: branch `B` (error accumulator)
- `7`: branch `A` (alpha)
- `8`: noise field
- `9`: directional light total energy

## Validation Snapshot

Recent headless run (`npm run sim`) validates compile/runtime stability and deterministic extension behavior:

- build passes
- simulation converges around straight growth from the seeded center path

## Next Logical Step

Implement **branching** on top of this line-raster core, likely by introducing a tip eligibility rule and controlled dual-child spawn with heading offsets.

