# Branch Sim 13

Now we have root simulation.

I think we may be kinda ready for adding resource gathering diffusion and consumption.

## Goal

Add a minimal resource system that:

- gathers resource from dirt through roots,
- diffuses/transports resource through the network,
- consumes resource when creating new cells,
- keeps current growth model intact.

## Keep It Simple (v13 Scope)

- No new textures for now.
- Reuse existing channels where possible.
- Start with one scalar resource field.
- Keep all logic in the same simulation pass.
- Use signed resource encoded in one byte (centered at 127).

## Proposed Channel Usage

### `branchTex1` (existing)

- `R`: tree ID
- `G`: packed direction + error
- `B`: inhibition (already used)
- `A`: occupancy

### `branchTex2` (current)

- `R`: type nibble (`0=branch`, `1=root`)
- `G`: signed resource byte (`0..255`, where `127 = zero`)
- `B`: reserved
- `A`: reserved

## Signed Resource Encoding

- Stored byte: `S` in `[0, 255]`
- Decoded signed resource: `R = S - 127`
- Meaning:
	- `R > 0`: surplus/source
	- `R = 0`: neutral
	- `R < 0`: deficit/sink (negative pull)

Suggested constants:

- `RESOURCE_ZERO_BYTE = 127`
- `RESOURCE_MIN_BYTE = 0`
- `RESOURCE_MAX_BYTE = 255`
- `NEW_BRANCH_SINK_BYTE = 0` (strong sink at spawn)

## Rules

### 1) Gathering (root only)

- If cell type is root and cell is on dirt, gather resource each tick.
- Gathering pushes signed resource positive (toward source).
- Write back clamped to byte range.

Suggested start:

- `RESOURCE_MAX_BYTE = 255`
- `ROOT_GATHER_RATE = 6`

### 2) Diffusion / Transport

- Resource moves between same-tree occupied neighbors.
- Keep it local (8-neighbor max or average mix).
- Signed diffusion is allowed (negative values propagate pull).
- Type boundary rule can remain optional; start with same-tree rule first.

Suggested start:

- `RESOURCE_DIFFUSION = 0.20` (fractional mix)
- integer storage in texture via pack/unpack byte

### 3) Passive Decay

- Add gentle relaxation toward neutral (`127`) each tick.
- This prevents permanent extreme sinks/sources.
- Optional type-specific relaxation rates.

Suggested start:

- `RESOURCE_RELAX_BRANCH = 1`
- `RESOURCE_RELAX_ROOT = 1`

### 4) Growth Consumption

- New claim requires source to be above a minimum signed threshold.
- New spawned branch/root cell is initialized to a sink value (negative pull).
- This creates immediate local demand and pulls resource inward via diffusion.

Suggested start:

- `RESOURCE_MIN_TO_GROW = +24` (signed)
- `NEW_BRANCH_SINK_BYTE = 0` (decoded `-127`)
- optional softer sink: `NEW_BRANCH_SINK_BYTE = 16` (decoded `-111`)

## Tick Order (single pass approximation)

Per occupied cell:

1. Read previous resource (`branchTex2.G`)
2. Apply gather (root+dirt)
3. Apply neighbor diffusion contribution
4. Apply relaxation toward neutral (127)
5. Write updated resource

Per empty candidate cell claim:

1. Check source signed-resource gate
2. If claim succeeds, child starts at sink byte (`NEW_BRANCH_SINK_BYTE`)

## Minimal Implementation Steps

1. Add pack/unpack helpers for resource in shader (`branchTex2.G`).
2. Update occupied-cell path to write `branchTex2.G` each tick.
3. Add signed resource gate in claim path.
4. Set spawned cell resource to sink byte on successful claim.
5. Add debug view mode for resource heatmap.

## Suggested Debug Views

- `resource`: heatmap from `branchTex2.G`
- show neutral (`127`) as mid gray, positive as warm, negative as cool
- optional overlay labels in mode HUD: avg resource / max resource

## Non-Goals (v13)

- Global equilibrium solver
- Multi-resource chemistry
- Separate xylem/phloem models
- Multiple simulation passes

## Success Criteria

- Roots on dirt accumulate resource over time.
- Branch growth slows/stops when resource is low.
- New growth fronts appear as temporary sinks and pull nearby resource inward.
- Regions near active roots show healthier branching.
- Behavior remains stable at current map sizes and tick rates.



