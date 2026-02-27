# Branch Sim v0.17

## Scope

Introduce nutrient consumption costs for **new cell creation** and block growth when cost cannot be paid.

## Goal

- New root creation consumes nutrient.
- New branch creation consumes nutrient.
- If nutrient is unavailable/insufficient, the new cell is **not** created.

## Unit Naming

- Use `nu` (nutrient unit) as the canonical accounting unit.
- Nutrient values and creation costs are both expressed in `nu`.
- Conserved-like metric uses: `N-like (nu) = nutrient_total (nu) + embodied_creation_cost (nu)`.

## Rules

- Apply cost checks at claim time (before accepting a claim).
- Costs are paid from the candidate/target cell nutrient value.
- Failed claims must not mutate nutrient.
- Existing transport logic remains unchanged.

### Policy Lock: No Debt Spawn

Use strict no-debt gating:

- Require `candidateNutrient >= requiredCost` for spawn.
- If not enough nutrient, reject claim (no spawn).
- Do not allow creation to write negative debt from an empty/insufficient target cell.

## Cost Model (initial)

- `ROOT_CREATION_COST` (signed nutrient units)
- `BRANCH_CREATION_COST` (signed nutrient units)

These start as constants for easy tuning.

## Claim-time Algorithm

For each geometric/topology-valid claim candidate:

1. Read `candidateNutrient` from target cell.
2. Select `requiredCost` by output type (`root` or `branch`).
3. Require `candidateNutrient >= requiredCost`.
4. If false: reject claim.
5. If true: accept claim and set `chosenResource = candidateNutrient - requiredCost`.

Spawn writeback equation:

- `newCellNutrient = candidateNutrient - creationCost`

## Root Seed Path

- Apply the same cost gate to root-seed creation.
- Root-seed claims do not bypass cost checks.

## Branch / Side-Branch Path

- Apply the same cost gate to both:
  - main-path branch claims
  - side-branch claims
- Keep ambiguity handling unchanged (`claimCount == 1`).

## Conservation Intent

- Nutrient decreases only on successful creation events by exactly the configured cost.
- Failed claims leave nutrient unchanged.
- No hidden per-tick gather terms are reintroduced.

## Invariant (Target)

Define:

- `N_total = sum of signed nutrient over all cells`
- `R = number of root cells`
- `B = number of branch cells`
- `C_r = ROOT_CREATION_COST`
- `C_b = BRANCH_CREATION_COST`

Target conserved quantity:

- `I = N_total + (C_r * R) + (C_b * B)`

Expectation:

- `I` stays stable over time, except small drift from byte quantization/clamp edge cases.

## Validation Checklist

- Root creation is blocked when target nutrient < `ROOT_CREATION_COST`.
- Branch creation is blocked when target nutrient < `BRANCH_CREATION_COST`.
- Successful root creation subtracts exactly `ROOT_CREATION_COST`.
- Successful branch creation subtracts exactly `BRANCH_CREATION_COST`.
- Failed creation leaves target nutrient unchanged.
- Occupied-cell transport behavior is unchanged.

## Practical Implication

- If air cells have neutral nutrient and `BRANCH_CREATION_COST > 0`, branch spawn into air is blocked unless nutrient is present at the candidate cell (authored or transported there beforehand).
