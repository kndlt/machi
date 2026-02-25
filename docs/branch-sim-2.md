Branch Simulation v0.4 — Role-Based Scaffold with Upward Light Bias
Goal

Simulate a branch network where cells specialize based on structural role and local environment.

Living cells represent active growth tips.
Zombie cells represent persistent structural scaffold that transports efficiently with minimal cost.

Growth should naturally favor upward directions and areas with higher light availability while remaining sparse and gappy.

Zombie is not failure — it is specialization into infrastructure.

Leaves are not simulated; they are derived in rendering.

Core Concepts

Role specialization
Cells determine their role based on local topology (connector behavior).

Sparse anchoring
Only a few cells near dirt seed.

Gappy spread
Branches expand only through a fertility band.

Persistent scaffold
Zombie tissue remains and transports efficiently.

Upward light bias
Growth prefers brighter regions above.

State Texture Contract (branch_state RGBA)

R = energy
Represents activity of living tissue.

G = nutrients
Transported resource.

B = structure
Woodness / branch mass that changes slowly.

A = mode

A < 0.33 → empty
0.33 ≤ A < 0.66 → living
A ≥ 0.66 → zombie

Tissue Roles

Living
Grows and spreads
Consumes energy
Located at tips

Zombie
No growth
Zero metabolic cost
Efficient transporter
Persistent

Empty
No transport
No structure

Inputs

u_matter
u_branch_prev
u_noise

Noise is used only for spatial gating.
No seed uniform.

Connector Heuristic

Cells estimate whether they are connectors using neighbors.

Count neighboring tissue cells (living or zombie):

0–1 neighbors → tip behavior
2 neighbors → path segment
3–4 neighbors → junction

Strong connector signal occurs when neighbors are opposite (left+right or up+down).

Role Specialization Rule

Living cell becomes zombie if it appears to be a connector.

Tips remain living.

Zombie becomes empty only when structure decays below threshold.

Rule 0 — Occupancy

Branches exist only in AIR cells.

Rule 1 — Sparse Seeding

Empty cell touching dirt becomes living only if:

noise < SEED_NOISE_MAX

This threshold should be very small.

Rule 2 — Gappy Spread

Spread is allowed only when the candidate cell passes fertility band:

abs(noise − SPREAD_BAND_CENTER) < SPREAD_BAND_WIDTH

This creates natural gaps.

Rule 3 — Growth Support

Spread occurs if:

At least one living neighbor exists

Zombie neighbors provide weak support

Living tips drive expansion

Rule 4 — Nutrient Transport

If touching dirt
nutrients replenish toward maximum

Else
nutrients diffuse from neighboring tissue

Transport efficiency hierarchy:

zombie strongest
living moderate
empty none

Diffusion average preferred.

Rule 5 — Energy

Living energy moves toward potential derived from nutrients.

Small metabolic cost applied.

Zombie energy trends toward zero.

Rule 6 — Structure

Living increases structure slowly.

Zombie decays structure very slowly.

Empty has zero structure.

Structure provides long-term memory.

Rule 7 — Mode Transitions

Living → Zombie
Triggered by connector behavior

Zombie → Empty
Triggered by low structure

Empty → Living
Triggered by seeding or spread

Upward + Light-Favoring Growth
Motivation

Growth should prefer open sky and upward directions while remaining local and inexpensive to compute.

Light is approximated using sparse sampling in a 9×9 vicinity above the candidate cell.

Light Approximation

For a candidate AIR cell:

Estimate light by sampling a small set of positions within a 9×9 region above.

Suggested conceptual sample locations:

Directly above
Multiple upward steps

Diagonal upward positions

A few lateral upward positions

For each sample:

Matter blocks light strongly
Branch tissue partially blocks light

Light starts at 1.0 and subtracts contributions from blockers.

Clamp final light to range 0–1.

Growth Scoring

Instead of strict gating, growth uses a score.

growthScore = baseSupport × lightFactor × upwardFactor

Where:

baseSupport comes from neighbor living and zombie support

lightFactor maps light to a multiplier

upwardFactor boosts growth when support comes from below

Growth succeeds only if growthScore exceeds threshold.

Upward Bias

Neighbors below the candidate contribute strongest support.

Side neighbors contribute medium support.

Neighbors above contribute weakest support.

This creates phototropic growth without global direction planning.

Interaction With Scaffold

Zombie scaffold enables transport and connectivity but contributes weaker growth drive.

Living tips remain primary drivers of expansion.

Parameters (Suggested Defaults)

SEED_NOISE_MAX = 0.03

SPREAD_BAND_CENTER = 0.20
SPREAD_BAND_WIDTH = 0.05

LIGHT_TISSUE_BLOCK = small
LIGHT_MATTER_BLOCK = larger

E_LIVE_MIN = 0.08

B_GROW_RATE = 0.04
B_ROTT_RATE = 0.005
B_EMPTY_THRESH = 0.02

NUTRIENT_ROOT = 1.0
NUTRIENT_DIFFUSE = 0.35

METABOLIC_COST = small

UPWARD_BONUS = moderate

Expected Emergent Behavior

Sparse sprouts from dirt

Branches extend through fertility band

Tips climb toward brighter regions

Interior segments specialize into scaffold

Old corridors persist

Networks stabilize into branching tree-like structures

Acceptance Criteria

No massive simultaneous growth

Visible gaps between branches

Upward drift toward open sky

Zombie scaffold persists

Tips remain living

Network shows path dependence

Future Extensions

Directional wind bias

Seasonal light variation

Multiple fertility bands

Disconnection-based scaffold decay

Leaf rendering pass

Resource competition