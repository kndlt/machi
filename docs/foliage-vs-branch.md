# Foliage vs Branch

## Thesis

We should simulate **branches** (structure + transport), not leaves.
Leaves are a visual layer derived from branch state during rendering.

## Why this model

- Branches carry nutrients/energy and define organism structure.
- Leaves are transient and mostly represent appearance.
- Separating simulation (biology) from rendering (appearance) simplifies rules and improves control.

## Simulation contract (`simulation.frag`)

The simulation outputs branch state per cell. Suggested channel semantics:

- `R` = branch energy (0..1)
- `G` = nutrients (0..1)
- `B` = leaf potential (0..1) — not leaves themselves
- `A` = alive branch mask (0 or 1)

## Core branch rules

1. **Anchoring / birth**
	- Branches can be born only from valid substrate adjacency (e.g., dirt/root-capable surfaces) or existing branch neighbors.
2. **Transport**
	- Nutrients diffuse/flow through connected branches with decay per hop.
3. **Energy update**
	- Energy moves toward local potential (`nutrients * light`) with smoothing.
4. **Survival / death**
	- Death when sustained low energy; avoid flicker with hysteresis (separate birth vs death thresholds).
5. **Growth spread**
	- New branch extension requires viable parent branch energy + local viability gate (e.g., noise/resources).

## Leaf rendering contract (not simulation)

- Render leaves procedurally on top of branch pixels using `leaf potential` (`B`) and optionally `energy` (`R`).
- Leaf sprites/coverage may occupy multiple pixels and visually occlude fine branch detail.
- If branch dies (`A=0`), leaves should fade/remove in the render pass.

## Determinism

- Simulation should support deterministic runs via `seed`.
- Given same world + parameters + seed, branch evolution should be reproducible.

## Runtime knobs

- `seed` for reproducibility
- `speed` for simulation tick frequency
- `delay` for delayed simulation start
- `perturb` for noise evolution rate

## Acceptance criteria

- Branch network grows from valid anchors and forms connected structures.
- No 1-tick birth/death flicker in marginal areas.
- Leaves visually respond to branch vitality without affecting branch physics.
- With fixed `seed`, repeated runs produce equivalent branch patterns.

