# Branch Simulator v0.5 — Branching Design

This doc proposes how to add **branching (tip split)** on top of the current v0.4 straight-line raster growth model.

## Goals

1. Keep trunk/tip growth straight and stable (already solved in v0.4).
2. Allow occasional fork events at tips.
3. Avoid clumping/explosions.
4. Stay shader-friendly in one ping-pong branch texture.

## Baseline (from v0.4)

Current branch map channels:

- `R`: occupancy
- `G`: heading (0..1, full 256-angle encoding)
- `B`: Bresenham-style line error accumulator
- `A`: occupancy alpha

Current growth is deterministic and pull-based:

- Empty cell looks at 8 neighbors.
- Accept only when exactly one neighbor is a valid source.
- New cell is created if candidate position matches source’s expected raster step.

---

## v0.5 State Encoding (recommended)

Use existing texture only (no extra texture).

- `R`: occupancy (`1.0` branch, `0.0` empty)
- `G`: heading (unchanged)
- `B`: line error accumulator (unchanged)
- `A`: **branching cooldown / maturity** (`0..1`), not just occupancy mirror

Notes:

- Occupancy can be determined from `R > 0.5`.
- `A` becomes per-node control state that throttles branching frequency.

---

## Branching Rule (concept)

For each valid source branch node, there are up to two candidate children:

1. **Main child**: continues forward along source heading (existing behavior).
2. **Side child**: optional branch with rotated heading `heading ± branchAngle`.

`branchAngle` can be fixed initially (e.g. 30°) and later varied.

### Eligibility for Side Branch

A source may emit a side child only if all are true:

- Source is mature enough: `A >= maturityThreshold`
- Local space is not crowded (e.g. <= 1 occupied orthogonal neighbor around source)
- Not adjacent to water
- Deterministic gate passes: `hash(sourcePos, heading)` compared with `branchRate * noise`

When side branch is emitted:

- New child heading = `sourceHeading + signedAngleOffset`
- Child line error (`B`) can start from `0.0` (or inherited, tunable)
- Child cooldown (`A`) starts low (young)
- Source cooldown resets to `0.0`

Main child behavior remains unchanged (or can be probabilistically skipped in a later phase).

---

## Pull-Shader Implementation Strategy

Because the shader is pull-based (candidate cell decides), each empty candidate cell does:

1. Enumerate branch neighbors.
2. Keep only neighbors where candidate matches one of that neighbor’s emitted targets:
   - target 0: main expected step
   - target 1: side expected step (if eligible)
3. If matches from multiple sources, reject (same anti-clump rule).
4. If exactly one source+target match, spawn child with that target’s heading/error/cooldown.

This keeps implementation close to current logic and avoids source-side write conflicts.

---

## Suggested Initial Parameters

- `branchRate = 0.03` to `0.08`
- `maturityThreshold = 0.65`
- `branchAngle = 30°`
- `cooldownGainPerStep = 0.04`
- `childInitialCooldown = 0.15`

Interpretation:

- Nodes need a short maturation period before branching.
- Branching remains sparse and structured.

---

## Anti-Explosion Safeguards

1. Keep `exactly one matched source` requirement.
2. Reject side branch if target cell touches existing branch cluster beyond a small threshold.
3. Apply cooldown reset after side spawn.
4. Optionally enforce per-node max side spawns (encoded via coarse bands in `A`, later phase).

---

## Debug Views Needed

Current debug modes already expose useful channels:

- mode `5`: heading (`G`)
- mode `6`: line error (`B`)
- mode `7`: `A` state

For v0.5, mode `7` should be interpreted as **maturity/cooldown**, not alpha occupancy.

---

## Rollout Plan

### Phase 1 (MVP Branching)

- Repurpose `A` to maturity/cooldown.
- Add side-branch eligibility + spawn logic.
- Keep main growth deterministic and always-on.

### Phase 2 (Shape Tuning)

- Add angle jitter bands (small, deterministic).
- Tune branch rate by light/noise.
- Add local crowding checks.

### Phase 3 (Structural Enhancements)

- Optional thickening pass.
- Optional branch aging / pruning.
- Optional integration with light transport as growth bias.

---

## Acceptance Criteria for v0.5

1. Trees keep clear primary trunks (no blob-like fill).
2. Side branches appear intermittently, not every step.
3. Branch angles are visually coherent and mostly stable.
4. Re-running with same seed yields identical topology.
5. No new textures required.
