import type { World } from "../world/types";
import { createProgram } from "./gl-utils";

interface NutrientHudController {
  setEnabled(enabled: boolean): void;
  tick(now: number, isResourceViewMode: boolean): void;
  getLabel(): string | null;
  dispose(): void;
}

const HUD_SAMPLE_INTERVAL_MS = 500;
const ROOT_CREATION_COST = 1.0;
const BRANCH_CREATION_COST = 1.0;
const NUTRIENT_UNIT = "nu";

interface ReductionLevel {
  width: number;
  height: number;
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
}

interface ReductionPyramid {
  width: number;
  height: number;
  levels: ReductionLevel[];
}

interface NormalizedTextureCacheEntry {
  width: number;
  height: number;
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
}

interface NutrientLikeTotals {
  dirtNutrient: number;
  rootNutrient: number;
  branchNutrient: number;
  embodiedUnits: number;
}

interface CellCounts {
  rootCells: number;
  branchCells: number;
}

const REDUCE_VERT = `#version 300 es
precision highp float;

out vec2 v_uv;

void main() {
  vec2 p;
  if (gl_VertexID == 0) {
    p = vec2(-1.0, -1.0);
  } else if (gl_VertexID == 1) {
    p = vec2(3.0, -1.0);
  } else {
    p = vec2(-1.0, 3.0);
  }
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const NORMALIZE_UINT_FRAG = `#version 300 es
precision highp float;
precision highp usampler2D;

uniform usampler2D u_uint_tex;

in vec2 v_uv;
out vec4 out_color;

void main() {
  ivec2 size = textureSize(u_uint_tex, 0);
  ivec2 p = ivec2(v_uv * vec2(size));
  p = clamp(p, ivec2(0), size - ivec2(1));
  uvec4 raw = texelFetch(u_uint_tex, p, 0);
  out_color = vec4(raw) / 255.0;
}
`;

const REDUCE_FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_source;
uniform sampler2D u_branch2;
uniform sampler2D u_foliage;
uniform sampler2D u_matter;
uniform ivec2 u_source_size;
uniform int u_mode;
uniform float u_root_cost;
uniform float u_branch_cost;

out vec4 out_color;

const vec3 DIRT_COLOR = vec3(0.404, 0.322, 0.294);
const float DIRT_COLOR_THRESHOLD = 0.12;

vec4 seedValue(ivec2 p) {
  vec4 branch2 = texelFetch(u_branch2, p, 0);
  vec4 foliage = texelFetch(u_foliage, p, 0);
  vec4 matter = texelFetch(u_matter, p, 0);

  float nutrient = floor(clamp(branch2.g, 0.0, 1.0) * 255.0 + 0.5) - 127.0;
  bool occupied = foliage.a > 0.05;
  float packedType = floor(clamp(branch2.r, 0.0, 1.0) * 255.0 + 0.5);
  bool isRoot = occupied && (mod(packedType, 16.0) == 1.0);
  bool isBranch = occupied && !isRoot;
  bool isDirt = !occupied && (matter.a > 0.5) && (distance(matter.rgb, DIRT_COLOR) < DIRT_COLOR_THRESHOLD);

  float dirtN = isDirt ? nutrient : 0.0;
  float rootN = isRoot ? nutrient : 0.0;
  float branchN = isBranch ? nutrient : 0.0;
  float embodied = (isRoot ? u_root_cost : 0.0) + (isBranch ? u_branch_cost : 0.0);

  return vec4(dirtN, rootN, branchN, embodied);
}

vec4 sourceValue(ivec2 p) {
  if (u_mode == 0) {
    return seedValue(p);
  }
  return texelFetch(u_source, p, 0);
}

void main() {
  ivec2 outPos = ivec2(gl_FragCoord.xy);
  ivec2 basePos = outPos * 2;

  vec4 sum = vec4(0.0);

  ivec2 p00 = basePos;
  if (p00.x < u_source_size.x && p00.y < u_source_size.y) {
    sum += sourceValue(p00);
  }

  ivec2 p10 = basePos + ivec2(1, 0);
  if (p10.x < u_source_size.x && p10.y < u_source_size.y) {
    sum += sourceValue(p10);
  }

  ivec2 p01 = basePos + ivec2(0, 1);
  if (p01.x < u_source_size.x && p01.y < u_source_size.y) {
    sum += sourceValue(p01);
  }

  ivec2 p11 = basePos + ivec2(1, 1);
  if (p11.x < u_source_size.x && p11.y < u_source_size.y) {
    sum += sourceValue(p11);
  }

  out_color = sum;
}
`;

export function createNutrientHud(
  gl: WebGL2RenderingContext,
  world: World,
): NutrientHudController {
  const sampleFbo = gl.createFramebuffer();
  const readbackCache = new Map<string, Uint8Array>();
  const pyramidCache = new Map<string, ReductionPyramid>();
  const normalizedTextureCache = new Map<WebGLTexture, NormalizedTextureCacheEntry>();

  const reduceVAO = gl.createVertexArray();
  let reduceProgram: WebGLProgram | null = null;
  let uSource: WebGLUniformLocation | null = null;
  let uBranch2: WebGLUniformLocation | null = null;
  let uFoliage: WebGLUniformLocation | null = null;
  let uMatter: WebGLUniformLocation | null = null;
  let uSourceSize: WebGLUniformLocation | null = null;
  let uMode: WebGLUniformLocation | null = null;
  let uRootCost: WebGLUniformLocation | null = null;
  let uBranchCost: WebGLUniformLocation | null = null;

  let normalizeProgram: WebGLProgram | null = null;
  let uNormalizeUintTex: WebGLUniformLocation | null = null;

  let gpuReductionAvailable = false;
  try {
    const ext = gl.getExtension("EXT_color_buffer_float");
    normalizeProgram = createProgram(gl, REDUCE_VERT, NORMALIZE_UINT_FRAG);
    uNormalizeUintTex = gl.getUniformLocation(normalizeProgram, "u_uint_tex");
    if (ext) {
      reduceProgram = createProgram(gl, REDUCE_VERT, REDUCE_FRAG);
      uSource = gl.getUniformLocation(reduceProgram, "u_source");
      uBranch2 = gl.getUniformLocation(reduceProgram, "u_branch2");
      uFoliage = gl.getUniformLocation(reduceProgram, "u_foliage");
      uMatter = gl.getUniformLocation(reduceProgram, "u_matter");
      uSourceSize = gl.getUniformLocation(reduceProgram, "u_source_size");
      uMode = gl.getUniformLocation(reduceProgram, "u_mode");
      uRootCost = gl.getUniformLocation(reduceProgram, "u_root_cost");
      uBranchCost = gl.getUniformLocation(reduceProgram, "u_branch_cost");
      gpuReductionAvailable = !!reduceProgram
        && !!uSource
        && !!uBranch2
        && !!uFoliage
        && !!uMatter
        && !!uSourceSize
        && !!uMode
        && !!uRootCost
        && !!uBranchCost
        && !!reduceVAO;
    }
  } catch (error) {
    console.warn("Nutrient HUD: GPU reduction unavailable, using CPU fallback", error);
    gpuReductionAvailable = false;
    if (reduceProgram) {
      gl.deleteProgram(reduceProgram);
      reduceProgram = null;
    }
    if (normalizeProgram) {
      gl.deleteProgram(normalizeProgram);
      normalizeProgram = null;
    }
  }

  const reduceReadback = new Float32Array(4);

  let enabled = true;
  let resourceViewModeActive = false;
  let lastSampleMs = -1;
  let label: string | null = null;

  function createFloatReductionLevel(width: number, height: number): ReductionLevel | null {
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!texture || !fbo) {
      if (texture) gl.deleteTexture(texture);
      if (fbo) gl.deleteFramebuffer(fbo);
      return null;
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(fbo);
      return null;
    }

    return { width, height, texture, fbo };
  }

  function createNormalizedTexture(width: number, height: number): NormalizedTextureCacheEntry | null {
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!texture || !fbo) {
      if (texture) gl.deleteTexture(texture);
      if (fbo) gl.deleteFramebuffer(fbo);
      return null;
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(fbo);
      return null;
    }

    return { width, height, texture, fbo };
  }

  function ensureNormalizedTexture(texture: WebGLTexture, width: number, height: number): NormalizedTextureCacheEntry | null {
    const cached = normalizedTextureCache.get(texture);
    if (cached && cached.width === width && cached.height === height) {
      return cached;
    }

    if (cached) {
      gl.deleteFramebuffer(cached.fbo);
      gl.deleteTexture(cached.texture);
      normalizedTextureCache.delete(texture);
    }

    const created = createNormalizedTexture(width, height);
    if (!created) return null;
    normalizedTextureCache.set(texture, created);
    return created;
  }

  function normalizeIntegerTexture(sourceTexture: WebGLTexture, width: number, height: number): WebGLTexture {
    if (!normalizeProgram || !uNormalizeUintTex || !reduceVAO) {
      return sourceTexture;
    }

    const target = ensureNormalizedTexture(sourceTexture, width, height);
    if (!target) {
      return sourceTexture;
    }

    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const prevProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    const prevVAO = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    const prevActiveTex = gl.getParameter(gl.ACTIVE_TEXTURE) as number;

    gl.useProgram(normalizeProgram);
    gl.bindVertexArray(reduceVAO);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, width, height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(uNormalizeUintTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.activeTexture(prevActiveTex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.bindVertexArray(prevVAO);
    gl.useProgram(prevProgram);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);

    return target.texture;
  }

  function disposePyramid(pyramid: ReductionPyramid): void {
    for (const level of pyramid.levels) {
      gl.deleteFramebuffer(level.fbo);
      gl.deleteTexture(level.texture);
    }
  }

  function ensurePyramid(width: number, height: number): ReductionPyramid | null {
    const key = `${width}x${height}`;
    const cached = pyramidCache.get(key);
    if (cached) return cached;

    if (!gpuReductionAvailable) return null;

    const levels: ReductionLevel[] = [];
    let levelWidth = Math.max(1, Math.ceil(width / 2));
    let levelHeight = Math.max(1, Math.ceil(height / 2));

    while (true) {
      const level = createFloatReductionLevel(levelWidth, levelHeight);
      if (!level) {
        for (const created of levels) {
          gl.deleteFramebuffer(created.fbo);
          gl.deleteTexture(created.texture);
        }
        gpuReductionAvailable = false;
        return null;
      }
      levels.push(level);
      if (levelWidth === 1 && levelHeight === 1) break;
      levelWidth = Math.max(1, Math.ceil(levelWidth / 2));
      levelHeight = Math.max(1, Math.ceil(levelHeight / 2));
    }

    const pyramid = { width, height, levels };
    pyramidCache.set(key, pyramid);
    return pyramid;
  }

  function readNutrientLikeTotalsGPU(
    branch2Texture: WebGLTexture,
    foliageTexture: WebGLTexture,
    matterTexture: WebGLTexture,
    width: number,
    height: number,
  ): NutrientLikeTotals | null {
    if (!gpuReductionAvailable
      || !reduceProgram
      || !uSource
      || !uBranch2
      || !uFoliage
      || !uMatter
      || !uSourceSize
      || !uMode
      || !uRootCost
      || !uBranchCost
      || !reduceVAO
    ) {
      return null;
    }

    const pyramid = ensurePyramid(width, height);
    if (!pyramid) {
      return null;
    }

    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const prevProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    const prevVAO = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    const prevActiveTex = gl.getParameter(gl.ACTIVE_TEXTURE) as number;

    gl.useProgram(reduceProgram);
    gl.bindVertexArray(reduceVAO);

    let sourceTex = branch2Texture;
    let sourceWidth = width;
    let sourceHeight = height;

    for (let i = 0; i < pyramid.levels.length; i++) {
      const level = pyramid.levels[i];

      gl.bindFramebuffer(gl.FRAMEBUFFER, level.fbo);
      gl.viewport(0, 0, level.width, level.height);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTex);
      gl.uniform1i(uSource, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, branch2Texture);
      gl.uniform1i(uBranch2, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, foliageTexture);
      gl.uniform1i(uFoliage, 2);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, matterTexture);
      gl.uniform1i(uMatter, 3);
      gl.uniform2i(uSourceSize, sourceWidth, sourceHeight);
      gl.uniform1i(uMode, i == 0 ? 0 : 1);
      gl.uniform1f(uRootCost, ROOT_CREATION_COST);
      gl.uniform1f(uBranchCost, BRANCH_CREATION_COST);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      sourceTex = level.texture;
      sourceWidth = level.width;
      sourceHeight = level.height;
    }

    const lastLevel = pyramid.levels[pyramid.levels.length - 1];
    gl.bindFramebuffer(gl.FRAMEBUFFER, lastLevel.fbo);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, reduceReadback);

    gl.activeTexture(prevActiveTex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.bindVertexArray(prevVAO);
    gl.useProgram(prevProgram);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);

    return {
      dirtNutrient: Math.round(reduceReadback[0]),
      rootNutrient: Math.round(reduceReadback[1]),
      branchNutrient: Math.round(reduceReadback[2]),
      embodiedUnits: Math.round(reduceReadback[3]),
    };
  }

  function readTextureU8(texture: WebGLTexture, width: number, height: number, keyPrefix: string): Uint8Array | null {
    if (!sampleFbo) return null;
    if (width <= 0 || height <= 0) return null;

    const key = `${keyPrefix}:${width}x${height}`;
    const requiredLength = width * height * 4;
    let buf = readbackCache.get(key);
    if (!buf || buf.length !== requiredLength) {
      buf = new Uint8Array(requiredLength);
      readbackCache.set(key, buf);
    }

    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, sampleFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
      return null;
    }

    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);

    return buf;
  }

  function readNutrientLikeTotalsCPU(
    branch2Texture: WebGLTexture,
    foliageTexture: WebGLTexture,
    matterTexture: WebGLTexture,
    width: number,
    height: number,
  ): NutrientLikeTotals | null {
    const branch2 = readTextureU8(branch2Texture, width, height, "branch2");
    const foliage = readTextureU8(foliageTexture, width, height, "foliage");
    const matter = readTextureU8(matterTexture, width, height, "matter");
    if (!branch2 || !foliage || !matter) {
      return null;
    }

    let dirtNutrient = 0;
    let rootNutrient = 0;
    let branchNutrient = 0;
    let embodiedUnits = 0;

    for (let i = 0; i < branch2.length; i += 4) {
      const nutrient = branch2[i + 1] - 127;
      const occupied = foliage[i + 3] > 12;
      const typeNibble = branch2[i] & 0x0f;
      const isRoot = occupied && typeNibble === 1;
      const isBranch = occupied && !isRoot;

      const mr = matter[i + 0] / 255;
      const mg = matter[i + 1] / 255;
      const mb = matter[i + 2] / 255;
      const ma = matter[i + 3] / 255;
      const dr = mr - 0.404;
      const dg = mg - 0.322;
      const db = mb - 0.294;
      const isDirt = !occupied && ma > 0.5 && Math.sqrt(dr * dr + dg * dg + db * db) < 0.12;

      if (isDirt) dirtNutrient += nutrient;
      if (isRoot) {
        rootNutrient += nutrient;
        embodiedUnits += ROOT_CREATION_COST;
      }
      if (isBranch) {
        branchNutrient += nutrient;
        embodiedUnits += BRANCH_CREATION_COST;
      }
    }

    return { dirtNutrient, rootNutrient, branchNutrient, embodiedUnits };
  }

  function readNutrientLikeTotals(
    branch2Texture: WebGLTexture,
    foliageTexture: WebGLTexture,
    matterTexture: WebGLTexture,
    width: number,
    height: number,
  ): NutrientLikeTotals | null {
    if (gpuReductionAvailable) {
      const gpuValue = readNutrientLikeTotalsGPU(branch2Texture, foliageTexture, matterTexture, width, height);
      if (gpuValue) {
        return gpuValue;
      }
    }
    return readNutrientLikeTotalsCPU(branch2Texture, foliageTexture, matterTexture, width, height);
  }

  function readCellCounts(
    branch2Texture: WebGLTexture,
    foliageTexture: WebGLTexture,
    width: number,
    height: number,
  ): CellCounts | null {
    const branch2 = readTextureU8(branch2Texture, width, height, "branch2_count");
    const foliage = readTextureU8(foliageTexture, width, height, "foliage_count");
    if (!branch2 || !foliage) {
      return null;
    }

    let rootCells = 0;
    let branchCells = 0;
    for (let i = 0; i < branch2.length; i += 4) {
      const occupied = foliage[i + 3] > 12;
      if (!occupied) continue;
      const typeNibble = branch2[i] & 0x0f;
      if (typeNibble === 1) rootCells++;
      else branchCells++;
    }

    return { rootCells, branchCells };
  }

  function refresh(): void {
    if (!enabled || !resourceViewModeActive) {
      label = null;
      return;
    }

    let hasAny = false;
    let dirtNutrient = 0;
    let rootNutrient = 0;
    let branchNutrient = 0;
    let rootCells = 0;
    let branchCells = 0;
    for (const placement of world.mapPlacements) {
      const branch2TexRaw = placement.map.layers.branch2;
      const foliageTexRaw = placement.map.layers.foliage;
      const matterTex = placement.map.layers.matter;
      if (!branch2TexRaw || !foliageTexRaw || !matterTex) continue;

      const branch2Tex = normalizeIntegerTexture(branch2TexRaw, placement.map.width, placement.map.height);
      const foliageTex = normalizeIntegerTexture(foliageTexRaw, placement.map.width, placement.map.height);

      const partial = readNutrientLikeTotals(
        branch2Tex,
        foliageTex,
        matterTex,
        placement.map.width,
        placement.map.height,
      );
      if (partial == null) continue;

      dirtNutrient += partial.dirtNutrient;
      rootNutrient += partial.rootNutrient;
      branchNutrient += partial.branchNutrient;

      const counts = readCellCounts(
        branch2Tex,
        foliageTex,
        placement.map.width,
        placement.map.height,
      );
      if (counts) {
        rootCells += counts.rootCells;
        branchCells += counts.branchCells;
      }
      hasAny = true;
    }

    if (!hasAny) {
      label = null;
      return;
    }

    const totalNutrient = dirtNutrient + rootNutrient + branchNutrient;
    const embodiedUnits = rootCells * ROOT_CREATION_COST + branchCells * BRANCH_CREATION_COST;
    const nutrientLike = totalNutrient + embodiedUnits;
    const branchLike = branchNutrient + branchCells * BRANCH_CREATION_COST;
    const fmtNu = (v: number) => `${Math.round(v)}${NUTRIENT_UNIT}`;

    label =
      `N-like: ${fmtNu(nutrientLike)} | embodied: ${fmtNu(embodiedUnits)}\n`
      + `dirt: ${fmtNu(dirtNutrient)} root: ${fmtNu(rootNutrient)} branch: ${fmtNu(branchLike)}\n`
      + `cells root: ${rootCells} branch: ${branchCells}`;
  }

  function setEnabled(nextEnabled: boolean): void {
    enabled = nextEnabled;
    if (!enabled || !resourceViewModeActive) {
      label = null;
      return;
    }

    lastSampleMs = -1;
    refresh();
  }

  function tick(now: number, isResourceViewMode: boolean): void {
    resourceViewModeActive = isResourceViewMode;
    if (!enabled || !resourceViewModeActive) {
      label = null;
      return;
    }
    if (lastSampleMs >= 0 && now - lastSampleMs < HUD_SAMPLE_INTERVAL_MS) return;

    refresh();
    lastSampleMs = now;
  }

  function getLabel(): string | null {
    return label;
  }

  function dispose(): void {
    label = null;
    if (sampleFbo) {
      gl.deleteFramebuffer(sampleFbo);
    }
    for (const pyramid of pyramidCache.values()) {
      disposePyramid(pyramid);
    }
    pyramidCache.clear();
    if (reduceProgram) {
      gl.deleteProgram(reduceProgram);
      reduceProgram = null;
    }
    if (normalizeProgram) {
      gl.deleteProgram(normalizeProgram);
      normalizeProgram = null;
    }
    if (reduceVAO) {
      gl.deleteVertexArray(reduceVAO);
    }
    for (const entry of normalizedTextureCache.values()) {
      gl.deleteFramebuffer(entry.fbo);
      gl.deleteTexture(entry.texture);
    }
    normalizedTextureCache.clear();
    readbackCache.clear();
  }

  return {
    setEnabled,
    tick,
    getLabel,
    dispose,
  };
}
