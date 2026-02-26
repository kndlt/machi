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
//   R = tree ID (0.0 = empty; non-zero identifies a tree)
//   G = packed direction+error (5 bits dir, 3 bits error)
//   B = growth inhibition (shared by branch/root)
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
uniform sampler2D u_branch_tex2_prev;
uniform sampler2D u_light;   // currently unused in v0.3 model
uniform sampler2D u_noise;
uniform int u_branching_enabled;
uniform int u_branch_inhibition_enabled;
uniform int u_tick;

layout(location = 0) out vec4 out_color;
layout(location = 1) out vec4 out_branch_tex2;

// Matter colors (from matter.png palette)
const vec3 DIRT_COLOR  = vec3(0.404, 0.322, 0.294);  // (103, 82, 75)
const vec3 STONE_COLOR = vec3(0.647, 0.592, 0.561);  // (165, 151, 143)
const vec3 WATER_COLOR = vec3(0.200, 0.600, 0.800);  // (51, 153, 204)
const float COLOR_THRESHOLD = 0.12;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

const float BRANCH_ALPHA_MIN = 0.5;
const float BRANCH_SIDE_RATE = 0.18;
const float BRANCH_SIDE_ANGLE_MIN = PI / 9.0;  // 20 deg
const float BRANCH_SIDE_ANGLE_MAX = PI / 4.0;  // 45 deg
const float MAIN_TURN_RATE = 0.08;
const float MAIN_TURN_RATE_BLOCKED = 0.55;
const float MAIN_TURN_MAX = PI / 18.0; // 10 deg

const float ROOT_SIDE_RATE = 0.10;
const float ROOT_SIDE_ANGLE_MIN = PI / 15.0;  // 12 deg
const float ROOT_SIDE_ANGLE_MAX = PI / 6.0;   // 30 deg
const float ROOT_TURN_RATE = 0.04;
const float ROOT_TURN_RATE_BLOCKED = 0.70;
const float ROOT_TURN_MAX = PI * 7.0 / 180.0; // 7 deg

const float CELL_TYPE_BRANCH = 0.0;
const float CELL_TYPE_ROOT = 1.0;

const vec2 HASH_SALT_TURN_A_BRANCH = vec2(311.0, 173.0);
const vec2 HASH_SALT_TURN_A_ROOT = vec2(619.0, 241.0);
const vec2 HASH_SALT_TURN_SIGN_BRANCH = vec2(887.0, 491.0);
const vec2 HASH_SALT_TURN_SIGN_ROOT = vec2(1423.0, 733.0);
const vec2 HASH_SALT_TURN_MAG_BRANCH = vec2(97.0, 631.0);
const vec2 HASH_SALT_TURN_MAG_ROOT = vec2(389.0, 941.0);
const vec2 HASH_SALT_SIDE_BRANCH = vec2(2048.0, 4096.0);
const vec2 HASH_SALT_SIDE_ROOT = vec2(2609.0, 4787.0);
const vec2 HASH_SALT_SIDE_SIGN_BRANCH = vec2(997.0, 733.0);
const vec2 HASH_SALT_SIDE_SIGN_ROOT = vec2(1289.0, 1063.0);
const vec2 HASH_SALT_SIDE_ANGLE_BRANCH = vec2(1597.0, 1213.0);
const vec2 HASH_SALT_SIDE_ANGLE_ROOT = vec2(1747.0, 1303.0);

const float FORWARD_CONE_COS = 0.5; // cos(60 deg)
const float INHIBITION_MAX = 255.0;
const float INHIBITION_DECAY = 8.0;

float unpackByte(float packed);

float selectByType(float cellType, float branchValue, float rootValue) {
  return (cellType >= 0.5) ? rootValue : branchValue;
}

vec2 selectVec2ByType(float cellType, vec2 branchValue, vec2 rootValue) {
  return (cellType >= 0.5) ? rootValue : branchValue;
}

float sourceCellType(vec2 sourceUV, vec4 sourceBranch) {
  vec4 meta = texture(u_branch_tex2_prev, sourceUV);
  float packed = unpackByte(meta.r);
  float typeNibble = mod(packed, 16.0);
  return (typeNibble == CELL_TYPE_ROOT) ? CELL_TYPE_ROOT : CELL_TYPE_BRANCH;
}

vec4 withCellType(vec4 branchTex2Prev, float cellType) {
  float packed = unpackByte(branchTex2Prev.r);
  float upper = floor(packed / 16.0) * 16.0;
  float lower = clamp(floor(cellType + 0.5), 0.0, 15.0);
  float combined = upper + lower;
  return vec4(combined / 255.0, branchTex2Prev.g, branchTex2Prev.b, branchTex2Prev.a);
}

bool isWater(vec4 m) {
  return m.a > 0.5 && distance(m.rgb, WATER_COLOR) < COLOR_THRESHOLD;
}

bool isDirt(vec4 m) {
  return m.a > 0.5 && distance(m.rgb, DIRT_COLOR) < COLOR_THRESHOLD;
}

bool isAir(vec4 m) {
  return m.a < 0.1;
}

bool isOccupied(vec4 b) {
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

float unpackByte(float packed) {
  return floor(clamp(packed, 0.0, 1.0) * 255.0 + 0.5);
}

float packDirErr(float encodedDir, float errorAcc) {
  float dirQ = floor(fract(encodedDir) * 31.0 + 0.5);
  float errQ = floor(clamp(errorAcc, 0.0, 0.999999) * 7.0 + 0.5);
  float packed = dirQ * 8.0 + errQ;
  return packed / 255.0;
}

float unpackDir(float packedDirErr) {
  float packed = unpackByte(packedDirErr);
  float dirQ = floor(packed / 8.0);
  return dirQ / 31.0;
}

float unpackErr(float packedDirErr) {
  float packed = unpackByte(packedDirErr);
  float errQ = mod(packed, 8.0);
  return errQ / 7.0;
}

float packInhibition(float inhibition) {
  float q = floor(clamp(inhibition, 0.0, INHIBITION_MAX) + 0.5);
  return q / INHIBITION_MAX;
}

float unpackInhibition(float encoded) {
  return floor(clamp(encoded, 0.0, 1.0) * INHIBITION_MAX + 0.5);
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

vec4 makeBranch(float treeId, float encodedDir, float errorAcc, float inhibition) {
  float id = clamp(treeId, 1.0 / 255.0, 1.0);
  float packedDirErr = packDirErr(encodedDir, errorAcc);
  return vec4(id, packedDirErr, packInhibition(inhibition), 1.0);
}

vec4 emptyCell(float inhibition) {
  return vec4(0.0, 0.0, packInhibition(inhibition), 0.0);
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

bool blockedInForwardCone(vec2 candidateUV, vec2 sourceUV, vec2 growthDir, vec2 texelSize) {
  vec2 dir = normalize(growthDir);
  float sourceEps = min(texelSize.x, texelSize.y) * 0.5;

  vec2 probes[48] = vec2[48](
    vec2(0.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 0.0), vec2(1.0, 1.0),
    vec2(0.0, 1.0), vec2(-1.0, 1.0), vec2(-1.0, 0.0), vec2(-1.0, -1.0),
    vec2(0.0, -2.0), vec2(2.0, -2.0), vec2(2.0, 0.0), vec2(2.0, 2.0),
    vec2(0.0, 2.0), vec2(-2.0, 2.0), vec2(-2.0, 0.0), vec2(-2.0, -2.0),
    vec2(0.0, -3.0), vec2(3.0, -3.0), vec2(3.0, 0.0), vec2(3.0, 3.0),
    vec2(0.0, 3.0), vec2(-3.0, 3.0), vec2(-3.0, 0.0), vec2(-3.0, -3.0),
    vec2(0.0, -4.0), vec2(4.0, -4.0), vec2(4.0, 0.0), vec2(4.0, 4.0),
    vec2(0.0, 4.0), vec2(-4.0, 4.0), vec2(-4.0, 0.0), vec2(-4.0, -4.0),
    vec2(0.0, -5.0), vec2(5.0, -5.0), vec2(5.0, 0.0), vec2(5.0, 5.0),
    vec2(0.0, 5.0), vec2(-5.0, 5.0), vec2(-5.0, 0.0), vec2(-5.0, -5.0),
    vec2(0.0, -6.0), vec2(6.0, -6.0), vec2(6.0, 0.0), vec2(6.0, 6.0),
    vec2(0.0, 6.0), vec2(-6.0, 6.0), vec2(-6.0, 0.0), vec2(-6.0, -6.0)
  );

  for (int k = 0; k < 48; k++) {
    vec2 lattice = probes[k];
    vec2 rel = normalize(lattice);
    if (dot(rel, dir) < FORWARD_CONE_COS) continue;

    vec2 probeUV = candidateUV + vec2(lattice.x * texelSize.x, lattice.y * texelSize.y);
    if (distance(probeUV, sourceUV) <= sourceEps) continue;
    if (isOccupied(texture(u_foliage_prev, probeUV))) return true;
  }

  return false;
}

void main() {
  vec4 mHere = texture(u_matter, v_uv);
  vec4 branchPrev = texture(u_foliage_prev, v_uv);
  vec4 branchTex2Prev = texture(u_branch_tex2_prev, v_uv);
  float hereType = sourceCellType(v_uv, branchPrev);
  vec2 texelSize = 1.0 / vec2(textureSize(u_matter, 0));

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

  // Existing occupied cell persists and carries inhibition diffusion/decay.
  if (isOccupied(branchPrev)) {
    if (u_branch_inhibition_enabled == 0) {
      out_color = vec4(branchPrev.r, branchPrev.g, 0.0, branchPrev.a);
      out_branch_tex2 = branchTex2Prev;
      return;
    }

    float inhibCenter = unpackInhibition(branchPrev.b);
    float inhibNeighborMax = 0.0;
    for (int i = 0; i < 8; i++) {
      vec4 nb = texture(u_foliage_prev, v_uv + offsets[i]);
      if (!isOccupied(nb)) continue;
      float n = unpackInhibition(nb.b);
      inhibNeighborMax = max(inhibNeighborMax, n);
    }
    float inhibBase = max(
      max(0.0, inhibCenter - INHIBITION_DECAY),
      max(0.0, inhibNeighborMax - INHIBITION_DECAY)
    );
    out_color = vec4(branchPrev.r, branchPrev.g, packInhibition(inhibBase), branchPrev.a);
    out_branch_tex2 = branchTex2Prev;
    return;
  }
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
  float chosenId = 0.0;
  float chosenDir = 0.0;
  float chosenErr = 0.0;
  float chosenInhib = 0.0;
  float chosenType = CELL_TYPE_BRANCH;
  bool candidateIsAir = isAir(mHere);
  bool candidateIsDirt = isDirt(mHere);
  bool touchingWater = false;

  if (!candidateIsAir && !candidateIsDirt) {
    out_color = emptyCell(0.0);
    out_branch_tex2 = withCellType(branchTex2Prev, CELL_TYPE_BRANCH);
    return;
  }

  for (int i = 0; i < 8; i++) {
    vec2 uvN = v_uv + offsets[i];
    vec4 mN = texture(u_matter, uvN);
    if (isWater(mN)) touchingWater = true;
  }

  if (touchingWater) {
    out_color = emptyCell(0.0);
    out_branch_tex2 = withCellType(branchTex2Prev, CELL_TYPE_BRANCH);
    return;
  }

  if ((u_tick % 2) == 0) {
    out_color = emptyCell(0.0);
    out_branch_tex2 = withCellType(branchTex2Prev, CELL_TYPE_BRANCH);
    return;
  }

  // Source-claim resolution: evaluate all occupied neighbors as potential sources.
  for (int i = 0; i < 8; i++) {
    vec2 sourceUV = v_uv + offsets[i];
    vec4 sourceBranch = texture(u_foliage_prev, sourceUV);
    if (!isOccupied(sourceBranch)) continue;
    float sourceType = sourceCellType(sourceUV, sourceBranch);
    bool sourceIsRoot = sourceType == CELL_TYPE_ROOT;
    if (sourceIsRoot && !candidateIsDirt) continue;

    float sideRate = selectByType(sourceType, BRANCH_SIDE_RATE, ROOT_SIDE_RATE);
    float sideAngleMin = selectByType(sourceType, BRANCH_SIDE_ANGLE_MIN, ROOT_SIDE_ANGLE_MIN);
    float sideAngleMax = selectByType(sourceType, BRANCH_SIDE_ANGLE_MAX, ROOT_SIDE_ANGLE_MAX);
    float mainTurnRate = selectByType(sourceType, MAIN_TURN_RATE, ROOT_TURN_RATE);
    float mainTurnRateBlocked = selectByType(sourceType, MAIN_TURN_RATE_BLOCKED, ROOT_TURN_RATE_BLOCKED);
    float mainTurnMax = selectByType(sourceType, MAIN_TURN_MAX, ROOT_TURN_MAX);

    vec2 turnSaltA = selectVec2ByType(sourceType, HASH_SALT_TURN_A_BRANCH, HASH_SALT_TURN_A_ROOT);
    vec2 turnSaltSign = selectVec2ByType(sourceType, HASH_SALT_TURN_SIGN_BRANCH, HASH_SALT_TURN_SIGN_ROOT);
    vec2 turnSaltMag = selectVec2ByType(sourceType, HASH_SALT_TURN_MAG_BRANCH, HASH_SALT_TURN_MAG_ROOT);
    vec2 sideSalt = selectVec2ByType(sourceType, HASH_SALT_SIDE_BRANCH, HASH_SALT_SIDE_ROOT);
    vec2 sideSignSalt = selectVec2ByType(sourceType, HASH_SALT_SIDE_SIGN_BRANCH, HASH_SALT_SIDE_SIGN_ROOT);
    vec2 sideAngleSalt = selectVec2ByType(sourceType, HASH_SALT_SIDE_ANGLE_BRANCH, HASH_SALT_SIDE_ANGLE_ROOT);

    float sourcePacked = sourceBranch.g;
    float sourceErr = unpackErr(sourcePacked);
    float sourceInhib = (u_branch_inhibition_enabled == 1)
      ? unpackInhibition(sourceBranch.b)
      : 0.0;
    vec2 sourceDir = dirFromEncoded(unpackDir(sourcePacked));
    vec2 toCurrent = -latticeOffsets[i];

    // Root seed: use the same step/error claim logic as forward growth, but backward.
    if (!sourceIsRoot && candidateIsDirt) {
      vec2 seedDir = normalize(-sourceDir);
      vec2 seedPrimaryStep;
      vec2 seedSecondaryStep;
      float seedSlopeMix;
      lineStepper(seedDir, seedPrimaryStep, seedSecondaryStep, seedSlopeMix);

      float seedErrNext = sourceErr + seedSlopeMix;
      bool seedTakeSecondary = seedErrNext >= 1.0;
      vec2 seedExpectedStep = seedTakeSecondary ? seedSecondaryStep : seedPrimaryStep;
      float seedChildErr = seedTakeSecondary ? (seedErrNext - 1.0) : seedErrNext;

      if (sameStep(toCurrent, seedExpectedStep)) {
        if (blockedInForwardCone(v_uv, sourceUV, seedDir, texelSize)) continue;
        claimCount++;
        if (claimCount == 1) {
          chosenId = sourceBranch.r;
          chosenDir = encodeDir(seedDir);
          chosenErr = seedChildErr;
          chosenInhib = sourceInhib;
          chosenType = CELL_TYPE_ROOT;
        }
      }
      continue;
    }

    if (!sourceIsRoot && !candidateIsAir) continue;

    float fertility = texture(u_noise, sourceUV).r;
    float inhibitionFactor = 1.0 - (sourceInhib / INHIBITION_MAX);
    inhibitionFactor *= inhibitionFactor;
    float branchGate = sideRate * max(fertility, 0.35) * inhibitionFactor;

    int sourceNeighborCount = 0;
    for (int j = 0; j < 8; j++) {
      vec2 aroundUV = sourceUV + offsets[j];
      if (isOccupied(texture(u_foliage_prev, aroundUV))) {
        sourceNeighborCount++;
      }
    }
    bool isTipSource = sourceNeighborCount == 1;

    vec2 parentStep = nearestStep8(-sourceDir);
    vec2 parentUV = sourceUV + vec2(parentStep.x * texelSize.x, parentStep.y * texelSize.y);
    bool hasParent = isOccupied(texture(u_foliage_prev, parentUV));

    // Main path steering for this source (small deterministic turn, mostly at tips).
    vec2 steeredDir = sourceDir;

    // Use unsteered forward occupancy for gating/intent.
    vec2 unsteeredPrimaryStep;
    vec2 unsteeredSecondaryStep;
    float unsteeredSlopeMix;
    lineStepper(sourceDir, unsteeredPrimaryStep, unsteeredSecondaryStep, unsteeredSlopeMix);

    vec2 mainStepUV = sourceUV + vec2(unsteeredPrimaryStep.x * texelSize.x, unsteeredPrimaryStep.y * texelSize.y);
    bool forwardOccupied = isOccupied(texture(u_foliage_prev, mainStepUV));

    if (isTipSource) {
      float turnHash = hash12(sourceUV * turnSaltA + sourceErr * 127.0);
      float turnSignHash = hash12(sourceUV * turnSaltSign + sourcePacked * 389.0);
      float turnChance = (forwardOccupied ? mainTurnRateBlocked : mainTurnRate) * max(fertility, 0.25);
      if (turnHash < turnChance) {
        float turnSign = turnSignHash < 0.5 ? -1.0 : 1.0;
        float turnMagnitude = mainTurnMax * (0.35 + 0.65 * hash12(sourceUV * turnSaltMag + sourceErr * 43.0));
        steeredDir = normalize(rotateVec(sourceDir, turnSign * turnMagnitude));
      }
    }

    // Main path stepping for this source.
    vec2 primaryStep;
    vec2 secondaryStep;
    float slopeMix;
    lineStepper(steeredDir, primaryStep, secondaryStep, slopeMix);

    float err = sourceErr;
    float errNext = err + slopeMix;
    bool takeSecondary = errNext >= 1.0;
    vec2 expectedStep = takeSecondary ? secondaryStep : primaryStep;
    float childErr = takeSecondary ? (errNext - 1.0) : errNext;

    // Side branch candidate from source.
    float sideHash = hash12(sourceUV * sideSalt + sourcePacked * 257.0);
    float sideSign = hash12(sourceUV * sideSignSalt + sourceErr * 911.0) < 0.5 ? -1.0 : 1.0;
    bool emitSide = (u_branching_enabled == 1)
      && isTipSource
      && hasParent
      && (!forwardOccupied)
      && (sideHash < branchGate);

    vec2 sideStep = vec2(999.0);
    float sideEncodedDir = 0.0;
    float sideChildErr = 0.0;
    if (emitSide) {
      float angleMix = hash12(sourceUV * sideAngleSalt + sourcePacked * 53.0);
      float sideAngle = mix(sideAngleMin, sideAngleMax, angleMix);
      vec2 sideDir = normalize(rotateVec(steeredDir, sideSign * sideAngle));
      sideStep = nearestStep8(sideDir);
      sideChildErr = 0.0;
      sideEncodedDir = encodeDir(sideDir);
    }

    // Direction from this source cell toward current candidate cell.

    bool claimed = false;
    float claimId = 0.0;
    float claimDir = 0.0;
    float claimErr = 0.0;
    float claimInhib = sourceInhib;
    float claimType = sourceType;

    if (sameStep(toCurrent, expectedStep)) {
      if (blockedInForwardCone(v_uv, sourceUV, steeredDir, texelSize)) continue;
      claimed = true;
      claimId = sourceBranch.r;
      claimDir = encodeDir(steeredDir);
      claimErr = childErr;
      claimInhib = sourceInhib;
      claimType = sourceType;
    } else if (emitSide && sameStep(toCurrent, sideStep)) {
      vec2 sideDir = dirFromEncoded(sideEncodedDir);
      if (blockedInForwardCone(v_uv, sourceUV, sideDir, texelSize)) continue;
      claimed = true;
      claimId = sourceBranch.r;
      claimDir = sideEncodedDir;
      claimErr = sideChildErr;
      claimInhib = (u_branch_inhibition_enabled == 1) ? INHIBITION_MAX : 0.0;
      claimType = sourceType;
    }

    if (claimed) {
      claimCount++;
      if (claimCount == 1) {
        chosenId = claimId;
        chosenDir = claimDir;
        chosenErr = claimErr;
        chosenInhib = claimInhib;
        chosenType = claimType;
      }
    }
  }

  // Accept only unambiguous claims to avoid clumping.
  if (claimCount != 1) {
    out_color = emptyCell(0.0);
    out_branch_tex2 = withCellType(branchTex2Prev, CELL_TYPE_BRANCH);
    return;
  }

  out_color = makeBranch(chosenId, chosenDir, chosenErr, chosenInhib);
  out_branch_tex2 = withCellType(branchTex2Prev, chosenType);
}
