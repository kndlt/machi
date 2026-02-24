#version 300 es
precision highp float;

// Foliage simulation fragment shader.
//
// IN:  matter texture + previous foliage state
// OUT: new foliage RGBA where channels encode resources:
//        R = energy (0–1): combined vitality, determines color/survival
//        G = nutrients (0–1): supplied by dirt, flows through neighbors
//        B = light (0–1): supplied from above, blocked by canopy
//        A = alive flag (> 0 = alive)

in vec2 v_uv;

uniform sampler2D u_matter;
uniform sampler2D u_foliage_prev;
uniform sampler2D u_noise;  // slowly-evolving noise gradient

out vec4 out_color;

// Dirt matter color: (103, 82, 75) / 255
const vec3 DIRT_COLOR = vec3(0.404, 0.322, 0.294);
const float DIRT_THRESHOLD = 0.12;

// ── Resource constants ───────────────────────────────────────────────────
const float NUTRIENT_ROOT = 1.0;       // Max nutrients at dirt contact
const float NUTRIENT_DECAY = 0.15;     // Nutrient loss per hop through foliage
const float LIGHT_FULL = 1.0;          // Full light (no canopy above)
const float LIGHT_BLOCK = 0.2;         // Light lost per foliage pixel above
const float ENERGY_DEATH = 0.05;       // Below this energy → die
const float ENERGY_GROW_MIN = 0.3;     // Neighbor needs this energy to spread
const float GROW_BASE_CHANCE = 0.15;   // Base probability for growth attempt

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
  
  float rngStable = texture(u_noise, v_uv).r;

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

  bool dirtR = hasMatter(texture(u_matter, v_uv + offR));
  bool dirtL = hasMatter(texture(u_matter, v_uv + offL));
  bool dirtU = hasMatter(texture(u_matter, v_uv + offU));
  bool dirtD = hasMatter(texture(u_matter, v_uv + offD));
  bool isTouchingDirt = dirtR || dirtL || dirtU || dirtD;

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
  if (isTouchingDirt) {
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

  // ── Calculate ENERGY ───────────────────────────────────────────────────
  float energy = nutrients * light;

  bool wasAlive = hasFoliage(fPrev);

  if (wasAlive) {
    // ── Survival ─────────────────────────────────────────────────────────
    if (energy < ENERGY_DEATH) {
      out_color = vec4(0.0);
      return;
    }

    if (isTouchingDirt) {
      out_color = vec4(energy, nutrients, light, 1.0);
      return;
    }

    if (foliageNeighbors < 2) {
      out_color = vec4(0.0);
      return;
    }

    out_color = vec4(energy, nutrients, light, 1.0);
  } else {
    // ── Growth ───────────────────────────────────────────────────────────
    if (isTouchingDirt && rngStable < 0.25) {
      out_color = vec4(energy, nutrients, light, 1.0);
      return;
    }

    if (foliageNeighbors >= 1 && energy >= ENERGY_DEATH) {
      float maxNeighborEnergy = 0.0;
      if (hasFoliage(fR)) maxNeighborEnergy = max(maxNeighborEnergy, fR.r);
      if (hasFoliage(fL)) maxNeighborEnergy = max(maxNeighborEnergy, fL.r);
      if (hasFoliage(fU)) maxNeighborEnergy = max(maxNeighborEnergy, fU.r);
      if (hasFoliage(fD)) maxNeighborEnergy = max(maxNeighborEnergy, fD.r);

      if (maxNeighborEnergy >= ENERGY_GROW_MIN) {
        float chance = GROW_BASE_CHANCE * (float(foliageNeighbors) * 0.5);
        if (rngStable < chance) {
          out_color = vec4(energy, nutrients, light, 1.0);
          return;
        }
      }
    }
    out_color = vec4(0.0);
  }
}
