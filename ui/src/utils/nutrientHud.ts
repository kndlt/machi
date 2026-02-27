import type { World } from "../world/types";
import { createProgram } from "./gl-utils";

interface NutrientHudController {
  setEnabled(enabled: boolean): void;
  tick(now: number, isResourceViewMode: boolean): void;
  getLabel(): string | null;
  dispose(): void;
}

const HUD_SAMPLE_INTERVAL_MS = 500;

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

const REDUCE_FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_source;
uniform ivec2 u_source_size;
uniform int u_decode_signed_byte;

out vec4 out_color;

float sourceValue(ivec2 p) {
  if (u_decode_signed_byte == 1) {
    float byteVal = floor(clamp(texelFetch(u_source, p, 0).g, 0.0, 1.0) * 255.0 + 0.5);
    return byteVal - 127.0;
  }
  return texelFetch(u_source, p, 0).r;
}

void main() {
  ivec2 outPos = ivec2(gl_FragCoord.xy);
  ivec2 basePos = outPos * 2;

  float sum = 0.0;

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

  out_color = vec4(sum, 0.0, 0.0, 1.0);
}
`;

export function createNutrientHud(
  gl: WebGL2RenderingContext,
  world: World,
): NutrientHudController {
  const sampleFbo = gl.createFramebuffer();
  const readbackCache = new Map<string, Uint8Array>();
  const pyramidCache = new Map<string, ReductionPyramid>();

  const reduceVAO = gl.createVertexArray();
  let reduceProgram: WebGLProgram | null = null;
  let uSource: WebGLUniformLocation | null = null;
  let uSourceSize: WebGLUniformLocation | null = null;
  let uDecodeSignedByte: WebGLUniformLocation | null = null;

  let gpuReductionAvailable = false;
  try {
    const ext = gl.getExtension("EXT_color_buffer_float");
    if (ext) {
      reduceProgram = createProgram(gl, REDUCE_VERT, REDUCE_FRAG);
      uSource = gl.getUniformLocation(reduceProgram, "u_source");
      uSourceSize = gl.getUniformLocation(reduceProgram, "u_source_size");
      uDecodeSignedByte = gl.getUniformLocation(reduceProgram, "u_decode_signed_byte");
      gpuReductionAvailable = !!reduceProgram && !!uSource && !!uSourceSize && !!uDecodeSignedByte && !!reduceVAO;
    }
  } catch (error) {
    console.warn("Nutrient HUD: GPU reduction unavailable, using CPU fallback", error);
    gpuReductionAvailable = false;
    if (reduceProgram) {
      gl.deleteProgram(reduceProgram);
      reduceProgram = null;
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

  function readTotalSignedNutrientGPU(texture: WebGLTexture, width: number, height: number): number | null {
    if (!gpuReductionAvailable || !reduceProgram || !uSource || !uSourceSize || !uDecodeSignedByte || !reduceVAO) {
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

    let sourceTex = texture;
    let sourceWidth = width;
    let sourceHeight = height;

    for (let i = 0; i < pyramid.levels.length; i++) {
      const level = pyramid.levels[i];

      gl.bindFramebuffer(gl.FRAMEBUFFER, level.fbo);
      gl.viewport(0, 0, level.width, level.height);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTex);
      gl.uniform1i(uSource, 0);
      gl.uniform2i(uSourceSize, sourceWidth, sourceHeight);
      gl.uniform1i(uDecodeSignedByte, i === 0 ? 1 : 0);

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

    return reduceReadback[0];
  }

  function readTotalSignedNutrientCPU(texture: WebGLTexture, width: number, height: number): number | null {
    if (!sampleFbo) return null;
    if (width <= 0 || height <= 0) return null;

    const key = `${width}x${height}`;
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

    let sum = 0;
    for (let i = 0; i < requiredLength; i += 4) {
      sum += buf[i + 1] - 127;
    }
    return sum;
  }

  function readTotalSignedNutrient(texture: WebGLTexture, width: number, height: number): number | null {
    if (gpuReductionAvailable) {
      const gpuValue = readTotalSignedNutrientGPU(texture, width, height);
      if (gpuValue != null && Number.isFinite(gpuValue)) {
        return Math.round(gpuValue);
      }
    }
    return readTotalSignedNutrientCPU(texture, width, height);
  }

  function refresh(): void {
    if (!enabled || !resourceViewModeActive) {
      label = null;
      return;
    }

    let hasAny = false;
    let totalSigned = 0;
    for (const placement of world.mapPlacements) {
      const branch2Tex = placement.map.layers.branch2;
      if (!branch2Tex) continue;

      const partial = readTotalSignedNutrient(branch2Tex, placement.map.width, placement.map.height);
      if (partial == null) continue;

      totalSigned += partial;
      hasAny = true;
    }

    if (!hasAny) {
      label = null;
      return;
    }

    label = `Total nutrient: ${totalSigned >= 0 ? "+" : ""}${totalSigned}`;
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
    if (reduceVAO) {
      gl.deleteVertexArray(reduceVAO);
    }
    readbackCache.clear();
  }

  return {
    setEnabled,
    tick,
    getLabel,
    dispose,
  };
}
