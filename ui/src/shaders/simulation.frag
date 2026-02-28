#version 300 es
precision highp float;
precision highp usampler2D;

// Branch simulation shader (v0.3 directional growth model).
//
// IN:
//   - u_matter      : world occupancy/materials
//   - u_foliage_prev: previous branch map
//   - u_noise       : slowly evolving fertility noise
//
// OUT (branch map RGBA8 bytes):
//   R = tree ID byte (0 = empty; non-zero identifies a tree)
//   G = packed direction+error byte (5 bits dir, 3 bits error)
//   B = growth inhibition byte (shared by branch/root)
//   A = occupancy byte (0/255)
//
// Growth logic (no auto-seeding mode):
// - Existing branches persist.
// - Empty AIR cells accept growth from exactly one valid source claim.
// - No dirt-based automatic seeding.
// - Sources may occasionally emit a side branch.

in vec2 v_uv;

uniform sampler2D u_matter;
uniform usampler2D u_foliage_prev;
uniform usampler2D u_branch_tex2_prev;
uniform sampler2D u_light;   // currently unused in v0.3 model
uniform sampler2D u_noise;
uniform int u_branching_enabled;
uniform int u_branch_inhibition_enabled;
uniform int u_main_turn_enabled;
uniform int u_tick;
uniform float u_branch_side_rate;
uniform float u_branch_side_angle_min;
uniform float u_branch_side_angle_max;
uniform float u_main_turn_rate;
uniform float u_main_turn_rate_blocked;
uniform float u_main_turn_max;
uniform float u_root_side_rate;
uniform float u_root_side_angle_min;
uniform float u_root_side_angle_max;
uniform float u_root_turn_rate;
uniform float u_root_turn_rate_blocked;
uniform float u_root_turn_max;
uniform float u_forward_cone_cos;
uniform float u_branch_inhibition_decay;
uniform float u_root_inhibition_decay;
uniform float u_root_creation_cost;
uniform float u_branch_creation_cost;
uniform float u_resource_canopy_transfer_fraction;
uniform float u_resource_anti_canopy_transfer_fraction;
uniform float u_dirt_diffusion_fraction;
uniform float u_root_sap_threshold;
uniform float u_root_sap_amount;

layout(location = 0) out uvec4 out_color_u;
layout(location = 1) out uvec4 out_branch_tex2_u;

// Matter colors (from matter.png palette)
const vec3 DIRT_COLOR  = vec3(0.404, 0.322, 0.294);  // (103, 82, 75)
const vec3 STONE_COLOR = vec3(0.647, 0.592, 0.561);  // (165, 151, 143)
const vec3 WATER_COLOR = vec3(0.200, 0.600, 0.800);  // (51, 153, 204)
const float COLOR_THRESHOLD = 0.12;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;
const float DEG_TO_RAD = PI / 180.0;
const int DIR_BUCKET_COUNT = 32;      // 5 bits for direction bucket
const int ERROR_LEVEL_COUNT = 8;      // 3 bits for error quantization (0..7)
const int DEFAULT_DIR_MAX_COMP = 8;   // tuned to ERROR_LEVEL_COUNT
const ivec2 DIR_DY_DX_LUT_32_MAX8[32] = ivec2[32](
  ivec2( 8,  0), ivec2( 5,  1), ivec2( 5,  2), ivec2( 6,  4),
  ivec2( 7,  7), ivec2( 4,  6), ivec2( 2,  5), ivec2( 1,  5),
  ivec2( 0,  8), ivec2(-1,  5), ivec2(-2,  5), ivec2(-4,  6),
  ivec2(-7,  7), ivec2(-6,  4), ivec2(-5,  2), ivec2(-5,  1),
  ivec2(-8,  0), ivec2(-5, -1), ivec2(-5, -2), ivec2(-6, -4),
  ivec2(-8, -8), ivec2(-4, -6), ivec2(-2, -5), ivec2(-1, -5),
  ivec2( 0, -8), ivec2( 1, -5), ivec2( 2, -5), ivec2( 4, -6),
  ivec2( 8, -8), ivec2( 6, -4), ivec2( 5, -2), ivec2( 5, -1)
);

const float BRANCH_ALPHA_MIN = 127.0;
const uint CELL_TYPE_BRANCH = 0u;
const uint CELL_TYPE_ROOT = 1u;

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

const float INHIBITION_MAX = 255.0;

const float RESOURCE_ZERO_BYTE = 127.0;
const float RESOURCE_MIN_BYTE = 0.0;
const float RESOURCE_MAX_BYTE = 255.0;
const float RESOURCE_SIGNED_MIN = RESOURCE_MIN_BYTE - RESOURCE_ZERO_BYTE;
const float RESOURCE_SIGNED_MAX = RESOURCE_MAX_BYTE - RESOURCE_ZERO_BYTE - 1.0;
const float RESOURCE_RELAX_BRANCH = 0.0;
const float RESOURCE_RELAX_ROOT = 0.0;
const int RESOURCE_ZERO_BYTE_I = 127;
const int RESOURCE_MIN_BYTE_I = 0;
const int RESOURCE_MAX_BYTE_I = 255;
const int RESOURCE_SIGNED_MIN_I = -127;
const int RESOURCE_SIGNED_MAX_I = 127;
// Version: Energy conversation version
// const float RESOURCE_ZERO_BYTE = 127.0;
// const float RESOURCE_MIN_BYTE = 0.0;
// const float RESOURCE_MAX_BYTE = 255.0;
// const float NEW_GROWTH_RESOURCE_COST = 0.0;
// const float ROOT_GATHER_RATE = 4.0;
// const float RESOURCE_DIFFUSION = 0.8;
// const float RESOURCE_RELAX_BRANCH = 0.0;
// const float RESOURCE_RELAX_ROOT = 0.0;

bool isOccupied(uvec4 b);
ivec2 dirFromEncoded(float encoded);
float unpackDir(float packedDirErr);
float unpackErr(float packedDirErr);
void lineStepper(ivec2 dir, out ivec2 primaryStep, out ivec2 secondaryStep, out float slopeMix);
ivec2 bucketIdMaxCompToDyDx(int bucketId, int maxComp);

uvec4 sampleFoliage(vec2 uv) {
  return texture(u_foliage_prev, uv);
}

uvec4 sampleBranchTex2(vec2 uv) {
  return texture(u_branch_tex2_prev, uv);
}

struct NodeState {
  bool occupied;
  float treeIdByte;
  uint cellType;
  ivec2 dir;
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

float selectByType(uint cellType, float branchValue, float rootValue) {
  return (cellType == CELL_TYPE_ROOT) ? rootValue : branchValue;
}

float creationCostForType(uint cellType) {
  return selectByType(cellType, u_branch_creation_cost, u_root_creation_cost);
}

int rootCreationCostI() {
  return int(floor(max(u_root_creation_cost, 0.0) + 0.5));
}

int branchCreationCostI() {
  return int(floor(max(u_branch_creation_cost, 0.0) + 0.5));
}

int rootSapThresholdI() {
  return int(floor(max(u_root_sap_threshold, 0.0) + 0.5));
}

int rootSapAmountI() {
  return int(floor(max(u_root_sap_amount, 0.0) + 0.5));
}

vec2 selectVec2ByType(uint cellType, vec2 branchValue, vec2 rootValue) {
  return (cellType == CELL_TYPE_ROOT) ? rootValue : branchValue;
}

uint sourceCellType(vec2 sourceUV, uvec4 sourceBranch) {
  uvec4 meta = sampleBranchTex2(sourceUV);
  uint typeNibble = meta.r & 15u;
  return (typeNibble == CELL_TYPE_ROOT) ? CELL_TYPE_ROOT : CELL_TYPE_BRANCH;
}

uvec4 withCellType(uvec4 branchTex2Prev, uint cellType) {
  uint upper = branchTex2Prev.r & 240u;
  uint lower = cellType & 15u;
  return uvec4(upper | lower, branchTex2Prev.g, branchTex2Prev.b, branchTex2Prev.a);
}

int unpackResourceSigned(uvec4 branchTex2) {
  int signedResource = int(branchTex2.g) - RESOURCE_ZERO_BYTE_I;
  return clamp(signedResource, RESOURCE_SIGNED_MIN_I, RESOURCE_SIGNED_MAX_I);
}

int computeResourceTransfer(int sourceResource, int sinkResource, bool parentToChildTowardCanopy) {
  int diff = sourceResource - sinkResource;
  if (diff == 0) return 0;

  int signDiff = (diff < 0) ? -1 : 1;
  int magnitude = abs(diff);

  bool isCanopyDirectionFlow =
    (parentToChildTowardCanopy && diff > 0) ||
    (!parentToChildTowardCanopy && diff < 0);
  if (isCanopyDirectionFlow && magnitude == 1) {
    return signDiff;
  }

  float transferFraction;
  if (parentToChildTowardCanopy) {
    transferFraction = (diff > 0)
      ? u_resource_canopy_transfer_fraction
      : u_resource_anti_canopy_transfer_fraction;
  } else {
    transferFraction = (diff > 0)
      ? u_resource_anti_canopy_transfer_fraction
      : u_resource_canopy_transfer_fraction;
  }
  int transferredMagnitude = int(floor(float(magnitude) * transferFraction));
  return signDiff * transferredMagnitude;
}

int computeDirtDiffusionFlow(int sourceResource, int sinkResource) {
  int diff = sourceResource - sinkResource;
  if (diff == 0) return 0;

  int signDiff = (diff < 0) ? -1 : 1;
  int magnitude = abs(diff);
  if (magnitude == 1) {
    return signDiff;
  } 
  // else if (magnitude == 2.0) {
  //   return signDiff;
  // } 
  // else if (magnitude == 3.0) {
  //   return signDiff;
  // }

  int transferredMagnitude = int(floor(float(magnitude) * u_dirt_diffusion_fraction));
  return signDiff * transferredMagnitude;
}

int computeRootSapAmount(int dirtNutrient, int rootNutrient) {
  return ((dirtNutrient - rootNutrient) >= rootSapThresholdI()) ? rootSapAmountI() : 0;
}

uint packResourceSigned(int signedResource) {
  int clampedSigned = clamp(signedResource, RESOURCE_SIGNED_MIN_I, RESOURCE_SIGNED_MAX_I);
  int byteVal = clamp(clampedSigned + RESOURCE_ZERO_BYTE_I, RESOURCE_MIN_BYTE_I, RESOURCE_MAX_BYTE_I);
  return uint(byteVal);
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

NodeState makeNodeState(vec2 uv, uvec4 foliageSample, uvec4 branchTex2Sample) {
  NodeState state;
  state.occupied = isOccupied(foliageSample);
  state.treeIdByte = float(foliageSample.r);
  state.cellType = sourceCellType(uv, foliageSample);
  state.dir = dirFromEncoded(unpackDir(float(foliageSample.g)));
  state.err = unpackErr(float(foliageSample.g));
  state.pos = latticePosFromUV(uv);
  return state;
}

NodeState decodeNodeStateAtUV(vec2 uv) {
  ivec2 sizeI = textureSize(u_matter, 0);
  vec2 texelSize = 1.0 / vec2(sizeI);
  vec2 safeUV = edgeSafeUV(uv, texelSize);
  uvec4 foliageSample = sampleFoliage(safeUV);
  uvec4 branchTex2Sample = sampleBranchTex2(safeUV);
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

ivec2 expectedBackwardStepFromDirErr(ivec2 dir, float err) {
  ivec2 primaryStep;
  ivec2 secondaryStep;
  float slopeMix;
  lineStepper(dir, primaryStep, secondaryStep, slopeMix);

  float errNext = err + slopeMix;
  bool takeSecondary = errNext >= 1.0;
  ivec2 childForwardStep = takeSecondary ? secondaryStep : primaryStep;
  ivec2 backwardStep = -childForwardStep;
  return backwardStep;
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
  state.dir = ivec2(0, -1);
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

uvec4 withCellTypeAndResource(uvec4 branchTex2Prev, uint cellType, int signedResource) {
  uvec4 outMeta = withCellType(branchTex2Prev, cellType);
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

bool isOccupied(uvec4 b) {
  return float(b.a) > BRANCH_ALPHA_MIN;
}

ivec2 dirFromEncoded(float encoded) {
  int bucket = int(floor(fract(encoded) * float(DIR_BUCKET_COUNT) + 0.5));
  bucket = (bucket % DIR_BUCKET_COUNT + DIR_BUCKET_COUNT) % DIR_BUCKET_COUNT;
  ivec2 dyDx = DIR_DY_DX_LUT_32_MAX8[bucket];
  return ivec2(dyDx.y, -dyDx.x);
}

ivec2 quantizeDir(vec2 direction) {
  vec2 d = normalize(direction);
  float bestDot = -1e30;
  int bestBucket = 0;
  for (int i = 0; i < DIR_BUCKET_COUNT; i++) {
    ivec2 dyDx = DIR_DY_DX_LUT_32_MAX8[i];
    vec2 lutDir = normalize(vec2(float(dyDx.y), -float(dyDx.x)));
    float score = dot(d, lutDir);
    if (score > bestDot) {
      bestDot = score;
      bestBucket = i;
    }
  }
  ivec2 bestDyDx = DIR_DY_DX_LUT_32_MAX8[bestBucket];
  return ivec2(bestDyDx.y, -bestDyDx.x);
}

float encodeDir(ivec2 direction) {
  vec2 d = normalize(vec2(direction));
  float bestDot = -1e30;
  int bestBucket = 0;
  for (int i = 0; i < DIR_BUCKET_COUNT; i++) {
    ivec2 dyDx = DIR_DY_DX_LUT_32_MAX8[i];
    vec2 lutDir = normalize(vec2(float(dyDx.y), -float(dyDx.x)));
    float score = dot(d, lutDir);
    if (score > bestDot) {
      bestDot = score;
      bestBucket = i;
    }
  }
  return float(bestBucket) / float(DIR_BUCKET_COUNT);
}

// Fast LUT mapping for maxComp=8.
// Input table is (dx,dy); function returns ivec2(dy,dx).
ivec2 bucketIdMaxCompToDyDx(int bucketId, int maxComp) {
  int wrappedBucket = (bucketId % DIR_BUCKET_COUNT + DIR_BUCKET_COUNT) % DIR_BUCKET_COUNT;

  if (maxComp <= 0 || maxComp == DEFAULT_DIR_MAX_COMP) {
    return DIR_DY_DX_LUT_32_MAX8[wrappedBucket];
  }

  float scale = float(max(1, maxComp)) / float(DEFAULT_DIR_MAX_COMP);
  ivec2 base = DIR_DY_DX_LUT_32_MAX8[wrappedBucket];
  return ivec2(
    int(round(float(base.x) * scale)),
    int(round(float(base.y) * scale))
  );
}

float packDirErr(float encodedDir, float errorAcc) {
  float dirBucketsF = float(DIR_BUCKET_COUNT);
  float errorLevelsF = float(ERROR_LEVEL_COUNT);
  float dirQ = floor(fract(encodedDir) * dirBucketsF);
  float errQ = floor(clamp(errorAcc, 0.0, 0.999999) * errorLevelsF);
  float packed = dirQ * errorLevelsF + errQ;
  return packed;
}

float unpackDir(float packedDirErr) {
  float packed = floor(packedDirErr + 0.5);
  float errorLevelsF = float(ERROR_LEVEL_COUNT);
  float dirBucketsF = float(DIR_BUCKET_COUNT);
  float dirQ = floor(packed / errorLevelsF);
  return dirQ / dirBucketsF;
}

float unpackErr(float packedDirErr) {
  float packed = floor(packedDirErr + 0.5);
  float errQ = mod(packed, float(ERROR_LEVEL_COUNT));
  return errQ / float(ERROR_LEVEL_COUNT - 1);
}

float packInhibition(float inhibition) {
  float q = floor(clamp(inhibition, 0.0, INHIBITION_MAX) + 0.5);
  return q;
}

float unpackInhibition(float encoded) {
  return floor(clamp(encoded, 0.0, INHIBITION_MAX) + 0.5);
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

uvec4 makeBranch(float treeId, float encodedDir, float errorAcc, float inhibition) {
  float id = clamp(treeId, 1.0, 255.0);
  float packedDirErr = packDirErr(encodedDir, errorAcc);
  return uvec4(uint(id), uint(packedDirErr), uint(packInhibition(inhibition)), 255u);
}

uvec4 emptyCell(float inhibition) {
  return uvec4(0u, 0u, uint(packInhibition(inhibition)), 0u);
}

void lineStepper(ivec2 dir, out ivec2 primaryStep, out ivec2 secondaryStep, out float slopeMix) {
  int vx = dir.x;
  int vy = dir.y;
  int ax = abs(vx);
  int ay = abs(vy);
  int sx = (vx > 0) ? 1 : ((vx < 0) ? -1 : 0);
  int sy = (vy > 0) ? 1 : ((vy < 0) ? -1 : 0);

  if (ax >= ay) {
    primaryStep = ivec2(sx, 0);
    secondaryStep = ivec2(sx, sy);
    slopeMix = (ax > 0) ? (float(ay) / float(ax)) : 0.0;
  } else {
    primaryStep = ivec2(0, sy);
    secondaryStep = ivec2(sx, sy);
    slopeMix = (ay > 0) ? (float(ax) / float(ay)) : 0.0;
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
    if (dot(rel, dir) < u_forward_cone_cos) continue;

    vec2 probeUV = edgeSafeUV(candidateUV + vec2(lattice.x * texelSize.x, lattice.y * texelSize.y), texelSize);
    if (distance(probeUV, sourceUV) <= sourceEps) continue;
    if (isOccupied(sampleFoliage(probeUV))) return true;
  }

  return false;
}

void runSappingPhase(vec4 mHere, uvec4 branchPrev, uvec4 branchTex2Prev, uint hereType, vec2 texelSize, in vec2 offsets[8]) {
  if (isOccupied(branchPrev)) {
    int hereResourcePrev = unpackResourceSigned(branchTex2Prev);
    int hereResource = hereResourcePrev;

    if (hereType == CELL_TYPE_ROOT) {
      int sapGain = 0;
      for (int i = 0; i < 8; i++) {
        vec2 nbUV = edgeSafeUV(v_uv + offsets[i], texelSize);
        vec4 nbMatter = texture(u_matter, nbUV);
        if (!isDirt(nbMatter)) continue;

        uvec4 nbBranch = sampleFoliage(nbUV);
        if (isOccupied(nbBranch)) continue;

        int dirtNutrient = unpackResourceSigned(sampleBranchTex2(nbUV));
        sapGain += computeRootSapAmount(dirtNutrient, hereResourcePrev);
      }
      hereResource += sapGain;
    }

    out_color_u = branchPrev;
    out_branch_tex2_u = withCellTypeAndResource(branchTex2Prev, hereType, hereResource);
    return;
  }

  int candidateNutrient = unpackResourceSigned(branchTex2Prev);
  if (isDirt(mHere)) {
    int sapLoss = 0;
    for (int i = 0; i < 8; i++) {
      vec2 nbUV = edgeSafeUV(v_uv + offsets[i], texelSize);
      uvec4 nbBranch = sampleFoliage(nbUV);
      if (!isOccupied(nbBranch)) continue;

      uint nbType = sourceCellType(nbUV, nbBranch);
      if (nbType != CELL_TYPE_ROOT) continue;

      int rootNutrient = unpackResourceSigned(sampleBranchTex2(nbUV));
      sapLoss += computeRootSapAmount(candidateNutrient, rootNutrient);
    }
    candidateNutrient = clamp(candidateNutrient - sapLoss, RESOURCE_SIGNED_MIN_I, RESOURCE_SIGNED_MAX_I);
  }

  out_color_u = branchPrev;
  uvec4 sapMeta = branchTex2Prev;
  sapMeta.g = packResourceSigned(candidateNutrient);
  out_branch_tex2_u = sapMeta;
}

void runInternalPhase(uvec4 branchPrev, uvec4 branchTex2Prev, uint hereType, vec2 texelSize, in vec2 offsets[8]) {
  if (!isOccupied(branchPrev)) {
    out_color_u = branchPrev;
    out_branch_tex2_u = branchTex2Prev;
    return;
  }

  int hereResourcePrev = unpackResourceSigned(branchTex2Prev);
  int hereResource = hereResourcePrev;

  int resourceIncoming = 0;
  int resourceOutgoing = 0;
  NodeState hereNode = makeNodeState(v_uv, branchPrev, branchTex2Prev);
  ParentHit upstreamHit = getParent(hereNode);
  if (upstreamHit.found) {
    vec2 parentUV = uvFromLatticePos(upstreamHit.parent.pos);
    int parentResource = unpackResourceSigned(sampleBranchTex2(parentUV));
    bool parentToChildTowardCanopy = (hereType != CELL_TYPE_ROOT);
    resourceIncoming += computeResourceTransfer(parentResource, hereResourcePrev, parentToChildTowardCanopy);
  }

  for (int i = 0; i < 8; i++) {
    vec2 childUV = edgeSafeUV(v_uv + offsets[i], texelSize);
    uvec4 childBranch = sampleFoliage(childUV);
    if (!isOccupied(childBranch)) continue;

    uvec4 childMeta = sampleBranchTex2(childUV);
    NodeState childNode = makeNodeState(childUV, childBranch, childMeta);
    if (!isChildOf(childNode, hereNode)) continue;

    int childResourcePrev = unpackResourceSigned(childMeta);
    bool parentToChildTowardCanopy = (childNode.cellType != CELL_TYPE_ROOT);
    resourceOutgoing += computeResourceTransfer(hereResourcePrev, childResourcePrev, parentToChildTowardCanopy);
  }
  hereResource = hereResourcePrev + resourceIncoming - resourceOutgoing;

  if (u_branch_inhibition_enabled == 0) {
    out_color_u = uvec4(branchPrev.r, branchPrev.g, 0u, branchPrev.a);
    out_branch_tex2_u = withCellTypeAndResource(branchTex2Prev, hereType, hereResource);
    return;
  }

  float inhibCenter = unpackInhibition(float(branchPrev.b));
  float inhibNeighborMax = 0.0;
  float inhibitionDecay = (hereType == CELL_TYPE_ROOT)
    ? u_root_inhibition_decay
    : u_branch_inhibition_decay;
  for (int i = 0; i < 8; i++) {
    vec2 nbUV = edgeSafeUV(v_uv + offsets[i], texelSize);
    uvec4 nb = sampleFoliage(nbUV);
    if (!isOccupied(nb)) continue;
    uint nbType = sourceCellType(nbUV, nb);
    if (nbType != hereType) continue;
    float n = unpackInhibition(float(nb.b));
    inhibNeighborMax = max(inhibNeighborMax, n);
  }
  float inhibBase = max(
    max(0.0, inhibCenter - inhibitionDecay),
    max(0.0, inhibNeighborMax - inhibitionDecay)
  );
  out_color_u = uvec4(branchPrev.r, branchPrev.g, uint(packInhibition(inhibBase)), branchPrev.a);
  out_branch_tex2_u = withCellTypeAndResource(branchTex2Prev, hereType, hereResource);
}

void runDiffusionPhase(int phase, vec4 mHere, uvec4 branchPrev, uvec4 branchTex2Prev, vec2 texelSize) {
  if (isOccupied(branchPrev)) {
    out_color_u = branchPrev;
    out_branch_tex2_u = branchTex2Prev;
    return;
  }

  int candidateNutrient = unpackResourceSigned(branchTex2Prev);
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
      uvec4 branchN = sampleFoliage(partnerUV);
      if (isDirt(mN) && !isOccupied(branchN)) {
        int neighborNutrient = unpackResourceSigned(sampleBranchTex2(partnerUV));
        candidateNutrient += computeDirtDiffusionFlow(neighborNutrient, candidateNutrient);
      }
    }

    candidateNutrient = clamp(candidateNutrient, RESOURCE_SIGNED_MIN_I, RESOURCE_SIGNED_MAX_I);
  }

  uvec4 emptyMeta = branchTex2Prev;
  emptyMeta.g = packResourceSigned(candidateNutrient);

  if (!candidateIsAir && !candidateIsDirt) {
    out_color_u = branchPrev;
    out_branch_tex2_u = branchTex2Prev;
    return;
  }

  out_color_u = branchPrev;
  out_branch_tex2_u = emptyMeta;
}

void runGrowthPhase(vec4 mHere, uvec4 branchPrev, uvec4 branchTex2Prev, vec2 texelSize, in vec2 offsets[8]) {
  if (isOccupied(branchPrev)) {
    out_color_u = branchPrev;
    out_branch_tex2_u = branchTex2Prev;
    return;
  }

  int claimCount = 0;
  float chosenId = 0.0;
  float chosenDir = 0.0;
  float chosenErr = 0.0;
  float chosenInhib = 0.0;
  uint chosenType = CELL_TYPE_BRANCH;
  int chosenResource = 0;
  int candidateNutrient = unpackResourceSigned(branchTex2Prev);
  ivec2 candidatePos = latticePosFromUV(v_uv);
  bool candidateIsAir = isAir(mHere);
  bool candidateIsDirt = isDirt(mHere);
  bool touchingWater = false;

  uvec4 emptyMeta = branchTex2Prev;
  emptyMeta.g = packResourceSigned(candidateNutrient);

  if (!candidateIsAir && !candidateIsDirt) {
    out_color_u = branchPrev;
    out_branch_tex2_u = branchTex2Prev;
    return;
  }

  for (int i = 0; i < 8; i++) {
    vec2 uvN = edgeSafeUV(v_uv + offsets[i], texelSize);
    vec4 mN = texture(u_matter, uvN);
    if (isWater(mN)) touchingWater = true;
  }

  if (touchingWater) {
    out_color_u = branchPrev;
    out_branch_tex2_u = emptyMeta;
    return;
  }

  for (int i = 0; i < 8; i++) {
    vec2 sourceUV = edgeSafeUV(v_uv + offsets[i], texelSize);
    uvec4 sourceBranch = sampleFoliage(sourceUV);
    if (!isOccupied(sourceBranch)) continue;
    uvec4 sourceMeta = sampleBranchTex2(sourceUV);
    NodeState sourceNode = makeNodeState(sourceUV, sourceBranch, sourceMeta);
    int sourceNutrient = unpackResourceSigned(sourceMeta);
    uint sourceType = sourceCellType(sourceUV, sourceBranch);
    bool sourceIsRoot = sourceType == CELL_TYPE_ROOT;
    if (sourceIsRoot && !candidateIsDirt) continue;

    float sideRate = selectByType(sourceType, u_branch_side_rate, u_root_side_rate);
    float sideAngleMin = selectByType(sourceType, u_branch_side_angle_min, u_root_side_angle_min);
    float sideAngleMax = selectByType(sourceType, u_branch_side_angle_max, u_root_side_angle_max);
    float mainTurnRate = selectByType(sourceType, u_main_turn_rate, u_root_turn_rate);
    float mainTurnRateBlocked = selectByType(sourceType, u_main_turn_rate_blocked, u_root_turn_rate_blocked);
    float mainTurnMax = selectByType(sourceType, u_main_turn_max, u_root_turn_max);

    vec2 turnSaltA = selectVec2ByType(sourceType, HASH_SALT_TURN_A_BRANCH, HASH_SALT_TURN_A_ROOT);
    vec2 turnSaltSign = selectVec2ByType(sourceType, HASH_SALT_TURN_SIGN_BRANCH, HASH_SALT_TURN_SIGN_ROOT);
    vec2 turnSaltMag = selectVec2ByType(sourceType, HASH_SALT_TURN_MAG_BRANCH, HASH_SALT_TURN_MAG_ROOT);
    vec2 sideSalt = selectVec2ByType(sourceType, HASH_SALT_SIDE_BRANCH, HASH_SALT_SIDE_ROOT);
    vec2 sideSignSalt = selectVec2ByType(sourceType, HASH_SALT_SIDE_SIGN_BRANCH, HASH_SALT_SIDE_SIGN_ROOT);
    vec2 sideAngleSalt = selectVec2ByType(sourceType, HASH_SALT_SIDE_ANGLE_BRANCH, HASH_SALT_SIDE_ANGLE_ROOT);

    float sourcePacked = float(sourceBranch.g);
    float sourcePackedNorm = sourcePacked / 255.0;
    float sourceErr = unpackErr(sourcePacked);
    float sourceInhib = (u_branch_inhibition_enabled == 1)
      ? unpackInhibition(float(sourceBranch.b))
      : 0.0;
    ivec2 sourceDir = dirFromEncoded(unpackDir(sourcePacked));

    if (!sourceIsRoot && candidateIsDirt) {
      ParentHit sourceParentHit = getParent(sourceNode);
      if (sourceParentHit.found && sourceParentHit.parent.cellType == CELL_TYPE_ROOT) {
        continue;
      }

      ivec2 seedDir = -sourceDir;
      ivec2 seedPrimaryStep;
      ivec2 seedSecondaryStep;
      float seedSlopeMix;
      lineStepper(seedDir, seedPrimaryStep, seedSecondaryStep, seedSlopeMix);

      ivec2 stepToParent = sourceNode.pos - candidatePos;
      ivec2 backwardPrimary = -seedPrimaryStep;
      ivec2 backwardSecondary = -seedSecondaryStep;
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
        if (blockedInForwardCone(v_uv, sourceUV, vec2(seedDir), texelSize)) continue;
        int requiredCost = rootCreationCostI();
        int availableForSpawn = sourceNutrient + candidateNutrient;
        if (availableForSpawn < requiredCost) continue;
        claimCount++;
        if (claimCount == 1) {
          chosenId = float(sourceBranch.r);
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
      if (isOccupied(sampleFoliage(aroundUV))) {
        sourceNeighborCount++;
      }
    }
    bool isTipSource = sourceNeighborCount == 1;

    ParentHit sourceParentHit = getParent(sourceNode);
    bool hasParent = sourceParentHit.found;

    ivec2 steeredDir = sourceDir;

    ivec2 unsteeredPrimaryStep;
    ivec2 unsteeredSecondaryStep;
    float unsteeredSlopeMix;
    lineStepper(sourceDir, unsteeredPrimaryStep, unsteeredSecondaryStep, unsteeredSlopeMix);

    vec2 mainStepUV = edgeSafeUV(
      sourceUV + vec2(float(unsteeredPrimaryStep.x) * texelSize.x, float(unsteeredPrimaryStep.y) * texelSize.y),
      texelSize
    );
    bool forwardOccupied = isOccupied(sampleFoliage(mainStepUV));

    if ((u_main_turn_enabled == 1) && isTipSource) {
      float turnHash = hash12(sourceUV * turnSaltA + sourceErr * 127.0);
      float turnSignHash = hash12(sourceUV * turnSaltSign + sourcePackedNorm * 389.0);
      float turnChance = (forwardOccupied ? mainTurnRateBlocked : mainTurnRate) * max(fertility, 0.25);
      if (turnHash < turnChance) {
        float turnSign = turnSignHash < 0.5 ? -1.0 : 1.0;
        float turnMagnitude = mainTurnMax * (0.35 + 0.65 * hash12(sourceUV * turnSaltMag + sourceErr * 43.0));
        steeredDir = quantizeDir(rotateVec(vec2(sourceDir), turnSign * turnMagnitude));
      }
    }

    ivec2 primaryStep;
    ivec2 secondaryStep;
    float slopeMix;
    lineStepper(steeredDir, primaryStep, secondaryStep, slopeMix);

    float err = sourceErr;
    float errNext = err + slopeMix;
    bool takeSecondary = errNext >= 1.0;
    float childErr = takeSecondary ? (errNext - 1.0) : errNext;

    float sideHash = hash12(sourceUV * sideSalt + sourcePackedNorm * 257.0);
    float sideSign = hash12(sourceUV * sideSignSalt + sourceErr * 911.0) < 0.5 ? -1.0 : 1.0;
    bool emitSide = (u_branching_enabled == 1)
      && isTipSource
      && hasParent
      && (!forwardOccupied)
      && (sideHash < branchGate);

    float sideEncodedDir = 0.0;
    float sideChildErr = 0.0;
    if (emitSide) {
      float angleMix = hash12(sourceUV * sideAngleSalt + sourcePackedNorm * 53.0);
      float sideAngle = mix(sideAngleMin, sideAngleMax, angleMix);
      ivec2 sideDir = quantizeDir(rotateVec(vec2(steeredDir), sideSign * sideAngle));
      sideChildErr = 0.0;
      sideEncodedDir = encodeDir(sideDir);
    }

    bool claimed = false;
    float claimId = 0.0;
    float claimDir = 0.0;
    float claimErr = 0.0;
    float claimInhib = sourceInhib;
    uint claimType = sourceType;
    int claimResource = candidateNutrient;

    NodeState claimCandidate = makeEmptyNodeState();
    claimCandidate.occupied = true;
    claimCandidate.treeIdByte = sourceNode.treeIdByte;
    claimCandidate.cellType = sourceType;
    claimCandidate.pos = candidatePos;

    claimCandidate.dir = steeredDir;
    claimCandidate.err = childErr;
    if (isChildOf(claimCandidate, sourceNode)) {
      if (blockedInForwardCone(v_uv, sourceUV, vec2(steeredDir), texelSize)) continue;
      claimed = true;
      claimId = float(sourceBranch.r);
      claimDir = encodeDir(steeredDir);
      claimErr = childErr;
      claimInhib = sourceInhib;
      claimType = sourceType;
    } else if (emitSide) {
      ivec2 sideDir = dirFromEncoded(sideEncodedDir);
      claimCandidate.dir = sideDir;
      claimCandidate.err = sideChildErr;
      if (!isChildOf(claimCandidate, sourceNode)) {
        continue;
      }
      if (blockedInForwardCone(v_uv, sourceUV, vec2(sideDir), texelSize)) continue;
      claimed = true;
      claimId = float(sourceBranch.r);
      claimDir = sideEncodedDir;
      claimErr = sideChildErr;
      claimInhib = (u_branch_inhibition_enabled == 1) ? INHIBITION_MAX : 0.0;
      claimType = sourceType;
    }

    if (claimed) {
      int requiredCost = (claimType == CELL_TYPE_ROOT) ? rootCreationCostI() : branchCreationCostI();
      int availableForSpawn = sourceNutrient + candidateNutrient;
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
    out_color_u = branchPrev;
    out_branch_tex2_u = emptyMeta;
    return;
  }

  out_color_u = makeBranch(chosenId, chosenDir, chosenErr, chosenInhib);
  out_branch_tex2_u = withCellTypeAndResource(branchTex2Prev, chosenType, chosenResource);
}

void main() {
  vec4 mHere = texture(u_matter, v_uv);
  uvec4 branchPrev = sampleFoliage(v_uv);
  uvec4 branchTex2Prev = sampleBranchTex2(v_uv);
  uint hereType = sourceCellType(v_uv, branchPrev);
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
