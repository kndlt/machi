/**
 * FoliageSim.ts — Core foliage simulation with ping-pong double buffering.
 *
 * Encapsulates the shader program, two ping-pong texture pairs (branchTex1 + branchTex2), and two FBOs.
 * Both SimulationRenderer (app) and sim-runner (lab) use this.
 */

import simVert from "../shaders/simulation.vert";
import simFrag from "../shaders/simulation.frag";
import { createTexture, createProgram } from "../utils/gl-utils";

export interface FoliageSim {
  /** Run one simulation step. Swaps ping-pong buffers internally. */
  step(matterTex: WebGLTexture, noiseTex: WebGLTexture, lightTex: WebGLTexture, tick: number): void;

  /** Toggle side-branch generation. */
  branchingEnabled: boolean;

  /** Toggle inhibition field update + inhibition effect on side branching. */
  branchInhibitionEnabled: boolean;

  /** Upload explicit initial branch-state textures into both ping-pong buffers. */
  setInitialState(branchTex1: Uint8Array, branchTex2?: Uint8Array): void;

  /** The foliage texture that holds the latest result (read source). */
  currentTexture(): WebGLTexture;

  /** The branchTex2 metadata texture that holds the latest result (read source). */
  currentTexture2(): WebGLTexture;

  /** Read back the current foliage FBO as normalized floats (0–1). */
  readPixels(): Float32Array;

  /** Clean up all GPU resources. */
  dispose(): void;
}

export function createFoliageSim(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): FoliageSim {
  const program = createProgram(gl, simVert, simFrag);
  const u_matter = gl.getUniformLocation(program, "u_matter");
  const u_foliage_prev = gl.getUniformLocation(program, "u_foliage_prev");
  const u_branch_tex2_prev = gl.getUniformLocation(program, "u_branch_tex2_prev");
  const u_noise = gl.getUniformLocation(program, "u_noise");
  const u_light = gl.getUniformLocation(program, "u_light");
  const u_branching_enabled = gl.getUniformLocation(program, "u_branching_enabled");
  const u_branch_inhibition_enabled = gl.getUniformLocation(program, "u_branch_inhibition_enabled");
  const u_tick = gl.getUniformLocation(program, "u_tick");

  const emptyVAO = gl.createVertexArray()!;

  const texA = createTexture(gl, width, height);
  const texB = createTexture(gl, width, height);
  const tex2A = createTexture(gl, width, height);
  const tex2B = createTexture(gl, width, height);

  function createMRTFBO(tex1: WebGLTexture, tex2: WebGLTexture): WebGLFramebuffer {
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error("Failed to create foliage MRT framebuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex1, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, tex2, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
      throw new Error(`FBO incomplete: ${status}`);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  const fboA = createMRTFBO(texA, tex2A);
  const fboB = createMRTFBO(texB, tex2B);

  const textures: [WebGLTexture, WebGLTexture] = [texA, texB];
  const textures2: [WebGLTexture, WebGLTexture] = [tex2A, tex2B];
  const fbos: [WebGLFramebuffer, WebGLFramebuffer] = [fboA, fboB];
  let readIdx = 0;
  let branchingEnabled = true;
  let branchInhibitionEnabled = true;

  function setInitialState(branchTex1: Uint8Array, branchTex2?: Uint8Array): void {
    const expectedSize = width * height * 4;
    if (branchTex1.length !== expectedSize) {
      throw new Error(`Invalid initial state size: expected ${expectedSize}, got ${branchTex1.length}`);
    }
    if (branchTex2 && branchTex2.length !== expectedSize) {
      throw new Error(`Invalid branchTex2 size: expected ${expectedSize}, got ${branchTex2.length}`);
    }

    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, branchTex1);
    gl.bindTexture(gl.TEXTURE_2D, texB);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, branchTex1);

    const initialMeta = branchTex2 ?? new Uint8Array(width * height * 4);
    if (!branchTex2) {
      for (let i = 0; i < initialMeta.length; i += 4) {
        initialMeta[i + 1] = 127;
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, tex2A);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, initialMeta);
    gl.bindTexture(gl.TEXTURE_2D, tex2B);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, initialMeta);

    readIdx = 0;
  }

  function step(matterTex: WebGLTexture, noiseTex: WebGLTexture, lightTex: WebGLTexture, tick: number): void {
    const readTex = textures[readIdx];
    const readTex2 = textures2[readIdx];
    const writeIdx = 1 - readIdx;
    const writeFbo = fbos[writeIdx];

    gl.useProgram(program);
    gl.bindVertexArray(emptyVAO);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
    gl.viewport(0, 0, width, height);

    gl.uniform1i(u_matter, 0);
    gl.uniform1i(u_foliage_prev, 1);
    gl.uniform1i(u_branch_tex2_prev, 4);
    gl.uniform1i(u_noise, 2);
    gl.uniform1i(u_light, 3);
    gl.uniform1i(u_tick, tick);
    gl.uniform1i(u_branching_enabled, branchingEnabled ? 1 : 0);
    gl.uniform1i(u_branch_inhibition_enabled, branchInhibitionEnabled ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, matterTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, noiseTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, lightTex);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, readTex2);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    readIdx = writeIdx;
  }

  function currentTexture(): WebGLTexture {
    return textures[readIdx];
  }

  function currentTexture2(): WebGLTexture {
    return textures2[readIdx];
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
    gl.deleteTexture(tex2A);
    gl.deleteTexture(tex2B);
    gl.deleteVertexArray(emptyVAO);
    gl.deleteProgram(program);
  }

  return {
    step,
    get branchingEnabled() { return branchingEnabled; },
    set branchingEnabled(v: boolean) { branchingEnabled = v; },
    get branchInhibitionEnabled() { return branchInhibitionEnabled; },
    set branchInhibitionEnabled(v: boolean) { branchInhibitionEnabled = v; },
    setInitialState,
    currentTexture,
    currentTexture2,
    readPixels: readPixelsOut,
    dispose,
  };
}
