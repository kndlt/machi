# Branch Simulator v0.8 — Root System Proposal

## Goal
Add a root simulation that grows similarly to branches, but in soil-friendly directions and with stronger crowd/collision constraints.

This document proposes the minimal design first (no full nutrient rewrite yet), then optional upgrades.

---

## 1) Core idea
We introduce a new **root map** (RGBA8 ping-pong), updated each simulation step with logic parallel to `simulation.frag`.

- Branches: mostly grow in air, avoid water, use directional stepping + occasional side branch.
- Roots: mostly grow in dirt, avoid water/stone, use directional stepping + occasional side branch.
- Both systems use deterministic claim resolution (`claimCount == 1`).

Roots are a separate layer so we can tune and debug independently.

---

## 2) Root texture encoding (proposed)
For symmetry with current branch logic, keep identical channel semantics:

- `R`: root/tree ID (same tree lineage ID)
- `G`: packed direction + step error (`5 bits direction`, `3 bits error`)
- `B`: reserved (currently unused)
- `A`: occupancy / vitality (initially occupancy-style, can later become nutrient)

Packing contract for `G` (8-bit):
- `dirQ ∈ [0..31]` (32 bins, ~11.25° per bin)
- `errQ ∈ [0..7]` (8 levels)
- `packed = (dirQ << 3) | errQ`
- decode: `dir = dirQ / 31`, `err = errQ / 7`

Reason: reusing branch conventions keeps shader code and debug tools simple.

---

## 3) Root growth rules (minimal v1)

### 3.1 Material gating
Root growth candidate cell must be:
- Dirt-preferred (`isDirt`) or optionally support-like soil material.
- Not water.
- Not stone.

### 3.2 Persistence
Existing root cells persist each step (same as branches for now).

### 3.3 Tip-based source claims
For each empty candidate cell, inspect 8 neighbors for possible root sources.
A source may claim if its expected step points to the candidate.

### 3.4 Direction bias
Use branch-like steering with different constants:
- Stronger downward bias.
- Lower turn magnitude in compact soil.
- Side branch chance lower than branches.

### 3.5 Collision / crowding
Reject claim if any of these are true:
- Forward-cone blocked (radius 4–6, same concept as branch).
- Nearby different-tree root ID present (anti-overlap).
- Optional: root cannot claim where branch already exists.

### 3.6 Conflict resolution
Only accept if exactly one valid claim (`claimCount == 1`).

---

## 4) Seeding strategy
Minimal strategy:
- Seed roots from branch cells that touch dirt (or from trunk base if available).
- Root ID copies from branch ID.
- Initial root direction is downward (`vec2(0, 1)` in map lattice convention).

This avoids introducing a dedicated trunk/root entity yet.

---

## 5) GPU pipeline changes

### New simulation module
Add `RootSim.ts` mirroring `FoliageSim.ts`:
- ping-pong textures
- `step(matterTex, rootPrevTex, foliageTex?, noiseTex?)`
- `currentTexture()`

### Simulation renderer
In `SimulationRenderer.ts` step order (proposed):
1. `noise.step(...)`
2. `light.step(...)`
3. `root.step(...)`
4. `foliage.step(...)` (optionally reading roots later)

Initial integration can keep branch and root independent except for seeding.

---

## 6) Debug / visualization
Extend map debug modes with root channels similar to foliage modes.

Suggested:
- root occupancy
- root direction hue (decoded from packed `G`)
- root error view (decoded from packed `G`)
- root ID colorized

Keep existing foliage debug untouched.

---

## 7) Tunable constants (starting values)
- `ROOT_SIDE_RATE = 0.05`
- `ROOT_MAIN_TURN_RATE = 0.04`
- `ROOT_MAIN_TURN_MAX = PI / 24.0`
- `ROOT_FORWARD_CONE_COS = 0.6` (narrower cone)
- `ROOT_BLOCK_RADIUS = 4`

These are intentionally conservative to avoid explosive underground branching.

---

## 8) Implementation phases

### Phase A (MVP)
- Add root texture layer + `RootSim.ts`.
- Implement branch-like root growth in dirt.
- Add one debug view for root occupancy.

### Phase B
- Add root direction debug and ID debug.
- Add branch-root interaction constraints (e.g., prevent overlap).

### Phase C
- Couple nutrient flow: roots as nutrient source for nearby branches.

---

## 9) Acceptance criteria
- Roots visibly grow from seeded points into soil.
- Roots avoid water/stone and don’t explode in count.
- Root growth deterministic for a fixed seed.
- Debug mode clearly shows root map evolution frame-to-frame.

---

## 10) Notes
This plan intentionally keeps root behavior **structurally similar** to branch behavior so code can be reused and tuned with minimal architectural risk.


## Game Plan

1. Pack together the direction and error into one channel.
2. Use `5 bits` for direction and `3 bits` for error.
3. Accept quantization tradeoff for simpler storage and fewer channels.

Just do that 