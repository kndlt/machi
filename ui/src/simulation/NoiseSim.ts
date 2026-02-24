/**
 * NoiseSim.ts — GPU-driven noise texture that slowly evolves over time.
 *
 * Ping-pong double-buffered like FoliageSim.  Produces a spatially-coherent
 * noise gradient that drifts organically — used by simulation shaders to
 * control random events (growth, death, etc.) instead of per-pixel hashing.
 *
 * Initialized with CPU-seeded random values, then evolved each step by the
 * noise.frag shader (diffusion + perturbation).
 */

import simVert from "../shaders/simulation.vert";
import noiseFrag from "../shaders/noise.frag";
import { createTexture, createFBO, createProgram } from "../utils/gl-utils";

export interface NoiseSim {
  /** Evolve the noise field one step. */
  step(time: number): void;

  /** The noise texture holding the latest result. */
  currentTexture(): WebGLTexture;

  /** Read back the current noise FBO as normalized floats (0–1). */
  readPixels(): Float32Array;

  /** Clean up all GPU resources. */
  dispose(): void;
}

/**
 * Simple seeded PRNG (mulberry32). Returns a function that produces
 * deterministic floats in [0, 1) when given a numeric seed.
 * Falls back to Math.random when no seed is provided.
 */
function createRng(seed?: number): () => number {
  if (seed == null) return Math.random;
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed a texture with uniformly-distributed random noise in [0, 1]. */
function generateInitialNoise(width: number, height: number, seed?: number): Uint8Array {
  const rng = createRng(seed);
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const v = (rng() * 255) | 0;
    data[i] = v;       // R — noise value
    data[i + 1] = 0;   // G — unused
    data[i + 2] = 0;   // B — unused
    data[i + 3] = 255; // A — opaque
  }
  return data;
}

export function createNoiseSim(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  seed?: number,
): NoiseSim {
  const program = createProgram(gl, simVert, noiseFrag);
  const u_prev = gl.getUniformLocation(program, "u_prev");
  const u_time = gl.getUniformLocation(program, "u_time");

  const emptyVAO = gl.createVertexArray()!;

  // Seed both textures with random noise so the first step has data to diffuse
  // When a numeric seed is given, use deterministic PRNG with offset seeds
  const initialA = generateInitialNoise(width, height, seed);
  const initialB = generateInitialNoise(width, height, seed != null ? seed + 1 : undefined);
  const texA = createTexture(gl, width, height, initialA);
  const texB = createTexture(gl, width, height, initialB);
  const fboA = createFBO(gl, texA);
  const fboB = createFBO(gl, texB);

  const textures: [WebGLTexture, WebGLTexture] = [texA, texB];
  const fbos: [WebGLFramebuffer, WebGLFramebuffer] = [fboA, fboB];
  let readIdx = 0;

  function step(time: number): void {
    const readTex = textures[readIdx];
    const writeIdx = 1 - readIdx;
    const writeFbo = fbos[writeIdx];

    gl.useProgram(program);
    gl.bindVertexArray(emptyVAO);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
    gl.viewport(0, 0, width, height);

    gl.uniform1i(u_prev, 0);
    gl.uniform1f(u_time, time);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTex);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    readIdx = writeIdx;
  }

  function currentTexture(): WebGLTexture {
    return textures[readIdx];
  }

  function readPixelsOut(): Float32Array {
    const readFbo = fbos[readIdx];
    const buf = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, readFbo);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const data = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
      data[i] = buf[i] / 255;
    }
    return data;
  }

  function dispose(): void {
    gl.deleteFramebuffer(fboA);
    gl.deleteFramebuffer(fboB);
    gl.deleteTexture(texA);
    gl.deleteTexture(texB);
    gl.deleteVertexArray(emptyVAO);
    gl.deleteProgram(program);
  }

  return { step, currentTexture, readPixels: readPixelsOut, dispose };
}
