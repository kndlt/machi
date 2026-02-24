#version 300 es
precision highp float;

// Foliage simulation fragment shader — cellular automaton.
//
// IN:  matter texture + previous foliage state + noise field
// OUT: new foliage RGBA where channels encode resources:
//        R = energy (0–1): combined vitality, determines color/survival
//        G = nutrients (0–1): supplied by dirt, flows through neighbors
//        B = light (0–1): supplied from above, blocked by canopy
//        A = alive flag (> 0 = alive)
//
// All rules are purely local.  The noise texture is a stable spatial field
// that determines WHERE growth can happen — cells with low noise values are
// fertile, high noise values are barren.  Temporal growth emerges from
// wavefront propagation: seeds appear at dirt, spread one cell per step,
// and energy builds up gradually via blending.  The noise field drifts very
// slowly over time (cosmic rays), occasionally flipping a cell's fate.

in vec2 v_uv;

uniform sampler2D u_matter;
uniform sampler2D u_foliage_prev;
uniform sampler2D u_noise;   // slowly-evolving stable noise field

out vec4 out_color;

// Dirt matter color: (103, 82, 75) / 255
const vec3 DIRT_COLOR = vec3(0.404, 0.322, 0.294);
const float DIRT_THRESHOLD = 0.12;

// ── Resource constants ───────────────────────────────────────────────────
const float NUTRIENT_ROOT  = 1.0;      // Max nutrients at dirt contact
const float NUTRIENT_DECAY = 0.15;     // Nutrient loss per hop through foliage
const float LIGHT_FULL     = 1.0;      // Full light (no canopy above)
const float LIGHT_BLOCK    = 0.2;      // Light lost per foliage pixel above
const float ENERGY_DEATH   = 0.05;     // Below this energy → die
const float ENERGY_GROW_MIN = 0.3;     // Neighbor needs this energy to spread

// ── Growth thresholds (fixed — no step counter) ──────────────────────────
const float SEED_NOISE_MAX   = 0.40;   // Max noise for dirt-adjacent seeding
const float SPREAD_NOISE_MAX = 0.50;   // Max noise for neighbor spreading
const float ENERGY_BLEND     = 0.10;   // Energy convergence rate per step
const float ENERGY_INITIAL   = 0.35;   // New cells start at 35% of potential

bool isDirt(vec4 m) {
  return m.a > 0.5 && distance(m.rgb, DIRT_COLOR) < DIRT_THRESHOLD;
}

bool isAir(vec4 m) {
  return m.a < 0.1;
}

bool hasFoliage(vec4 f) {
  return f.a > 0.05;
}

bool hasMatter(vec4 m) {
  return !isAir(m);
}

void main() {
  vec4 mHere = texture(u_matter, v_uv);
  vec4 fPrev = texture(u_foliage_prev, v_uv);
  vec2 texelSize = 1.0 / vec2(textureSize(u_matter, 0));

  float noise = texture(u_noise, v_uv).r;

  // ── Not air → no foliage ───────────────────────────────────────────────
  if (!isAir(mHere)) {
    out_color = vec4(0.0);
    return;
  }

  // ── Sample 4 neighbors (matter + foliage) ──────────────────────────────
  vec2 offR = vec2( texelSize.x, 0.0);
  vec2 offL = vec2(-texelSize.x, 0.0);
  vec2 offU = vec2(0.0, -texelSize.y); // up in texture = -Y
  vec2 offD = vec2(0.0,  texelSize.y); // down in texture = +Y

  bool touchDirtR = hasMatter(texture(u_matter, v_uv + offR));
  bool touchDirtL = hasMatter(texture(u_matter, v_uv + offL));
  bool touchDirtU = hasMatter(texture(u_matter, v_uv + offU));
  bool touchDirtD = hasMatter(texture(u_matter, v_uv + offD));
  bool touchingDirt = touchDirtR || touchDirtL || touchDirtU || touchDirtD;

  vec4 fR = texture(u_foliage_prev, v_uv + offR);
  vec4 fL = texture(u_foliage_prev, v_uv + offL);
  vec4 fU = texture(u_foliage_prev, v_uv + offU);
  vec4 fD = texture(u_foliage_prev, v_uv + offD);

  int foliageNeighbors = 0;
  if (hasFoliage(fR)) foliageNeighbors++;
  if (hasFoliage(fL)) foliageNeighbors++;
  if (hasFoliage(fU)) foliageNeighbors++;
  if (hasFoliage(fD)) foliageNeighbors++;

  // ── Calculate NUTRIENTS ────────────────────────────────────────────────
  float nutrients = 0.0;
  if (touchingDirt) {
    nutrients = NUTRIENT_ROOT;
  } else {
    if (hasFoliage(fR)) nutrients = max(nutrients, fR.g - NUTRIENT_DECAY);
    if (hasFoliage(fL)) nutrients = max(nutrients, fL.g - NUTRIENT_DECAY);
    if (hasFoliage(fU)) nutrients = max(nutrients, fU.g - NUTRIENT_DECAY);
    if (hasFoliage(fD)) nutrients = max(nutrients, fD.g - NUTRIENT_DECAY);
    nutrients = max(nutrients, 0.0);
  }

  // ── Calculate LIGHT ────────────────────────────────────────────────────
  float light = LIGHT_FULL;
  for (int i = 1; i <= 5; i++) {
    vec4 above = texture(u_foliage_prev, v_uv + vec2(0.0, -texelSize.y * float(i)));
    if (hasFoliage(above)) {
      light -= LIGHT_BLOCK;
    }
    if (hasMatter(texture(u_matter, v_uv + vec2(0.0, -texelSize.y * float(i))))) {
      break;
    }
  }
  light = max(light, 0.0);

  // ── Calculate ENERGY potential ─────────────────────────────────────────
  float potential = nutrients * light;

  bool wasAlive = hasFoliage(fPrev);

  if (wasAlive) {
    // ── SURVIVE ──────────────────────────────────────────────────────────
    // Blend energy toward current potential — gradual strengthening/weakening
    float energy = mix(fPrev.r, potential, ENERGY_BLEND);

    if (energy < ENERGY_DEATH) {
      out_color = vec4(0.0);  // starved
      return;
    }

    out_color = vec4(energy, nutrients, light, 1.0);
  } else {
    // ── GROW ─────────────────────────────────────────────────────────────
    // Rule 1: Seed from dirt — air cell touching dirt with low noise
    if (touchingDirt && noise < SEED_NOISE_MAX) {
      float energy = potential * ENERGY_INITIAL;
      out_color = vec4(energy, nutrients, light, 1.0);
      return;
    }

    // Rule 2: Spread from neighbors — need ≥1 foliage neighbor with
    //         enough energy, viable potential here, and low noise
    if (foliageNeighbors >= 1 && potential >= ENERGY_DEATH) {
      float maxNeighborEnergy = 0.0;
      if (hasFoliage(fR)) maxNeighborEnergy = max(maxNeighborEnergy, fR.r);
      if (hasFoliage(fL)) maxNeighborEnergy = max(maxNeighborEnergy, fL.r);
      if (hasFoliage(fU)) maxNeighborEnergy = max(maxNeighborEnergy, fU.r);
      if (hasFoliage(fD)) maxNeighborEnergy = max(maxNeighborEnergy, fD.r);

      // Neighbor must be established (high energy) and local noise must be low.
      // Base threshold allows 1-neighbor frontier to expand; more neighbors widen it.
      float spreadThreshold = SPREAD_NOISE_MAX
                            * (0.5 + float(foliageNeighbors) * 0.25);
      if (maxNeighborEnergy >= ENERGY_GROW_MIN && noise < spreadThreshold) {
        float energy = potential * ENERGY_INITIAL;
        out_color = vec4(energy, nutrients, light, 1.0);
        return;
      }
    }

    out_color = vec4(0.0);
  }
}
