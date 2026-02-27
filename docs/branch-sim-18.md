# Branch Sim v0.18

## Scope

Define a nutrient diffusion model **inside dirt cells only** that is locally conservative and stable with 8-bit signed nutrient storage.

## Goal

- Enable nutrient spread across connected dirt.
- Preserve total nutrient in dirt diffusion updates (except clamp/quantization edge effects).
- Keep branch/root transport logic separate from dirt diffusion logic.

## Non-Goals

- No nutrient creation/regeneration.
- No nutrient destruction/decay.
- No branch/root topology changes.
- No cross-material diffusion (air/stone/water are not dirt-diffusion participants).

## Unit + Field

- Nutrient uses the same signed field in `branch2.g` (`nu`, centered at byte 127).
- Dirt diffusion updates only apply where matter is dirt and foliage occupancy is empty.

## Conservation Contract

For a pure dirt-diffusion substep:

- Pairwise exchange is antisymmetric: `A->B = - (B->A)`.
- Global sum over participating dirt cells is invariant.

Given 8-bit ping-pong storage, clamp losses at representable bounds are accepted.

Target invariant per substep:

- `sum_dirt_after == sum_dirt_before` (ideal)
- In practice, allow tiny drift from byte quantization / clamp at representable bounds.

## Recommended Update Scheme

Use **checkerboard pair updates** to avoid read/write races and preserve pairwise conservation.

### Neighborhood

- 4-neighbor (Von Neumann): up/down/left/right.
- Run in directional passes so each interacting pair is updated once per pass.

### Pass Schedule (ping-pong)

For one simulation tick, run a small fixed number of dirt-diffusion passes:

1. Horizontal pass (even pairs): `(x even, y)` exchanges with `(x+1, y)`
2. Horizontal pass (odd pairs): `(x odd, y)` exchanges with `(x+1, y)`
3. Vertical pass (even pairs): `(x, y even)` exchanges with `(x, y+1)`
4. Vertical pass (odd pairs): `(x, y odd)` exchanges with `(x, y+1)`

Each pass uses ping-pong textures (read previous, write next).

## Pair Exchange Rule

For a valid dirt-dirt pair `(a, b)` with values `Na`, `Nb`:

1. `diff = Na - Nb`
2. `m = abs(diff)`
3. `flow = sign(diff) * floor(m * DIRT_DIFFUSION_FRACTION)`
4. Apply symmetrically:
   - `Na' = Na - flow`
   - `Nb' = Nb + flow`

This guarantees local conservation (`Na' + Nb' == Na + Nb`) before clamp.

### Integer-Domain Requirement (8-bit ping-pong)

Because diffusion ping-pongs through an 8-bit channel, define exchange in integer/signed-byte domain:

1. Decode each cell to signed integer nutrient (`ni`, centered at 127).
2. Compute pair flow using integer math (`diff`, `abs`, `floor` behavior explicit).
3. Apply antisymmetric integer transfer (`a -= flow`, `b += flow`).
4. Re-encode to byte; clamp to representable range as final step.

Do not rely on hidden float carry-over across passes as a conservation mechanism.

### Parameters

- `DIRT_DIFFUSION_FRACTION` in `[0, 0.5]` recommended to avoid overshoot artifacts.
- Start with `0.25` and tune.

### Unit-Gradient Rule (`|diff| == 1`)

Favor movement when the pair differs by exactly `1nu`:

- If `|diff| == 1`, force `flow = sign(diff)`.
- Apply antisymmetrically to the same pair (`a -= flow`, `b += flow`).

This preserves local pair conservation while avoiding dead zones at single-unit gradients.

## Participation Mask

A cell participates in dirt diffusion only if all are true:

- Matter is dirt.
- Cell is not occupied by branch/root (`foliage alpha <= threshold`).
- Neighbor cell also satisfies same dirt-empty condition.

If mask fails, pair flow is `0`.

## Ordering Relative to Other Systems

Recommended order per tick:

1. Existing branch/root transport + growth logic.
2. Dirt diffusion passes (v0.18 feature).
3. Final writeback.

Alternative ordering is allowed, but keep fixed and documented for determinism.

## Quantization + Clamp Policy

- Exchange math is integer/signed-byte domain per pass.
- Re-encode each pass into the 8-bit ping-pong target.
- Clamp at min/max representable values is accepted and treated as unavoidable loss.

## Validation Checklist

- Dirt-only random field diffuses spatially over time.
- Single dirt pair update preserves pair sum exactly pre-clamp.
- Whole-map dirt sum remains stable across diffusion-only steps.
- No diffusion occurs through non-dirt materials.
- No diffusion occurs into occupied branch/root cells.
- Results are deterministic for fixed seed + tick order.

## Debug Metrics (recommended)

In nutrient HUD/resource mode, add optional dirt diagnostics:

- `dirt_before`, `dirt_after`, `delta`
- `abs_delta` over long run

Expected: near-zero deltas except occasional quantization/clamp events.
