# Branch Simulator v0.12

## Goal

Implement root simulation with minimal disruption to the current branch system.

Keep existing branch behavior intact, then add root growth using the same growth code path with different configuration.

## Design Principles

- Keep names simple: `branchTex1`, `branchTex2`.
- Do not split into separate root/branch maps.
- Avoid large refactors; ship in small phases.
- Preserve current visuals and debug tooling as much as possible.

## Texture Layout

### `branchTex1` (existing, unchanged semantics)

- `R`: tree ID
- `G`: packed direction + error
- `B`: inhibition (0..255)
- `A`: occupancy

### `branchTex2` (new metadata texture)

Initial usage (v0.12):

- `R`: packed cell type nibble (first 4 bits)
  - `0`: branch
  - `1`: root
  - `2..15`: reserved
- `G`: reserved
- `B`: reserved
- `A`: reserved

## Root Model (v0.12 scope)

Use a minimal type-only model first.

- Root cells are represented by `type=1` in `branchTex2.R`.
- Branch cells are represented by `type=0`.
- No support/nutrient field in v0.12.

## Simulation Rules

### 1) Occupancy/type relationship

- Occupancy remains in `branchTex1.A`.
- Type lives in `branchTex2.R` first 4 bits.
- A cell can be occupied and either root or branch.

### 2) Seed behavior

- Existing branch seeds remain valid.
- Optional: allow explicit root seeds via initial `branchTex2.R` type nibble (`1=root`).

## Implementation Plan

### Phase 1: Plumbing only (no behavior change)

1. Add ping-pong texture for `branchTex2` in simulation pipeline.
2. Add uniforms/samplers to read previous `branchTex2` and write next `branchTex2`.
3. Add pack/unpack helpers for type bit operations.
4. Keep branch behavior unchanged.

Exit criteria:

- Build passes.
- Existing worlds behave exactly the same with default settings.

### Phase 2: Type-based rules

1. Keep `branchTex2.R` type writes stable (`0=branch`, `1=root`).
2. Preserve `branchTex1` logic untouched except data flow.

Exit criteria:

- Debug view can display type (`branch` vs `root`).

### Phase 3: Inverted-tree root growth

1. Reuse the same growth algorithm used by branches for roots.
2. Use a different root configuration set (rates/angles/turning/inhibition tuning).
3. Use a different hash seed/config hash for root evolution so root shape is distinct.
4. Change medium rule for root growth to `DIRT` (instead of `AIR`).

Exit criteria:

- Roots grow as an inverted tree with distinct morphology.
- Branch growth remains unchanged in air.

## Shader/API Changes (Minimal Set)

- In sim shader:
  - Add `u_branch_tex2_prev` sampler.
  - Output second render target for `branchTex2` next state.
  - Add helpers:
    - `float unpackByte(float x)`
    - `float packByte(float x)`
    - `float getCellType(float packedTypeByte)`
    - `float setCellType(float packedTypeByte, float cellType)`

- In TS renderer/sim wrappers:
  - Allocate and ping-pong `branchTex2` alongside `branchTex1`.
  - Add root growth configuration values (separate from branch config).
  - Add debug mode label for cell type.

## Debug Views

Add at least one new view mode:

- `cell-type`: visualize type nibble (`0=branch`, `1=root`).

Optional later:

- `type`: visualize type nibble (`0=branch`, `1=root`).

## Starter Configuration (Branch vs Root)

Use these as first-pass defaults when wiring shared growth code for both types.

| Parameter | Branch (air) | Root (dirt) | Note |
|---|---:|---:|---|
| growthTickModulo | 2 | 2 | Keep same cadence first |
| sideRate | 0.18 | 0.10 | Roots branch less often |
| sideAngleMinDeg | 20 | 12 | Roots stay tighter |
| sideAngleMaxDeg | 45 | 30 | Roots avoid wide fan-out |
| mainTurnRate | 0.08 | 0.04 | Roots wander less |
| mainTurnRateBlocked | 0.55 | 0.70 | Roots seek alternative dirt paths when blocked |
| mainTurnMaxDeg | 10 | 7 | Root heading changes are smoother |
| inhibitionEnabled | true | false | Root pass can start without inhibition |
| mediumMask | AIR | DIRT | Core difference in acceptance rule |
| hashSaltA | 311 | 619 | Different morphology seed |
| hashSaltB | 887 | 1423 | Different morphology seed |

Notes:

- Keep all other logic identical between branch and root in v0.12.
- If roots look too sparse, raise `sideRate` slightly before increasing turn rates.
- If roots look too noisy, lower `mainTurnRate` first.

## Compatibility and Migration

- Existing `branch.png` remains usable as `branchTex1` seed.
- `branchTex2` initializes to zero when no metadata seed exists.
- No required migration for existing worlds in phase 1.

## Risks and Mitigations

- Risk: root type may initially have no behavioral effect.
  - Mitigation: implement Phase 3 immediately after type plumbing using same growth path on dirt.
- Risk: extra texture increases bandwidth.
  - Mitigation: keep updates simple and local; no extra large kernels.
- Risk: logic drift between tex1/tex2.
  - Mitigation: enforce clear ownership (`occupancy in tex1`, `type in tex2`).

## Out of Scope for v0.12

- Separate root-only rendering pipeline.
- Multi-layer soil physics.
- Texture arrays / 64-bit / 128-bit formats.

These can be revisited after inverted-tree root growth is stable.
