# Branch Simulation v0.2 — Zombie Scaffold Backbone

## Goal

Simulate a branch network with three tissue modes:

- Living tips that grow and consume energy
- Zombie scaffold that persists and transports efficiently
- Empty space

The scaffold acts as long-term structural memory and transport backbone.
Leaves are NOT simulated — they are rendered from branch vitality.

This version prioritizes:
- sparse anchoring
- gappy spread
- persistent networks
- simple local rules

---

## State Texture Contract (`branch_state` RGBA)

- **R = energy** (0..1)
  - vitality of living tissue
  - always near 0 for zombie

- **G = nutrients** (0..1)
  - transported through living and zombie tissue

- **B = structure** (0..1)
  - branch mass / woodness
  - grows when living
  - decays slowly when zombie

- **A = mode**
  - A < 0.33 → empty
  - 0.33 ≤ A < 0.66 → living
  - A ≥ 0.66 → zombie

---

## Environment Inputs

- `u_matter` (dirt / stone / air / water)
- `u_branch_prev`
- `u_noise` (stable fertility field)

No `u_seed` for now.

---

## Tissue Roles

### Living tissue
- grows and spreads
- consumes energy each tick
- can transition to zombie when weak

### Zombie scaffold
- does NOT grow
- consumes no energy
- transports nutrients efficiently
- decays slowly
- supports future growth

### Empty
- no transport
- no structure

---

## Key Principles

### 1. Sparse anchoring
Only a small number of cells touching dirt should seed.

Use noise gate:

```
noise < SEED_NOISE_MAX (very small threshold)
```

This ensures scattered anchor points and avoids carpet growth.

---

### 2. Gappy spread
Branches should not fill all space.

Spread is allowed only when noise lies within a fertility band:
```
abs(noise - SPREAD_BAND_CENTER) < SPREAD_BAND_WIDTH
```

This creates natural gaps and branching paths.

---

### 3. Scaffold as transport backbone

Transport efficiency hierarchy:
```
zombie > living > empty
```

Zombie tissue is the most efficient transporter and has zero metabolic cost.

This causes nutrient flow to prefer established corridors.

---

### 4. Structure vs vitality separation

Structure (B) changes slowly and persists.
Energy (R) changes quickly.

This allows dead branches to remain as wood.

---

## Core Simulation Rules

### Rule 0 — Occupancy
Branches only exist in AIR cells.
Non-air cells are forced empty.

---

### Rule 1 — Nutrient transport (G)

If touching dirt:
- nutrients replenish toward 1.0

Else:
- diffuse from neighboring tissue with weighted transport:

Transport weights:

- zombie neighbor → strongest
- living neighbor → moderate
- empty → none

Diffusion average preferred over max propagation.

---

### Rule 2 — Energy update (R)

Only meaningful for living tissue.

Energy moves toward:
```
potential = nutrients * lightApprox
```

For v0.2:
```
lightApprox = 1.0
```

Apply small metabolic cost to living cells.

Zombie energy decays toward zero.

---

### Rule 3 — Mode transitions (A)

Hysteresis style thresholds:

Living persists if:
```
energy < E_ZOMBIE_ENTER
```

Zombie becomes empty only when:
```
structure < B_EMPTY_THRESH
```

---

### Rule 4 — Structure update (B)

If living:
- structure increases slowly toward 1.0

If zombie:
- structure decays slowly

If empty:
- structure is zero

Structure provides long-term scaffold memory.

---

### Rule 5 — Growth / birth

Empty cell can become living if supported.

Support sources:

#### Anchor support
- touching dirt
- passes sparse seed gate

#### Spread support
- at least one living neighbor with sufficient energy
OR
- multiple zombie neighbors (scaffold density)

AND passes fertility band gate.

---

## Transport Behavior

Nutrients prefer scaffold corridors.
Living tips extend outward but rely on scaffold to remain supplied.

This creates tree-like growth patterns.

---

## Parameters (Suggested Defaults)

### Seeding
SEED_NOISE_MAX = 0.03

### Spread band
SPREAD_BAND_CENTER = 0.20  
SPREAD_BAND_WIDTH  = 0.05  

### Energy thresholds
E_LIVE_MIN     = 0.08  
E_ZOMBIE_ENTER = 0.05  

### Structure
B_GROW_RATE    = 0.04  
B_ROTT_RATE    = 0.005  
B_EMPTY_THRESH = 0.02  

### Nutrients
NUTRIENT_ROOT     = 1.0  
NUTRIENT_DIFFUSE  = 0.35  
NUTRIENT_DECAY    = 0.10  

### Metabolism
METABOLIC_COST = small (~0.01)

---

## Expected Emergent Behavior

- Few stable sprouts from dirt
- Branches extend through fertility band creating gaps
- Living tips die and become scaffold
- Scaffold persists and routes nutrients
- Networks stabilize into branching structures

---

## Acceptance Criteria

- No massive simultaneous growth from dirt
- Visible gaps between branches
- Zombie scaffold persists and supports transport
- No flicker between states
- Network shows path dependence

---

## Future Extensions (not v0.2)

- directional growth bias
- light attenuation from canopy
- multiple fertility bands
- scaffold decay when disconnected
- seasonal noise drift
- leaf rendering pass