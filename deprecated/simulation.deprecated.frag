#version 300 es
precision highp float;

// Branch simulation shader (readable rule-based v0.4).
//
// IN:
//   - u_matter      : world occupancy/materials
//   - u_foliage_prev: previous branch_state RGBA
//   - u_light       : packed directional light transport field
//   - u_noise       : spatial gating field
//
// OUT (branch_state RGBA):
//   R = energy
//   G = nutrients
//   B = structure
//   A = mode (0.0 empty, 0.5 living, 1.0 zombie)

in vec2 v_uv;

uniform sampler2D u_matter;
uniform sampler2D u_foliage_prev;
uniform sampler2D u_light;
uniform sampler2D u_noise;   // slowly-evolving stable noise field

out vec4 out_color;

// Matter colors (from matter.png palette)
const vec3 DIRT_COLOR  = vec3(0.404, 0.322, 0.294);  // (103, 82, 75)
const vec3 STONE_COLOR = vec3(0.647, 0.592, 0.561);  // (165, 151, 143)
const vec3 WATER_COLOR = vec3(0.200, 0.600, 0.800);  // (51, 153, 204)
const float COLOR_THRESHOLD = 0.12;

// ── Mode encoding (branch_state A) ───────────────────────────────────────
const float MODE_EMPTY = 0.0;
const float MODE_LIVING = 0.5;
const float MODE_ZOMBIE = 1.0;

// ── Growth + transport constants (readable defaults) ─────────────────────
const float SEED_NOISE_MAX = 0.03;
const float SPREAD_BAND_CENTER = 0.20;
const float SPREAD_BAND_WIDTH = 0.05;
const float GROWTH_SCORE_MIN = 0.28;

const float SUPPORT_FROM_BELOW = 1.00;
const float SUPPORT_FROM_SIDE = 0.60;
const float SUPPORT_FROM_ABOVE = 0.30;
const float ZOMBIE_SUPPORT_SCALE = 0.35;

const float LIGHT_RESPONSE_MIN = 0.65;
const float LIGHT_RESPONSE_MAX = 1.40;
const float LIGHT_UPWARD_WEIGHT = 0.60;
const float LIGHT_SIDE_WEIGHT = 0.25;
const float LIGHT_BASE_WEIGHT = 0.15;

const float UPWARD_BONUS = 0.50;

const float NUTRIENT_ROOT = 1.0;
const float NUTRIENT_DIFFUSE_RATE = 0.35;
const float NUTRIENT_FROM_LIVING = 0.60;
const float NUTRIENT_FROM_ZOMBIE = 1.00;

const float METABOLIC_COST = 0.03;
const float ENERGY_BLEND = 0.15;
const float E_LIVE_MIN = 0.08;

const float B_GROW_RATE = 0.04;
const float B_ROTT_RATE = 0.005;
const float B_EMPTY_THRESH = 0.02;

bool isDirt(vec4 m) {
  return m.a > 0.5 && distance(m.rgb, DIRT_COLOR) < COLOR_THRESHOLD;
}

bool isStone(vec4 m) {
  return m.a > 0.5 && distance(m.rgb, STONE_COLOR) < COLOR_THRESHOLD;
}

bool isWater(vec4 m) {
  return m.a > 0.5 && distance(m.rgb, WATER_COLOR) < COLOR_THRESHOLD;
}

bool isAir(vec4 m) {
  return m.a < 0.1;
}

bool isLiving(vec4 s) {
  return s.a >= 0.33 && s.a < 0.66;
}

bool isZombie(vec4 s) {
  return s.a >= 0.66;
}

bool hasTissue(vec4 s) {
  return isLiving(s) || isZombie(s);
}

float modeToAlpha(float mode) {
  if (mode > 0.75) return MODE_ZOMBIE;
  if (mode > 0.25) return MODE_LIVING;
  return MODE_EMPTY;
}

float supportWeight(vec4 s, float baseWeight) {
  if (isLiving(s)) return baseWeight;
  if (isZombie(s)) return baseWeight * ZOMBIE_SUPPORT_SCALE;
  return 0.0;
}

float decodeNibble(vec4 packed, int dir) {
  vec4 bytes = floor(packed * 255.0 + 0.5);
  float b;
  if (dir == 0 || dir == 1) b = bytes.r;
  else if (dir == 2 || dir == 3) b = bytes.g;
  else if (dir == 4 || dir == 5) b = bytes.b;
  else b = bytes.a;

  float nibble = mod(floor(b / (dir % 2 == 0 ? 1.0 : 16.0)), 16.0);
  return nibble / 15.0;
}

void main() {
  vec4 mHere = texture(u_matter, v_uv);
  vec4 prev = texture(u_foliage_prev, v_uv);
  vec2 texelSize = 1.0 / vec2(textureSize(u_matter, 0));
  float noise = texture(u_noise, v_uv).r;

  // Rule 0 — occupancy
  if (!isAir(mHere)) {
    out_color = vec4(0.0);
    return;
  }

  // 4-neighbor sampling
  vec2 offR = vec2( texelSize.x, 0.0);
  vec2 offL = vec2(-texelSize.x, 0.0);
  vec2 offU = vec2(0.0, -texelSize.y); // up in texture = -Y
  vec2 offD = vec2(0.0,  texelSize.y); // down in texture = +Y

  vec4 mR = texture(u_matter, v_uv + offR);
  vec4 mL = texture(u_matter, v_uv + offL);
  vec4 mU = texture(u_matter, v_uv + offU);
  vec4 mD = texture(u_matter, v_uv + offD);

  // keep water as hard exclusion zone
  bool touchingWater = isWater(mR) || isWater(mL) || isWater(mU) || isWater(mD);
  if (touchingWater) {
    out_color = vec4(0.0);
    return;
  }

  // Classify neighbor surfaces
  bool touchDirtR = isDirt(mR);
  bool touchDirtL = isDirt(mL);
  bool touchDirtU = isDirt(mU);
  bool touchDirtD = isDirt(mD);
  bool touchingDirt = touchDirtR || touchDirtL || touchDirtU || touchDirtD;

  bool touchStoneR = isStone(mR);
  bool touchStoneL = isStone(mL);
  bool touchStoneU = isStone(mU);
  bool touchStoneD = isStone(mD);
  bool touchingStone = touchStoneR || touchStoneL || touchStoneU || touchStoneD;

  vec4 sR = texture(u_foliage_prev, v_uv + offR);
  vec4 sL = texture(u_foliage_prev, v_uv + offL);
  vec4 sU = texture(u_foliage_prev, v_uv + offU);
  vec4 sD = texture(u_foliage_prev, v_uv + offD);

  bool livingPrev = isLiving(prev);
  bool zombiePrev = isZombie(prev);
  bool emptyPrev = !livingPrev && !zombiePrev;

  bool tissueR = hasTissue(sR);
  bool tissueL = hasTissue(sL);
  bool tissueU = hasTissue(sU);
  bool tissueD = hasTissue(sD);

  int tissueNeighbors = 0;
  if (tissueR) tissueNeighbors++;
  if (tissueL) tissueNeighbors++;
  if (tissueU) tissueNeighbors++;
  if (tissueD) tissueNeighbors++;

  int livingNeighbors = 0;
  if (isLiving(sR)) livingNeighbors++;
  if (isLiving(sL)) livingNeighbors++;
  if (isLiving(sU)) livingNeighbors++;
  if (isLiving(sD)) livingNeighbors++;

  bool oppositeConnector = (tissueL && tissueR) || (tissueU && tissueD);
  bool isConnector = oppositeConnector || tissueNeighbors >= 3;

  // Rule 1 + Rule 2
  bool fertilityPass = abs(noise - SPREAD_BAND_CENTER) < SPREAD_BAND_WIDTH;
  bool seedPass = touchingDirt && noise < SEED_NOISE_MAX;

  // Rule 3 support model
  float supportBelow = supportWeight(sD, SUPPORT_FROM_BELOW);
  float supportAbove = supportWeight(sU, SUPPORT_FROM_ABOVE);
  float supportSides = supportWeight(sL, SUPPORT_FROM_SIDE) + supportWeight(sR, SUPPORT_FROM_SIDE);
  float baseSupport = supportBelow + supportSides + supportAbove;
  float upwardFactor = 1.0 + UPWARD_BONUS * clamp(supportBelow - supportAbove, 0.0, 1.0);

  // Dedicated light layer decode
  vec4 packedLight = texture(u_light, v_uv);
  float lUp = decodeNibble(packedLight, 0);
  float lUpRight = decodeNibble(packedLight, 1);
  float lRight = decodeNibble(packedLight, 2);
  float lDownRight = decodeNibble(packedLight, 3);
  float lDown = decodeNibble(packedLight, 4);
  float lDownLeft = decodeNibble(packedLight, 5);
  float lLeft = decodeNibble(packedLight, 6);
  float lUpLeft = decodeNibble(packedLight, 7);

  float lightUpward = (lUp + lUpRight + lUpLeft) / 3.0;
  float lightSide = (lRight + lLeft) / 2.0;
  float lightBase = (lUp + lUpRight + lRight + lDownRight + lDown + lDownLeft + lLeft + lUpLeft) / 8.0;
  float lightScalar = clamp(
    LIGHT_UPWARD_WEIGHT * lightUpward
      + LIGHT_SIDE_WEIGHT * lightSide
      + LIGHT_BASE_WEIGHT * lightBase,
    0.0,
    1.0
  );
  float lightFactor = mix(LIGHT_RESPONSE_MIN, LIGHT_RESPONSE_MAX, lightScalar);

  float growthScore = baseSupport * lightFactor * upwardFactor;
  bool spreadPass = fertilityPass && livingNeighbors >= 1 && growthScore >= GROWTH_SCORE_MIN;

  // Rule 4 — nutrients
  float nutrientTarget = 0.0;
  if (touchingDirt) {
    nutrientTarget = NUTRIENT_ROOT;
  } else {
    float nutrientSum = 0.0;
    float nutrientWeight = 0.0;
    if (isLiving(sR)) { nutrientSum += sR.g * NUTRIENT_FROM_LIVING; nutrientWeight += NUTRIENT_FROM_LIVING; }
    else if (isZombie(sR)) { nutrientSum += sR.g * NUTRIENT_FROM_ZOMBIE; nutrientWeight += NUTRIENT_FROM_ZOMBIE; }
    if (isLiving(sL)) { nutrientSum += sL.g * NUTRIENT_FROM_LIVING; nutrientWeight += NUTRIENT_FROM_LIVING; }
    else if (isZombie(sL)) { nutrientSum += sL.g * NUTRIENT_FROM_ZOMBIE; nutrientWeight += NUTRIENT_FROM_ZOMBIE; }
    if (isLiving(sU)) { nutrientSum += sU.g * NUTRIENT_FROM_LIVING; nutrientWeight += NUTRIENT_FROM_LIVING; }
    else if (isZombie(sU)) { nutrientSum += sU.g * NUTRIENT_FROM_ZOMBIE; nutrientWeight += NUTRIENT_FROM_ZOMBIE; }
    if (isLiving(sD)) { nutrientSum += sD.g * NUTRIENT_FROM_LIVING; nutrientWeight += NUTRIENT_FROM_LIVING; }
    else if (isZombie(sD)) { nutrientSum += sD.g * NUTRIENT_FROM_ZOMBIE; nutrientWeight += NUTRIENT_FROM_ZOMBIE; }
    if (nutrientWeight > 0.0) nutrientTarget = nutrientSum / nutrientWeight;
  }
  float nutrients = mix(prev.g, nutrientTarget, NUTRIENT_DIFFUSE_RATE);

  // Rule 7 — mode transitions
  float nextMode = MODE_EMPTY;
  if (zombiePrev) {
    nextMode = MODE_ZOMBIE;
  } else if (livingPrev) {
    nextMode = isConnector ? MODE_ZOMBIE : MODE_LIVING;
  } else {
    bool becomeLiving = seedPass || spreadPass;
    nextMode = becomeLiving ? MODE_LIVING : MODE_EMPTY;
  }

  // Rule 6 — structure
  float structure = prev.b;
  if (nextMode == MODE_LIVING) {
    structure = min(1.0, structure + B_GROW_RATE);
  } else if (nextMode == MODE_ZOMBIE) {
    structure = max(0.0, structure - B_ROTT_RATE);
    if (structure < B_EMPTY_THRESH) {
      nextMode = MODE_EMPTY;
      structure = 0.0;
    }
  } else {
    structure = 0.0;
  }

  // Rule 5 — energy
  float energy = prev.r;
  if (nextMode == MODE_LIVING) {
    float potential = nutrients * lightScalar;
    energy = mix(prev.r, potential, ENERGY_BLEND) - METABOLIC_COST;
    energy = clamp(energy, 0.0, 1.0);
    if (energy < E_LIVE_MIN) {
      nextMode = MODE_EMPTY;
      energy = 0.0;
      structure = 0.0;
      nutrients = 0.0;
    }
  } else if (nextMode == MODE_ZOMBIE) {
    energy = mix(prev.r, 0.0, 0.5);
  } else {
    energy = 0.0;
    nutrients = 0.0;
  }

  out_color = vec4(energy, nutrients, structure, modeToAlpha(nextMode));
}
