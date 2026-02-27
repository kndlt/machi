# Branch Sim 15

## Goal

Define exactly one topology truth:

- `isChildOf(childCell, parentCell)`

Everything else (`isParentOf`, `getParent`, transport source selection, growth source validation) is derived from this one predicate.

No multiple relation modes. No approximations. No directional fallback heuristics.

Given the same direction+error state, topology inference must be deterministic and identical everywhere.

## Problem Statement

Current code still has multiple ways to infer connectivity (claim path math, transport scan, alignment filters, fallbacks). That creates drift: growth may decide one relation while transport assumes another.

Target state: one parent-child rule reused by every subsystem.

## Current vs Target (Quick Status)

### Currently implemented in `simulation.frag`

- Claim resolution uses local step/error math (`lineStepper + err`) for forward and root-seed paths.
- Resource transport uses canopy-direction alignment search (`RESOURCE_UPSTREAM_MIN_ALIGNMENT`) over neighbors.
- Side-branch spawn currently resets child error (`sideChildErr = 0.0`).
- There is no unified `isChildOf` / `getParent` API yet.

### Planned in this refactor

- Introduce one topology primitive: `isChildOf(child, parent)`.
- Derive `isParentOf`, `getParent`, and `childrenOf` strictly from `isChildOf`.
- Route growth, root-seeding, and transport through the same relation helpers.
- Enforce error-term continuity for side branches so new children satisfy relation checks immediately.

## Single Primitive

### `isChildOf(child, parent) -> bool`

Returns true iff:

1. both cells are occupied,
2. both cells have same `treeId`,
3. parent is exactly at child’s expected backward step,
4. expected backward step is computed from the child’s `dir + err` using the same stepping/bucketing logic used at generation.

This is the only relation authority.

### `isParentOf(parent, child) -> bool`

Alias of `isChildOf(child, parent)`.

## Derived Operations (Built on Top)

### `getParent(cell) -> ParentHit`

Scan 8 neighbors and return the unique neighbor `p` where `isChildOf(cell, p)` is true.

- if exactly one match: valid parent
- if zero matches: origin-cell case (allowed only for branch origin or root origin)
- if multiple matches: invalid topology state (debug signal), then deterministic tie-break (fixed neighbor order)

### `childrenOf(cell)`

Neighbors `c` where `isChildOf(c, cell)` is true.

No `directionalBest`, no `strictTopology`, no `strictClaim` modes.

## Structs

### `NodeState`

Represents minimal decoded state for relation checks.

- `bool occupied`
- `float treeIdByte`
- `float cellType`
- `vec2 dir`
- `float err`
- `ivec2 pos` (lattice/pixel-space location)

Note: this topology document intentionally uses lattice-space (`pos`) relations and does not require `texelSize`.

### `ParentHit`

- `bool found`
- `ivec2 pos`
- `ivec2 step`
- optional `int reason` (`NO_MATCH`, `MULTI_MATCH`, `OK`)

## Minimal Helper Set

- `expectedBackwardStep(nodeState) -> ivec2`
- `isChildOf(childState, parentState) -> bool`
- `isParentOf(parentState, childState) -> bool`
- `getParent(childState) -> ParentHit`
- `childrenOf(parentState) -> list`

## Canonical Semantics

- `isChildOf(C, P)` is true iff `P.pos == C.pos + C.expectedBackwardStep`.
- `expectedBackwardStep` comes from child stepping (`lineStepper + err`), using same bucketing rules as generation.
- `getParent(C)` is the unique neighbor satisfying `isChildOf(C, neighbor)`.
- `childrenOf(P)` are neighbors `N` where `isChildOf(N, P)`.
- Same-tree is mandatory for relation checks.
- Type/medium checks remain in growth acceptance logic, not relation logic.

## Error-Term Continuity Invariant

The Bresenham-style error term must be consistent across all lineage creation paths.

- Main forward growth carries error (`childErr`).
- Root seeding carries error (`seedChildErr`).
- Side-branch creation must also carry/initialize error consistently with stepping logic (no special-case reset to zero).

If child error is not consistent at spawn time, parent/child inference can diverge even when direction appears correct.

## Singular Parent Policy

Design invariant:

- every occupied cell has exactly one parent reference except origin cells.

Origin cells are explicitly:

- branch origin cell (no parent)
- root origin cell (no parent)

Operationally:

- During growth acceptance, new cell is created from one winning source (`claimCount == 1`), defining parent.
- Parent inference after creation must resolve to that same source through `isChildOf`.
- If not, it is a bug in step/error relation consistency.

## Transport Rule Under This Model

Transport should not choose neighbors by alignment heuristics.

- Upstream source for a cell is `getParent(cell)`.
- Canopy/downstream can use any `childrenOf(cell)` policy later.
- One-way transfer can remain, but edge choice must come from relation logic only.

This removes mismatch where transport used a different approximation than growth.

## How Existing Features Map

### Growth Claiming

Use `isChildOf(candidate, source)` as final topology predicate when validating a source claim.

On accepted claim, stored child error must be exactly the error implied by the same stepping decision used for that claim.

### Root Seeding

Use `getParent(source)` for parent checks; no nearest-step approximation.

### Resource Transport

1. `p = getParent(thisCell)`
2. if valid parent exists, transfer only from `p -> thisCell`
3. no directional-best or fallback alignment scans

## Minimal Shader-Oriented Implementation Plan

### Phase A: Extract decode helpers

- Add `NodeState` construction helpers.
- Centralize decode of occupancy/tree/type/dir/err/pos.

### Phase B: Implement single relation primitive

- `expectedBackwardStepFromDirErr(dir, err)`
- `isChildOf(child, parent)`
- `isParentOf(parent, child)` as thin alias helper
- `getParent(child)` by scanning 8 neighbors and testing `isChildOf`

### Phase C: Replace call sites

- Replace growth claim checks with `isChildOf`.
- Replace root seed parent logic with `getParent`.
- Replace transport upstream logic with `getParent` only.
- Remove side-branch error reset and write propagated branch error consistently.

### Phase D: Remove duplicated logic

- Delete directional alignment selection and fallback approximations.

## Determinism & Performance Notes

- Keep relation helpers pure/local (single-pass shader friendly).
- Avoid loops beyond fixed 8-neighbor scans.
- Deterministic tie-break by fixed neighbor index order only (last resort for invalid multi-parent states).

## Validation Checklist

- No growth regression in branch-only scenarios.
- Parent inference equals generation source for newly created cells.
- Each non-origin cell resolves to exactly one parent (or deterministic flagged exception).
- Transport uses only `getParent`; no alignment/fallback influence.
- Transport does not leak across different tree IDs.
- Side-branch children pass `isChildOf` immediately after spawn using stored `dir + err`.

## Refactor Success Criteria

- One source of truth: `isChildOf`.
- Singular-parent model enforced and observable.
- No alternate approximation paths for connectivity.
- Growth and transport reference the exact same topology inference.

## Non-Goals (for this step)

- Multi-pass graph solvers.
- Full graph reconstruction on CPU.
- Major rendering pipeline changes.

This is a local shader-logic refactor focused on correctness and consistency.

## Notes from `deprecated/Shaders` Struct Usage

Reviewed files:

- `deprecated/Shaders/Structs/{Ray,Hit,Material,Shape}.glsl`
- consumers in `deprecated/Shaders/Functions/*` and `NaiveVoxelPathTracer.glsl`

Useful patterns to copy:

1. **Typed function boundaries via small structs**
   - Reduce argument mismatch bugs.
2. **Constructor-style defaults**
   - Keep sentinel semantics centralized (`miss`-style pattern).
3. **Return composite values**
   - `getParent` should return `ParentHit` instead of ad-hoc locals.
4. **Centralized decode/state**
   - `NodeState` should be the single decode representation.

These patterns are practical in GLSL ES and fit this refactor.