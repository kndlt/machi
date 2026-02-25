/**
 * FoliageSim.ts — Core foliage simulation with ping-pong double buffering.
 *
 * Encapsulates the shader program, two foliage textures, and two FBOs.
 * Both SimulationRenderer (app) and sim-runner (lab) use this.
 */

import simVert from "../shaders/simulation.vert";
import simFrag from "../shaders/simulation.frag";
import { createTexture, createFBO, createProgram } from "../utils/gl-utils";

export interface FoliageSim {
  /** Run one simulation step. Swaps ping-pong buffers internally. */
  step(matterTex: WebGLTexture, noiseTex: WebGLTexture, lightTex: WebGLTexture): void;

  /** Upload an explicit initial branch-state texture into both ping-pong buffers. */
  setInitialState(data: Uint8Array): void;

  /** The foliage texture that holds the latest result (read source). */
  currentTexture(): WebGLTexture;

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
  const u_noise = gl.getUniformLocation(program, "u_noise");
  const u_light = gl.getUniformLocation(program, "u_light");

  const emptyVAO = gl.createVertexArray()!;

  const texA = createTexture(gl, width, height);
  const texB = createTexture(gl, width, height);
  const fboA = createFBO(gl, texA);
  const fboB = createFBO(gl, texB);

  const textures: [WebGLTexture, WebGLTexture] = [texA, texB];
  const fbos: [WebGLFramebuffer, WebGLFramebuffer] = [fboA, fboB];
  let readIdx = 0;

  function setInitialState(data: Uint8Array): void {
    const expectedSize = width * height * 4;
    if (data.length !== expectedSize) {
      throw new Error(`Invalid initial state size: expected ${expectedSize}, got ${data.length}`);
    }

    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindTexture(gl.TEXTURE_2D, texB);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    readIdx = 0;
  }

  function step(matterTex: WebGLTexture, noiseTex: WebGLTexture, lightTex: WebGLTexture): void {
    const readTex = textures[readIdx];
    const writeIdx = 1 - readIdx;
    const writeFbo = fbos[writeIdx];

    gl.useProgram(program);
    gl.bindVertexArray(emptyVAO);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
    gl.viewport(0, 0, width, height);

    gl.uniform1i(u_matter, 0);
    gl.uniform1i(u_foliage_prev, 1);
    gl.uniform1i(u_noise, 2);
    gl.uniform1i(u_light, 3);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, matterTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, noiseTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, lightTex);

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

  return {
    step,
    setInitialState,
    currentTexture,
    readPixels: readPixelsOut,
    dispose,
  };
}
