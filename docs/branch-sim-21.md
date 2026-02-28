# Branch Sim 21: Consolidate Simulation Config into a Uniform Buffer Object (UBO)

This proposal describes moving simulation configuration uniforms in `simulation.frag` from many standalone uniforms to a single WebGL2 Uniform Buffer Object (UBO).

## Motivation

The current shader exposes many config uniforms and constants spread across shader code and TS setup. This has a few problems:

1. **State churn on CPU:** many `gl.uniform*` calls every frame/tick.
2. **Config drift risk:** related values can get out of sync when set individually.
3. **Harder evolution:** adding/removing tuning params means touching more binding code.

A UBO can centralize simulation config updates into one structured upload.

## Scope

### In scope

- Move scalar/flag config values into one UBO block (std140 layout).
- Keep texture samplers (`u_matter`, `u_foliage_prev`, `u_branch_tex2_prev`, `u_noise`, `u_light`) as regular uniforms.
- Keep per-dispatch fields (`tick`, feature toggles) in the same UBO so one upload covers all runtime config.

### Out of scope

- Moving sampled textures into UBO (not supported; samplers cannot be UBO members in GLSL ES 3.00).
- Changing simulation math/behavior.
- Refactoring unrelated shaders in this step.

## Proposed UBO Layout

Use one block, e.g.:

```glsl
layout(std140) uniform SimConfig {
  vec4 turnAndBranchA;      // x=branch_side_rate, y=main_turn_rate, z=main_turn_rate_blocked, w=main_turn_max
  vec4 turnAndBranchB;      // x=root_side_rate, y=root_turn_rate, z=root_turn_rate_blocked, w=root_turn_max
  vec4 sideAnglesBranchRoot; // x=branch_side_angle_min, y=branch_side_angle_max, z=root_side_angle_min, w=root_side_angle_max

  vec4 inhibitionAndCone;   // x=inhibition_max, y=branch_inhibition_decay, z=root_inhibition_decay, w=forward_cone_cos

  vec4 resourceFlowA;       // x=canopy_fraction, y=anti_canopy_fraction, z=dirt_diffusion_fraction, w=root_sap_threshold
  vec4 resourceFlowB;       // x=root_sap_amount, y=root_creation_cost, z=branch_creation_cost, w=reserved

  ivec4 flagsAndTick;       // x=branching_enabled, y=branch_inhibition_enabled, z=main_turn_enabled, w=tick
};
```

Notes:
- `std140` alignment is predictable and safe across drivers.
- Use packed `vec4/ivec4` groups to avoid fragile per-scalar alignment issues.
- Keep byte-domain constants (`RESOURCE_*_I`, direction LUT constants) as compile-time constants unless they need runtime tuning.

## CPU-Side Binding Plan (WebGL2)

1. Create one UBO (`gl.createBuffer`) sized to the std140 struct.
2. Bind it to a fixed binding point, e.g. `SIM_CONFIG_BINDING = 0`.
3. In program setup:
   - `blockIndex = gl.getUniformBlockIndex(program, "SimConfig")`
   - `gl.uniformBlockBinding(program, blockIndex, SIM_CONFIG_BINDING)`
4. Per frame/tick:
   - Fill one `Float32Array`/`Int32Array` backing store with grouped values.
   - Upload once via `gl.bufferSubData`.

Implementation detail:
- Prefer one `ArrayBuffer` with `Float32Array` + `Int32Array` views for mixed float/int fields in the same UBO payload.

## Migration Steps

### Step 1: Add UBO in shader (non-breaking)

- Add `SimConfig` block while keeping old uniforms temporarily.
- Switch internal shader reads to UBO fields.
- Keep outputs/logic identical.

### Step 2: Wire CPU uploads

- Add UBO creation/binding in `FoliageSim.ts` program init.
- Populate all current runtime config each step from existing TS values.
- Remove old `gl.uniform*` writes for migrated fields.

### Step 3: Remove legacy uniforms

- Delete migrated uniform declarations from shader.
- Remove stale uniform-location lookups in TS.
- Keep sampler uniforms unchanged.

### Step 4: Validate

- Visual parity on baseline maps/seeds.
- Verify toggles (`branching`, `inhibition`, `swerving`) still respond correctly.
- Compare nutrient HUD and growth behavior over several ticks/seeds.

## Risks and Mitigations

1. **std140 packing mistakes**
   - Mitigation: use only `vec4/ivec4` groups; avoid scalar interleaving.
2. **Driver differences**
   - Mitigation: WebGL2-compliant `std140` only; avoid advanced layout assumptions.
3. **Mixed int/float write bugs**
   - Mitigation: centralized pack helper in TS with explicit offsets and tests.

## Expected Outcome

- Fewer per-frame GL calls (single UBO update instead of many uniforms).
- Cleaner shader interface: config is one coherent block.
- Easier future tuning: adding params is structured and less error-prone.

## Optional Follow-up

If this works well in `simulation.frag`, apply the same pattern to other config-heavy shaders (e.g., map/debug passes) for consistency.
