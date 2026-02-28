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
const float DEG_TO_RAD = PI / 180.0;

const float BRANCH_ALPHA_MIN = 0.5;
const float BRANCH_SIDE_RATE = 0.18;
const float BRANCH_SIDE_ANGLE_MIN = 20.0 * DEG_TO_RAD;
const float BRANCH_SIDE_ANGLE_MAX = 45.0 * DEG_TO_RAD;
const float MAIN_TURN_RATE = 0.08;
const float MAIN_TURN_RATE_BLOCKED = 0.55;
const float MAIN_TURN_MAX = 10.0 * DEG_TO_RAD;

const float ROOT_SIDE_RATE = 0.36;
const float ROOT_SIDE_ANGLE_MIN = 20.0 * DEG_TO_RAD;
const float ROOT_SIDE_ANGLE_MAX = 60.0 * DEG_TO_RAD;
const float ROOT_TURN_RATE = 0.04;
const float ROOT_TURN_RATE_BLOCKED = 0.70;
const float ROOT_TURN_MAX = 7.0 * DEG_TO_RAD;

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
const float BRANCH_INHIBITION_DECAY = 3.0;
const float ROOT_INHIBITION_DECAY = 32.0;

const float RESOURCE_ZERO_BYTE = 127.0;
const float RESOURCE_MIN_BYTE = 0.0;
const float RESOURCE_MAX_BYTE = 255.0;
const float ROOT_CREATION_COST = 1.0;
const float BRANCH_CREATION_COST = 1.0;
const float RESOURCE_SIGNED_MIN = RESOURCE_MIN_BYTE - RESOURCE_ZERO_BYTE;
const float RESOURCE_SIGNED_MAX = RESOURCE_MAX_BYTE - RESOURCE_ZERO_BYTE - 1.0;
const float RESOURCE_RELAX_BRANCH = 0.0;
const float RESOURCE_RELAX_ROOT = 0.0;
const float RESOURCE_CANOPY_TRANSFER_FRACTION = 0.75;
const float RESOURCE_ANTI_CANOPY_TRANSFER_FRACTION = 0.1;
const float DIRT_DIFFUSION_FRACTION = 0.25;
const float ROOT_SAP_THRESHOLD = 4.0;
const float ROOT_SAP_AMOUNT = 1.0;
// Version: Energy conversation version
// const float RESOURCE_ZERO_BYTE = 127.0;
// const float RESOURCE_MIN_BYTE = 0.0;
// const float RESOURCE_MAX_BYTE = 255.0;
// const float NEW_GROWTH_RESOURCE_COST = 0.0;
// const float ROOT_GATHER_RATE = 4.0;
// const float RESOURCE_DIFFUSION = 0.8;
// const float RESOURCE_RELAX_BRANCH = 0.0;
// const float RESOURCE_RELAX_ROOT = 0.0;

float unpackByte(float packed);
bool isOccupied(vec4 b);
vec2 dirFromEncoded(float encoded);
float unpackDir(float packedDirErr);
float unpackErr(float packedDirErr);
void lineStepper(vec2 dir, out vec2 primaryStep, out vec2 secondaryStep, out float slopeMix);

struct NodeState {
  bool occupied;
  float treeIdByte;
  float cellType;
  vec2 dir;
  float err;
  ivec2 pos;
};

struct ParentHit {
  bool found;
  ivec2 pos;
  ivec2 step;
  NodeState parent;
};

NodeState makeEmptyNodeState();
ParentHit makeParentMiss();
ParentHit makeParentFound(NodeState parentState, ivec2 parentStep);

float selectByType(float cellType, float branchValue, float rootValue) {
  return (cellType >= 0.5) ? rootValue : branchValue;
}

float creationCostForType(float cellType) {
  return selectByType(cellType, BRANCH_CREATION_COST, ROOT_CREATION_COST);
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

float unpackResourceSigned(vec4 branchTex2) {
  float signedResource = unpackByte(branchTex2.g) - RESOURCE_ZERO_BYTE;
  return clamp(signedResource, RESOURCE_SIGNED_MIN, RESOURCE_SIGNED_MAX);
}

float computeResourceTransfer(float sourceResource, float sinkResource, bool parentToChildTowardCanopy) {
  float diff = sourceResource - sinkResource;
  if (diff == 0.0) return 0.0;

  float signDiff = (diff < 0.0) ? -1.0 : 1.0;
  float magnitude = abs(diff);

  bool isCanopyDirectionFlow =
    (parentToChildTowardCanopy && diff > 0.0) ||
    (!parentToChildTowardCanopy && diff < 0.0);
  if (isCanopyDirectionFlow && magnitude == 1.0) {
    return signDiff;
  }

  float transferFraction;
  if (parentToChildTowardCanopy) {
    transferFraction = (diff > 0.0)
      ? RESOURCE_CANOPY_TRANSFER_FRACTION
      : RESOURCE_ANTI_CANOPY_TRANSFER_FRACTION;
  } else {
    transferFraction = (diff > 0.0)
      ? RESOURCE_ANTI_CANOPY_TRANSFER_FRACTION
      : RESOURCE_CANOPY_TRANSFER_FRACTION;
  }
  float transferredMagnitude = floor(magnitude * transferFraction);
  return signDiff * transferredMagnitude;
}

float computeDirtDiffusionFlow(float sourceResource, float sinkResource) {
  float diff = sourceResource - sinkResource;
  if (diff == 0.0) return 0.0;

  float signDiff = (diff < 0.0) ? -1.0 : 1.0;
  float magnitude = abs(diff);
  if (magnitude == 1.0) {
    return signDiff;
  } 
  // else if (magnitude == 2.0) {
  //   return signDiff;
  // } 
  // else if (magnitude == 3.0) {
  //   return signDiff;
  // }

  float transferredMagnitude = floor(magnitude * DIRT_DIFFUSION_FRACTION);
  return signDiff * transferredMagnitude;
}

float computeRootSapAmount(float dirtNutrient, float rootNutrient) {
  return ((dirtNutrient - rootNutrient) >= ROOT_SAP_THRESHOLD) ? ROOT_SAP_AMOUNT : 0.0;
}

float packResourceSigned(float signedResource) {
  float clampedSigned = clamp(signedResource, RESOURCE_SIGNED_MIN, RESOURCE_SIGNED_MAX);
  float byteVal = clamp(clampedSigned + RESOURCE_ZERO_BYTE, RESOURCE_MIN_BYTE, RESOURCE_MAX_BYTE);
  return byteVal / 255.0;
}

vec2 edgeSafeUV(vec2 uv, vec2 texelSize) {
  vec2 halfTexel = texelSize * 0.5;
  return clamp(uv, halfTexel, vec2(1.0) - halfTexel);
}

ivec2 latticePosFromUV(vec2 uv) {
  ivec2 sizeI = textureSize(u_matter, 0);
  vec2 size = vec2(sizeI);
  vec2 texelSize = 1.0 / size;
  vec2 safeUV = edgeSafeUV(uv, texelSize);
  vec2 scaled = safeUV * size;
  return ivec2(floor(scaled));
}

NodeState makeNodeState(vec2 uv, vec4 foliageSample, vec4 branchTex2Sample) {
  NodeState state;
  state.occupied = isOccupied(foliageSample);
  state.treeIdByte = unpackByte(foliageSample.r);
  state.cellType = sourceCellType(uv, foliageSample);
  state.dir = dirFromEncoded(unpackDir(foliageSample.g));
  state.err = unpackErr(foliageSample.g);
  state.pos = latticePosFromUV(uv);
  return state;
}

NodeState decodeNodeStateAtUV(vec2 uv) {
  ivec2 sizeI = textureSize(u_matter, 0);
  vec2 texelSize = 1.0 / vec2(sizeI);
  vec2 safeUV = edgeSafeUV(uv, texelSize);
  vec4 foliageSample = texture(u_foliage_prev, safeUV);
  vec4 branchTex2Sample = texture(u_branch_tex2_prev, safeUV);
  return makeNodeState(safeUV, foliageSample, branchTex2Sample);
}

bool latticePosInBounds(ivec2 pos) {
  ivec2 sizeI = textureSize(u_matter, 0);
  return pos.x >= 0 && pos.y >= 0 && pos.x < sizeI.x && pos.y < sizeI.y;
}

vec2 uvFromLatticePos(ivec2 pos) {
  ivec2 sizeI = textureSize(u_matter, 0);
  vec2 size = vec2(sizeI);
  return (vec2(pos) + vec2(0.5)) / size;
}

NodeState decodeNodeStateAtPos(ivec2 pos) {
  if (!latticePosInBounds(pos)) {
    return makeEmptyNodeState();
  }
  return decodeNodeStateAtUV(uvFromLatticePos(pos));
}

ivec2 expectedBackwardStepFromDirErr(vec2 dir, float err) {
  vec2 primaryStep;
  vec2 secondaryStep;
  float slopeMix;
  lineStepper(dir, primaryStep, secondaryStep, slopeMix);

  float errNext = err + slopeMix;
  bool takeSecondary = errNext >= 1.0;
  vec2 childForwardStep = takeSecondary ? secondaryStep : primaryStep;
  vec2 backwardStep = -childForwardStep;
  return ivec2(int(backwardStep.x), int(backwardStep.y));
}

bool isChildOf(NodeState child, NodeState parent) {
  if (!child.occupied || !parent.occupied) return false;
  if (child.treeIdByte != parent.treeIdByte) return false;

  ivec2 expectedParentPos = child.pos + expectedBackwardStepFromDirErr(child.dir, child.err);
  return all(equal(parent.pos, expectedParentPos));
}

bool isParentOf(NodeState parent, NodeState child) {
  return isChildOf(child, parent);
}

ParentHit getParent(NodeState child) {
  if (!child.occupied) {
    return makeParentMiss();
  }

  ivec2 backwardStep = expectedBackwardStepFromDirErr(child.dir, child.err);
  ivec2 parentPos = child.pos + backwardStep;
  NodeState parentState = decodeNodeStateAtPos(parentPos);

  if (!isChildOf(child, parentState)) {
    return makeParentMiss();
  }
  return makeParentFound(parentState, backwardStep);
}

NodeState makeEmptyNodeState() {
  NodeState state;
  state.occupied = false;
  state.treeIdByte = 0.0;
  state.cellType = CELL_TYPE_BRANCH;
  state.dir = vec2(0.0, -1.0);
  state.err = 0.0;
  state.pos = ivec2(0);
  return state;
}

ParentHit makeParentMiss() {
  ParentHit hit;
  hit.found = false;
  hit.pos = ivec2(0);
  hit.step = ivec2(0);
  hit.parent = makeEmptyNodeState();
  return hit;
}

ParentHit makeParentFound(NodeState parentState, ivec2 parentStep) {
  ParentHit hit;
  hit.found = true;
  hit.pos = parentState.pos;
  hit.step = parentStep;
  hit.parent = parentState;
  return hit;
}

vec4 withCellTypeAndResource(vec4 branchTex2Prev, float cellType, float signedResource) {
  vec4 outMeta = withCellType(branchTex2Prev, cellType);
  outMeta.g = packResourceSigned(signedResource);
  return outMeta;
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

    vec2 probeUV = edgeSafeUV(candidateUV + vec2(lattice.x * texelSize.x, lattice.y * texelSize.y), texelSize);
    if (distance(probeUV, sourceUV) <= sourceEps) continue;
    if (isOccupied(texture(u_foliage_prev, probeUV))) return true;
  }

  return false;
}

void runSappingPhase(vec4 mHere, vec4 branchPrev, vec4 branchTex2Prev, float hereType, vec2 texelSize, in vec2 offsets[8]) {
  if (isOccupied(branchPrev)) {
    float hereResourcePrev = unpackResourceSigned(branchTex2Prev);
    float hereResource = hereResourcePrev;

    if (hereType == CELL_TYPE_ROOT) {
      float sapGain = 0.0;
      for (int i = 0; i < 8; i++) {
        vec2 nbUV = edgeSafeUV(v_uv + offsets[i], texelSize);
        vec4 nbMatter = texture(u_matter, nbUV);
        if (!isDirt(nbMatter)) continue;

        vec4 nbBranch = texture(u_foliage_prev, nbUV);
        if (isOccupied(nbBranch)) continue;

        float dirtNutrient = unpackResourceSigned(texture(u_branch_tex2_prev, nbUV));
        sapGain += computeRootSapAmount(dirtNutrient, hereResourcePrev);
      }
      hereResource += sapGain;
    }

    out_color = branchPrev;
    out_branch_tex2 = withCellTypeAndResource(branchTex2Prev, hereType, hereResource);
    return;
  }

  float candidateNutrient = unpackResourceSigned(branchTex2Prev);
  if (isDirt(mHere)) {
    float sapLoss = 0.0;
    for (int i = 0; i < 8; i++) {
      vec2 nbUV = edgeSafeUV(v_uv + offsets[i], texelSize);
      vec4 nbBranch = texture(u_foliage_prev, nbUV);
      if (!isOccupied(nbBranch)) continue;

      float nbType = sourceCellType(nbUV, nbBranch);
      if (nbType != CELL_TYPE_ROOT) continue;

      float rootNutrient = unpackResourceSigned(texture(u_branch_tex2_prev, nbUV));
      sapLoss += computeRootSapAmount(candidateNutrient, rootNutrient);
    }
    candidateNutrient = clamp(candidateNutrient - sapLoss, RESOURCE_SIGNED_MIN, RESOURCE_SIGNED_MAX);
  }

  out_color = branchPrev;
  vec4 sapMeta = branchTex2Prev;
  sapMeta.g = packResourceSigned(candidateNutrient);
  out_branch_tex2 = sapMeta;
}

void runInternalPhase(vec4 branchPrev, vec4 branchTex2Prev, float hereType, vec2 texelSize, in vec2 offsets[8]) {
  if (!isOccupied(branchPrev)) {
    out_color = branchPrev;
    out_branch_tex2 = branchTex2Prev;
    return;
  }

  float hereResourcePrev = unpackResourceSigned(branchTex2Prev);
  float hereResource = hereResourcePrev;

  float resourceIncoming = 0.0;
  float resourceOutgoing = 0.0;
  NodeState hereNode = makeNodeState(v_uv, branchPrev, branchTex2Prev);
  ParentHit upstreamHit = getParent(hereNode);
  if (upstreamHit.found) {
    vec2 parentUV = uvFromLatticePos(upstreamHit.parent.pos);
    float parentResource = unpackResourceSigned(texture(u_branch_tex2_prev, parentUV));
    bool parentToChildTowardCanopy = (hereType != CELL_TYPE_ROOT);
    resourceIncoming += computeResourceTransfer(parentResource, hereResourcePrev, parentToChildTowardCanopy);
  }

  for (int i = 0; i < 8; i++) {
    vec2 childUV = edgeSafeUV(v_uv + offsets[i], texelSize);
    vec4 childBranch = texture(u_foliage_prev, childUV);
    if (!isOccupied(childBranch)) continue;

    vec4 childMeta = texture(u_branch_tex2_prev, childUV);
    NodeState childNode = makeNodeState(childUV, childBranch, childMeta);
    if (!isChildOf(childNode, hereNode)) continue;

    float childResourcePrev = unpackResourceSigned(childMeta);
    bool parentToChildTowardCanopy = (childNode.cellType != CELL_TYPE_ROOT);
    resourceOutgoing += computeResourceTransfer(hereResourcePrev, childResourcePrev, parentToChildTowardCanopy);
  }
  hereResource = hereResourcePrev + resourceIncoming - resourceOutgoing;

  if (u_branch_inhibition_enabled == 0) {
    out_color = vec4(branchPrev.r, branchPrev.g, 0.0, branchPrev.a);
    out_branch_tex2 = withCellTypeAndResource(branchTex2Prev, hereType, hereResource);
    return;
  }

  float inhibCenter = unpackInhibition(branchPrev.b);
  float inhibNeighborMax = 0.0;
  float inhibitionDecay = (hereType == CELL_TYPE_ROOT)
    ? ROOT_INHIBITION_DECAY
    : BRANCH_INHIBITION_DECAY;
  for (int i = 0; i < 8; i++) {
    vec2 nbUV = edgeSafeUV(v_uv + offsets[i], texelSize);
    vec4 nb = texture(u_foliage_prev, nbUV);
    if (!isOccupied(nb)) continue;
    float nbType = sourceCellType(nbUV, nb);
    if (nbType != hereType) continue;
    float n = unpackInhibition(nb.b);
    inhibNeighborMax = max(inhibNeighborMax, n);
  }
  float inhibBase = max(
    max(0.0, inhibCenter - inhibitionDecay),
    max(0.0, inhibNeighborMax - inhibitionDecay)
  );
  out_color = vec4(branchPrev.r, branchPrev.g, packInhibition(inhibBase), branchPrev.a);
  out_branch_tex2 = withCellTypeAndResource(branchTex2Prev, hereType, hereResource);
}

void runDiffusionPhase(int phase, vec4 mHere, vec4 branchPrev, vec4 branchTex2Prev, vec2 texelSize) {
  if (isOccupied(branchPrev)) {
    out_color = branchPrev;
    out_branch_tex2 = branchTex2Prev;
    return;
  }

  float candidateNutrient = unpackResourceSigned(branchTex2Prev);
  ivec2 candidatePos = latticePosFromUV(v_uv);
  bool candidateIsAir = isAir(mHere);
  bool candidateIsDirt = isDirt(mHere);

  if (candidateIsDirt) {
    int diffusionCycle = u_tick / 4;
    int diffusionParityOffset = diffusionCycle % 2;
    ivec2 partnerPos = candidatePos;
    if (phase == 0) {
      int xParity = candidatePos.x % 2;
      int dx = (xParity == diffusionParityOffset) ? 1 : -1;
      partnerPos += ivec2(dx, 0);
    } else {
      int yParity = candidatePos.y % 2;
      int dy = (yParity == diffusionParityOffset) ? 1 : -1;
      partnerPos += ivec2(0, dy);
    }

    if (latticePosInBounds(partnerPos)) {
      vec2 partnerUV = uvFromLatticePos(partnerPos);
      vec4 mN = texture(u_matter, partnerUV);
      vec4 branchN = texture(u_foliage_prev, partnerUV);
      if (isDirt(mN) && !isOccupied(branchN)) {
        float neighborNutrient = unpackResourceSigned(texture(u_branch_tex2_prev, partnerUV));
        candidateNutrient += computeDirtDiffusionFlow(neighborNutrient, candidateNutrient);
      }
    }

    candidateNutrient = clamp(candidateNutrient, RESOURCE_SIGNED_MIN, RESOURCE_SIGNED_MAX);
  }

  vec4 emptyMeta = branchTex2Prev;
  emptyMeta.g = packResourceSigned(candidateNutrient);

  if (!candidateIsAir && !candidateIsDirt) {
    out_color = branchPrev;
    out_branch_tex2 = branchTex2Prev;
    return;
  }

  out_color = branchPrev;
  out_branch_tex2 = emptyMeta;
}

void runGrowthPhase(vec4 mHere, vec4 branchPrev, vec4 branchTex2Prev, vec2 texelSize, in vec2 offsets[8]) {
  if (isOccupied(branchPrev)) {
    out_color = branchPrev;
    out_branch_tex2 = branchTex2Prev;
    return;
  }

  int claimCount = 0;
  float chosenId = 0.0;
  float chosenDir = 0.0;
  float chosenErr = 0.0;
  float chosenInhib = 0.0;
  float chosenType = CELL_TYPE_BRANCH;
  float chosenResource = 0.0;
  float candidateNutrient = unpackResourceSigned(branchTex2Prev);
  ivec2 candidatePos = latticePosFromUV(v_uv);
  bool candidateIsAir = isAir(mHere);
  bool candidateIsDirt = isDirt(mHere);
  bool touchingWater = false;

  vec4 emptyMeta = branchTex2Prev;
  emptyMeta.g = packResourceSigned(candidateNutrient);

  if (!candidateIsAir && !candidateIsDirt) {
    out_color = branchPrev;
    out_branch_tex2 = branchTex2Prev;
    return;
  }

  for (int i = 0; i < 8; i++) {
    vec2 uvN = edgeSafeUV(v_uv + offsets[i], texelSize);
    vec4 mN = texture(u_matter, uvN);
    if (isWater(mN)) touchingWater = true;
  }

  if (touchingWater) {
    out_color = branchPrev;
    out_branch_tex2 = emptyMeta;
    return;
  }

  for (int i = 0; i < 8; i++) {
    vec2 sourceUV = edgeSafeUV(v_uv + offsets[i], texelSize);
    vec4 sourceBranch = texture(u_foliage_prev, sourceUV);
    if (!isOccupied(sourceBranch)) continue;
    vec4 sourceMeta = texture(u_branch_tex2_prev, sourceUV);
    NodeState sourceNode = makeNodeState(sourceUV, sourceBranch, sourceMeta);
    float sourceNutrient = unpackResourceSigned(sourceMeta);
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

    if (!sourceIsRoot && candidateIsDirt) {
      ParentHit sourceParentHit = getParent(sourceNode);
      if (sourceParentHit.found && sourceParentHit.parent.cellType == CELL_TYPE_ROOT) {
        continue;
      }

      vec2 seedDir = normalize(-sourceDir);
      vec2 seedPrimaryStep;
      vec2 seedSecondaryStep;
      float seedSlopeMix;
      lineStepper(seedDir, seedPrimaryStep, seedSecondaryStep, seedSlopeMix);

      ivec2 stepToParent = sourceNode.pos - candidatePos;
      ivec2 backwardPrimary = ivec2(-int(seedPrimaryStep.x), -int(seedPrimaryStep.y));
      ivec2 backwardSecondary = ivec2(-int(seedSecondaryStep.x), -int(seedSecondaryStep.y));
      bool matchPrimary = all(equal(stepToParent, backwardPrimary));
      bool matchSecondary = all(equal(stepToParent, backwardSecondary));
      if (!matchPrimary && !matchSecondary) {
        continue;
      }

      float seedChildErr = 0.0;
      if (!matchPrimary && matchSecondary) {
        seedChildErr = clamp(1.0 - seedSlopeMix, 0.0, 0.999999);
      }

      NodeState seedCandidate = makeEmptyNodeState();
      seedCandidate.occupied = true;
      seedCandidate.treeIdByte = sourceNode.treeIdByte;
      seedCandidate.cellType = CELL_TYPE_ROOT;
      seedCandidate.dir = seedDir;
      seedCandidate.err = seedChildErr;
      seedCandidate.pos = candidatePos;

      if (isChildOf(seedCandidate, sourceNode)) {
        if (blockedInForwardCone(v_uv, sourceUV, seedDir, texelSize)) continue;
        float requiredCost = creationCostForType(CELL_TYPE_ROOT);
        float availableForSpawn = sourceNutrient + candidateNutrient;
        if (availableForSpawn < requiredCost) continue;
        claimCount++;
        if (claimCount == 1) {
          chosenId = sourceBranch.r;
          chosenDir = encodeDir(seedDir);
          chosenErr = seedChildErr;
          chosenInhib = (u_branch_inhibition_enabled == 1) ? INHIBITION_MAX : 0.0;
          chosenType = CELL_TYPE_ROOT;
          chosenResource = candidateNutrient - requiredCost;
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
      vec2 aroundUV = edgeSafeUV(sourceUV + offsets[j], texelSize);
      if (isOccupied(texture(u_foliage_prev, aroundUV))) {
        sourceNeighborCount++;
      }
    }
    bool isTipSource = sourceNeighborCount == 1;

    ParentHit sourceParentHit = getParent(sourceNode);
    bool hasParent = sourceParentHit.found;

    vec2 steeredDir = sourceDir;

    vec2 unsteeredPrimaryStep;
    vec2 unsteeredSecondaryStep;
    float unsteeredSlopeMix;
    lineStepper(sourceDir, unsteeredPrimaryStep, unsteeredSecondaryStep, unsteeredSlopeMix);

    vec2 mainStepUV = edgeSafeUV(sourceUV + vec2(unsteeredPrimaryStep.x * texelSize.x, unsteeredPrimaryStep.y * texelSize.y), texelSize);
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

    vec2 primaryStep;
    vec2 secondaryStep;
    float slopeMix;
    lineStepper(steeredDir, primaryStep, secondaryStep, slopeMix);

    float err = sourceErr;
    float errNext = err + slopeMix;
    bool takeSecondary = errNext >= 1.0;
    float childErr = takeSecondary ? (errNext - 1.0) : errNext;

    float sideHash = hash12(sourceUV * sideSalt + sourcePacked * 257.0);
    float sideSign = hash12(sourceUV * sideSignSalt + sourceErr * 911.0) < 0.5 ? -1.0 : 1.0;
    bool emitSide = (u_branching_enabled == 1)
      && isTipSource
      && hasParent
      && (!forwardOccupied)
      && (sideHash < branchGate);

    float sideEncodedDir = 0.0;
    float sideChildErr = 0.0;
    if (emitSide) {
      float angleMix = hash12(sourceUV * sideAngleSalt + sourcePacked * 53.0);
      float sideAngle = mix(sideAngleMin, sideAngleMax, angleMix);
      vec2 sideDir = normalize(rotateVec(steeredDir, sideSign * sideAngle));
      sideChildErr = 0.0;
      sideEncodedDir = encodeDir(sideDir);
    }

    bool claimed = false;
    float claimId = 0.0;
    float claimDir = 0.0;
    float claimErr = 0.0;
    float claimInhib = sourceInhib;
    float claimType = sourceType;
    float claimResource = candidateNutrient;

    NodeState claimCandidate = makeEmptyNodeState();
    claimCandidate.occupied = true;
    claimCandidate.treeIdByte = sourceNode.treeIdByte;
    claimCandidate.cellType = sourceType;
    claimCandidate.pos = candidatePos;

    claimCandidate.dir = steeredDir;
    claimCandidate.err = childErr;
    if (isChildOf(claimCandidate, sourceNode)) {
      if (blockedInForwardCone(v_uv, sourceUV, steeredDir, texelSize)) continue;
      claimed = true;
      claimId = sourceBranch.r;
      claimDir = encodeDir(steeredDir);
      claimErr = childErr;
      claimInhib = sourceInhib;
      claimType = sourceType;
    } else if (emitSide) {
      vec2 sideDir = dirFromEncoded(sideEncodedDir);
      claimCandidate.dir = sideDir;
      claimCandidate.err = sideChildErr;
      if (!isChildOf(claimCandidate, sourceNode)) {
        continue;
      }
      if (blockedInForwardCone(v_uv, sourceUV, sideDir, texelSize)) continue;
      claimed = true;
      claimId = sourceBranch.r;
      claimDir = sideEncodedDir;
      claimErr = sideChildErr;
      claimInhib = (u_branch_inhibition_enabled == 1) ? INHIBITION_MAX : 0.0;
      claimType = sourceType;
    }

    if (claimed) {
      float requiredCost = creationCostForType(claimType);
      float availableForSpawn = sourceNutrient + candidateNutrient;
      if (availableForSpawn < requiredCost) {
        continue;
      }
      claimResource = candidateNutrient - requiredCost;
      claimCount++;
      if (claimCount == 1) {
        chosenId = claimId;
        chosenDir = claimDir;
        chosenErr = claimErr;
        chosenInhib = claimInhib;
        chosenType = claimType;
        chosenResource = claimResource;
      }
    }
  }

  if (claimCount != 1) {
    out_color = branchPrev;
    out_branch_tex2 = emptyMeta;
    return;
  }

  out_color = makeBranch(chosenId, chosenDir, chosenErr, chosenInhib);
  out_branch_tex2 = withCellTypeAndResource(branchTex2Prev, chosenType, chosenResource);
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

  int phase = u_tick % 4;
  bool diffusionInternalPhase = (phase == 0) || (phase == 1);
  bool sappingPhase = (phase == 2);

  if (sappingPhase) {
    runSappingPhase(mHere, branchPrev, branchTex2Prev, hereType, texelSize, offsets);
    return;
  }

  if (diffusionInternalPhase) {
    if (isOccupied(branchPrev)) {
      runInternalPhase(branchPrev, branchTex2Prev, hereType, texelSize, offsets);
    } else {
      runDiffusionPhase(phase, mHere, branchPrev, branchTex2Prev, texelSize);
    }
    return;
  }

  runGrowthPhase(mHere, branchPrev, branchTex2Prev, texelSize, offsets);
}
