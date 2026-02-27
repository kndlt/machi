# Branch Sim 14

## Current `simulation.frag` Implementation Summary

This documents the current behavior implemented in `ui/src/shaders/simulation.frag` before refactor.

## IO and Render Targets

- Inputs
	- `u_matter`: world material map (air/dirt/water/stone via color matching)
	- `u_foliage_prev`: previous frame branch/root state
	- `u_branch_tex2_prev`: previous frame metadata (type/resource)
	- `u_noise`: fertility noise used for branching variability
	- `u_tick`, `u_branching_enabled`, `u_branch_inhibition_enabled`
- Outputs
	- `out_color` (`branchTex1`): tree id, packed dir+err, inhibition, occupancy
	- `out_branch_tex2` (`branchTex2`): packed type nibble + signed resource byte

## Data Encoding

- `branchTex1`
	- `R`: tree id
	- `G`: packed direction + error (`packDirErr`, 5-bit dir + 3-bit error)
	- `B`: inhibition (`0..255` packed)
	- `A`: occupied alpha
- `branchTex2`
	- `R`: type nibble (currently `0=branch`, `1=root`, packed in low nibble)
	- `G`: signed resource centered at `127`
	- `B/A`: currently unused

## Resource Model (Current)

- Constants
	- `NEW_GROWTH_RESOURCE_COST = 1.0`
	- `ROOT_GATHER_RATE = 1.0`
	- `RESOURCE_DIFF_TRANSFER_FRACTION = 0.5`
	- `RESOURCE_UPSTREAM_MIN_ALIGNMENT = 0.5`
- Signed encoding
	- decode: `resource = unpackByte(G) - 127`
	- encode: clamp signed range then re-center to byte
- Transfer function
	- `computeResourceTransfer(source, sink)` uses signed difference
	- magnitude uses `floor(abs(diff) * fraction)`
	- special-case `|diff| == 1` returns `±1` (prevents deadband at unit difference)

## Direction-Aware One-Way Transport

For occupied cells, transport is now canopy-directed and one-way:

1. Compute local direction `hereDir` from packed dir.
2. Define canopy direction by type:
	 - branch: canopy along `hereDir`
	 - root: canopy along `-hereDir`
3. Upstream direction is opposite canopy direction.
4. Scan 8 same-tree occupied neighbors and pick best aligned with upstream (`max dot`).
5. Apply transfer only if alignment exceeds `RESOURCE_UPSTREAM_MIN_ALIGNMENT`.
6. Enforce one-way transport with `max(0, transfer)` (no reverse flow).

Net effect: advection-like transport toward canopy, not symmetric diffusion.

## Root Gathering

- If current occupied cell is `root` and on `dirt`, add `ROOT_GATHER_RATE` to resource each tick.

## Inhibition

- If inhibition is disabled, writes inhibition as zero and returns early.
- If enabled:
	- inhibition decays per type (`BRANCH_INHIBITION_DECAY` / `ROOT_INHIBITION_DECAY`)
	- base inhibition is max of decayed center and decayed max same-type neighbor inhibition.

## Growth / Claiming (Empty Cell Path)

An empty candidate cell can become occupied only under strict conditions:

- Candidate must be `air` or `dirt`.
- Reject if touching water in 8-neighborhood.
- Growth runs on odd ticks only (`u_tick % 2 != 0`).
- Resolve claims from occupied neighbors; accept only when `claimCount == 1`.

### Root Seeding

- From branch source into dirt, using backward-stepped direction logic.
- Uses same line stepping/error accumulation approach as forward growth.
- Prevents branch->root reseeding loops via parent/type check.
- New root claim sets resource to `-NEW_GROWTH_RESOURCE_COST`.

### Branch/Root Forward Growth

- Per-source parameters are type-specific (side rate, turn rates, angle ranges, etc.).
- Tip detection uses occupied neighbor count (`==1`).
- Main growth and side growth both use `lineStepper` and quantized expected step checks.
- Occlusion guard: `blockedInForwardCone(...)` rejects growth into blocked forward cone.
- Side branch emission gated by fertility, inhibition factor, source topology, and random hash.
- Any accepted claim initializes new cell resource to `-NEW_GROWTH_RESOURCE_COST`.

## Edge Handling and Safety

- `edgeSafeUV` clamps sample coordinates to half-texel margins to avoid out-of-bounds sampling artifacts.
- Resource unpack/pack clamps to bounded signed range before writing.

## Behavioral Notes (As Implemented)

- Transport is intentionally directional and non-conservative (one-way clamp), unlike earlier symmetric diffusion.
- Resource cost is explicit and semantic (`NEW_GROWTH_RESOURCE_COST`) rather than byte-offset sink constant.
- Inhibition remains 8-neighbor based, while resource transport uses single best upstream neighbor.

## Refactor Targets (Next)

- Separate growth, transport, and inhibition into clearer helper blocks.
- Unify parent/upstream relation logic shared by growth and transport.
- Remove duplicated neighborhood traversal patterns.
- Optionally expose transport mode toggles (symmetric diffusion vs one-way canopy advection).