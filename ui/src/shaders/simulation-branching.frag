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
// - Empty AIR cells accept growth from exactly one valid source claim.
// - No dirt-based automatic seeding.
// - Sources may occasionally emit a side branch.

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
const float BRANCH_SIDE_RATE = 0.30;
const float BRANCH_SIDE_ANGLE = PI / 6.0; // 30 deg

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

vec2 rotateVec(vec2 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
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

vec2 nearestStep8(vec2 dir) {
  vec2 steps[8] = vec2[8](
    vec2(0.0, -1.0),
    vec2(1.0, -1.0),
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0),
    vec2(-1.0, 1.0),
    vec2(-1.0, 0.0),
    vec2(-1.0, -1.0)
  );

  float bestDot = -2.0;
  int bestIdx = 0;
  for (int i = 0; i < 8; i++) {
    float s = dot(normalize(steps[i]), normalize(dir));
    if (s > bestDot) {
      bestDot = s;
      bestIdx = i;
    }
  }
  return steps[bestIdx];
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

  int claimCount = 0;
  float chosenDir = 0.0;
  float chosenErr = 0.0;
  bool touchingWater = false;

  for (int i = 0; i < 8; i++) {
    vec2 uvN = v_uv + offsets[i];
    vec4 mN = texture(u_matter, uvN);
    if (isWater(mN)) touchingWater = true;
  }

  if (touchingWater) {
    out_color = emptyCell();
    return;
  }

  // Source-claim resolution: evaluate all branch neighbors as potential sources.
  for (int i = 0; i < 8; i++) {
    vec2 sourceUV = v_uv + offsets[i];
    vec4 sourceBranch = texture(u_foliage_prev, sourceUV);
    if (!isBranch(sourceBranch)) continue;

    vec2 sourceDir = dirFromEncoded(sourceBranch.g);
    float fertility = texture(u_noise, sourceUV).r;
    float branchGate = BRANCH_SIDE_RATE * max(fertility, 0.35);

    int sourceNeighborCount = 0;
    for (int j = 0; j < 8; j++) {
      vec2 aroundUV = sourceUV + offsets[j];
      if (isBranch(texture(u_foliage_prev, aroundUV))) {
        sourceNeighborCount++;
      }
    }
    bool isTipSource = sourceNeighborCount == 1;

    vec2 parentStep = nearestStep8(-sourceDir);
    vec2 parentUV = sourceUV + vec2(parentStep.x * texelSize.x, parentStep.y * texelSize.y);
    bool hasParent = isBranch(texture(u_foliage_prev, parentUV));

    // Main path stepping for this source.
    vec2 primaryStep;
    vec2 secondaryStep;
    float slopeMix;
    lineStepper(sourceDir, primaryStep, secondaryStep, slopeMix);

    float err = fract(sourceBranch.b);
    float errNext = err + slopeMix;
    bool takeSecondary = errNext >= 1.0;
    vec2 expectedStep = takeSecondary ? secondaryStep : primaryStep;
    float childErr = takeSecondary ? (errNext - 1.0) : errNext;

    // Tip-like gating: only branch when source has no occupied forward cell.
    vec2 mainStepUV = sourceUV + vec2(primaryStep.x * texelSize.x, primaryStep.y * texelSize.y);
    bool forwardOccupied = isBranch(texture(u_foliage_prev, mainStepUV));

    // Side branch candidate from source.
    float sideHash = hash12(sourceUV * vec2(2048.0, 4096.0) + sourceBranch.g * 257.0);
    float sideSign = hash12(sourceUV * vec2(997.0, 733.0) + sourceBranch.b * 911.0) < 0.5 ? -1.0 : 1.0;
    bool emitSide = isTipSource && hasParent && (!forwardOccupied) && (sideHash < branchGate);

    vec2 sideStep = vec2(999.0);
    float sideEncodedDir = 0.0;
    float sideChildErr = 0.0;
    if (emitSide) {
      vec2 sideDir = normalize(rotateVec(sourceDir, sideSign * BRANCH_SIDE_ANGLE));
      sideStep = nearestStep8(sideDir);
      sideChildErr = 0.0;
      sideEncodedDir = encodeDir(sideDir);
    }

    // Direction from this source cell toward current candidate cell.
    vec2 toCurrent = -latticeOffsets[i];

    bool claimed = false;
    float claimDir = 0.0;
    float claimErr = 0.0;

    if (sameStep(toCurrent, expectedStep)) {
      claimed = true;
      claimDir = sourceBranch.g;
      claimErr = childErr;
    } else if (emitSide && sameStep(toCurrent, sideStep)) {
      claimed = true;
      claimDir = sideEncodedDir;
      claimErr = sideChildErr;
    }

    if (claimed) {
      claimCount++;
      if (claimCount == 1) {
        chosenDir = claimDir;
        chosenErr = claimErr;
      }
    }
  }

  // Accept only unambiguous claims to avoid clumping.
  if (claimCount != 1) {
    out_color = emptyCell();
    return;
  }

  out_color = makeBranch(chosenDir, chosenErr);
}
