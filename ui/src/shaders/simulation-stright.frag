#version 300 es
precision highp float;

// Branch simulation shader (v0.3 directional growth model).
//
// IN:
//   - u_matter      : world occupancy/materials
//   - u_foliage_prev: previous branch map
//   - u_noise       : slowly evolving fertility noise
//
// OUT (branch map RGBA):
//   R = occupancy (1.0 branch, 0.0 empty)
//   G = direction (0..1 full angle; 256 encoded headings)
//   B = Bresenham-style error accumulator (0..1)
//   A = occupancy alpha
//
// Growth logic (no auto-seeding mode):
// - Existing branches persist.
// - Empty AIR cells may grow only from exactly one neighboring branch source.
// - No dirt-based automatic seeding.

in vec2 v_uv;

uniform sampler2D u_matter;
uniform sampler2D u_foliage_prev;
uniform sampler2D u_light;   // currently unused in v0.3 model
uniform sampler2D u_noise;

out vec4 out_color;

// Matter colors (from matter.png palette)
const vec3 DIRT_COLOR  = vec3(0.404, 0.322, 0.294);  // (103, 82, 75)
const vec3 STONE_COLOR = vec3(0.647, 0.592, 0.561);  // (165, 151, 143)
const vec3 WATER_COLOR = vec3(0.200, 0.600, 0.800);  // (51, 153, 204)
const float COLOR_THRESHOLD = 0.12;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

const float BRANCH_ALPHA_MIN = 0.5;

bool isWater(vec4 m) {
  return m.a > 0.5 && distance(m.rgb, WATER_COLOR) < COLOR_THRESHOLD;
}

bool isAir(vec4 m) {
  return m.a < 0.1;
}

bool isBranch(vec4 b) {
  return b.a > BRANCH_ALPHA_MIN;
}

vec2 dirFromEncoded(float encoded) {
  float angle = encoded * TAU;
  return vec2(sin(angle), -cos(angle));
}

float encodeDir(vec2 direction) {
  float angle = atan(direction.x, -direction.y);
  if (angle < 0.0) angle += TAU;
  return angle / TAU;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 makeBranch(float encodedDir, float errorAcc) {
  return vec4(1.0, fract(encodedDir), fract(errorAcc), 1.0);
}

vec4 emptyCell() {
  return vec4(0.0);
}

bool sameStep(vec2 a, vec2 b) {
  return distance(a, b) < 0.25;
}

void lineStepper(vec2 dir, out vec2 primaryStep, out vec2 secondaryStep, out float slopeMix) {
  float vx = dir.x;
  float vy = dir.y;
  float ax = abs(vx);
  float ay = abs(vy);
  float sx = (vx > 0.0) ? 1.0 : ((vx < 0.0) ? -1.0 : 0.0);
  float sy = (vy > 0.0) ? 1.0 : ((vy < 0.0) ? -1.0 : 0.0);

  if (ax >= ay) {
    primaryStep = vec2(sx, 0.0);
    secondaryStep = vec2(sx, sy);
    slopeMix = (ax > 0.0) ? (ay / ax) : 0.0;
  } else {
    primaryStep = vec2(0.0, sy);
    secondaryStep = vec2(sx, sy);
    slopeMix = (ay > 0.0) ? (ax / ay) : 0.0;
  }
}

void main() {
  vec4 mHere = texture(u_matter, v_uv);
  vec4 branchPrev = texture(u_foliage_prev, v_uv);
  vec2 texelSize = 1.0 / vec2(textureSize(u_matter, 0));

  // Branches only exist in air.
  if (!isAir(mHere)) {
    out_color = emptyCell();
    return;
  }

  // Existing branch persists (no decay in this phase).
  if (isBranch(branchPrev)) {
    out_color = branchPrev;
    return;
  }

  vec2 offsets[8] = vec2[8](
    vec2(0.0, -texelSize.y),
    vec2(texelSize.x, -texelSize.y),
    vec2(texelSize.x, 0.0),
    vec2(texelSize.x, texelSize.y),
    vec2(0.0, texelSize.y),
    vec2(-texelSize.x, texelSize.y),
    vec2(-texelSize.x, 0.0),
    vec2(-texelSize.x, -texelSize.y)
  );
  vec2 latticeOffsets[8] = vec2[8](
    vec2(0.0, -1.0),
    vec2(1.0, -1.0),
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0),
    vec2(-1.0, 1.0),
    vec2(-1.0, 0.0),
    vec2(-1.0, -1.0)
  );

  int branchNeighborCount = 0;
  int sourceIdx = -1;
  bool touchingWater = false;

  for (int i = 0; i < 8; i++) {
    vec2 uvN = v_uv + offsets[i];
    vec4 mN = texture(u_matter, uvN);
    if (isWater(mN)) touchingWater = true;

    vec4 bN = texture(u_foliage_prev, uvN);
    if (isBranch(bN)) {
      branchNeighborCount++;
      sourceIdx = i;
    }
  }

  if (touchingWater) {
    out_color = emptyCell();
    return;
  }

  // No automatic seed: if no branch source, remain empty.
  // Also reject >1 sources to discourage clumped fills.
  if (branchNeighborCount != 1) {
    out_color = emptyCell();
    return;
  }

  vec2 sourceUV = v_uv + offsets[sourceIdx];
  vec4 sourceBranch = texture(u_foliage_prev, sourceUV);
  vec2 sourceDir = dirFromEncoded(sourceBranch.g);

  vec2 primaryStep;
  vec2 secondaryStep;
  float slopeMix;
  lineStepper(sourceDir, primaryStep, secondaryStep, slopeMix);

  float err = fract(sourceBranch.b);
  float errNext = err + slopeMix;
  bool takeSecondary = errNext >= 1.0;
  vec2 expectedStep = takeSecondary ? secondaryStep : primaryStep;
  float childErr = takeSecondary ? (errNext - 1.0) : errNext;

  // Direction from source cell toward current candidate cell.
  vec2 toCurrent = -latticeOffsets[sourceIdx];

  // Deterministic straight raster growth from source based on heading + error accumulator.
  if (!sameStep(toCurrent, expectedStep)) {
    out_color = emptyCell();
    return;
  }

  out_color = makeBranch(sourceBranch.g, childErr);
}
