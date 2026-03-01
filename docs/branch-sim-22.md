# Branch Sim 22: Energy Grid

This proposal adds an **energy field** parallel to nutrient, with a simple rule:

- nutrients come from roots (already tracked in `branch2.g`)
- energy comes from light captured by branch cells

We store energy in `branch2.b` and treat occupied branch cells as coarse leaf proxies.

## Goal

Create a lightweight, stable coupling between branch growth and light transport:

1. branch cells absorb directional light into local energy
2. absorbed amount is removed from local light map
3. growth can consume both nutrient and energy

This should preserve current behavior by default (if gain/consume values are conservative) while enabling richer growth dynamics.

## Data Model

## `branch2` channel usage

- `branch2.r`: packed direction/type (existing)
- `branch2.g`: nutrient in signed-byte form (existing)
- `branch2.b`: **energy** in signed-byte form (new)
- `branch2.a`: inhibition/aux (existing)

Use the same signed-byte convention as nutrient:

- byte domain: `0..255`
- decoded scalar: `value = byte - 127`
- encoded back: clamp to `[-127, 128]` then `+127`

Keeping nutrient + energy in the same representation avoids new texture formats and keeps CPU/GPU debug tools simple.

## Light input

Light map already stores directional transport (8 directions). For each cell we compute a scalar "available light" as a weighted sum of directional channels.

Minimal first pass:

- sum all directional channels equally
- normalize to a convenient range

Optional refinement later:

- weight by branch orientation (dot between branch dir and incoming light dir)
- per-type absorption coefficient (root low, branch high)

## Core Update Rule

Per tick, for an occupied branch cell:

$$
\Delta E_{gain} = \lfloor L_{avail} \cdot k_{absorb} \rfloor
$$

$$
E_{new} = clamp(E_{old} + \Delta E_{gain} - E_{consume}, E_{min}, E_{max})
$$

And light depletion at that cell:

$$
L' = max(0, L - \Delta E_{gain})
$$

Where:

- $k_{absorb}$ is an energy gain coefficient
- $E_{consume}$ is per-tick maintenance and/or growth spend
- clamp bounds match signed-byte capacity

Important invariant: do not subtract more light than was available.

## Where this lives in the pipeline

Current architecture has separate foliage simulation and light transport passes. To avoid cyclic read/write hazards:

1. `LightTransportSim` computes the next light texture
2. `FoliageSim` reads that light texture and computes `energy gain`
3. `FoliageSim` writes updated `branch2.b`
4. `Light depletion` is applied in the next light pass via an absorption mask from foliage/branch2

This means we do **not** directly mutate light texture inside foliage pass. Instead we provide enough absorption signal so light pass can attenuate consistently.

## Minimal implementation strategy

### Phase 1: Energy accumulation only

- Add shader helpers:
  - decode/encode energy from `branch2.b`
  - compute local `availableLight`
- Update branch cells: `branch2.b += gain`
- Do not yet change growth cost equation
- Do not yet deplete light

This validates field stability and visualization quickly.

### Phase 2: Growth coupling

- Introduce energy requirement in branch/root creation checks.
- New condition: creation requires both nutrient and energy budget.
- Spend energy when growth action is accepted.

### Phase 3: Light depletion coupling

- Add `absorption` term in light pass, driven by branch occupancy and/or per-cell energy gain.
- Ensure total depletion is bounded to avoid negative light.
- Tune so canopy does not blackout too aggressively.

## Runtime Config (shared bag)

Extend shared `FoliageTuningConfig` with energy-related knobs:

- `energyAbsorbRate`
- `energyMaintenanceCost`
- `energyGrowthCostRoot`
- `energyGrowthCostBranch`
- `lightDepletionScale`

These should be app-owned config values (same pattern as current creation costs) so both simulation and HUD can use one source of truth.

## HUD + Debug

Add energy to nutrient HUD style summary:

- total energy (stored)
- branch embodied energy (optional)
- light absorbed this tick (optional rolling stat)

Suggested debug views:

- `view=energy` showing `branch2.b`
- `view=light_absorb` showing current absorption mask

## Risks / Constraints

1. **Feedback loop instability**: high absorption + high growth can create runaway fronts.
	- Mitigate with clamp + low default `energyAbsorbRate`.
2. **Light starvation collapse**: over-depletion may kill global growth.
	- Mitigate with floor on ambient/light injection in light pass.
3. **Byte quantization artifacts** in low-light zones.
	- Mitigate by accumulating in int domain and clamping once per tick.

## Acceptance Criteria

1. `branch2.b` visibly accumulates in lit branch regions.
2. Dark regions show significantly lower energy gain.
3. With growth coupling enabled, growth differs when energy is abundant vs scarce.
4. With depletion enabled, dense canopies measurably reduce downstream light.
5. Simulation remains stable for long runs (no NaN/negative-light artifacts).

## First concrete coding tasks

1. Add energy encode/decode helpers in `simulation.frag` using `branch2.b`.
2. Add energy gain from current light sample for branch cells.
3. Thread new energy tuning uniforms through `FoliageTuningConfig` and uniform upload path.
4. Add HUD line for energy total from `branch2.b`.
5. Add a follow-up doc for light-pass depletion implementation details.



