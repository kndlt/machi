import simVert from "../shaders/simulation.vert";
import lightTransportFrag from "../shaders/light-transport.frag";
import { createTexture, createFBO, createProgram } from "../utils/gl-utils";
import type { FoliageTuningConfig } from "./FoliageTuningConfig";

interface DirectionalSeed {
  up: number;
  upRight: number;
  right: number;
  downRight: number;
  down: number;
  downLeft: number;
  left: number;
  upLeft: number;
}

// Single source of truth for initial field + boundary air replenishment.
// Values are nibble intensities in [0..15].
const LIGHT_DIRECTION_SEED: DirectionalSeed = {
  up: 0,
  upRight: 0,
  right: 0,
  downRight: 8, // 0.25
  down: 16, // 0.5
  downLeft: 8, // 0.25
  left: 0,
  upLeft: 0,
};

function clampNibble(value: number): number {
  return Math.max(0, Math.min(15, value | 0));
}

function packDirectionalSeed(seed: DirectionalSeed): Uint8Array {
  const n0 = clampNibble(seed.up);
  const n1 = clampNibble(seed.upRight);
  const n2 = clampNibble(seed.right);
  const n3 = clampNibble(seed.downRight);
  const n4 = clampNibble(seed.down);
  const n5 = clampNibble(seed.downLeft);
  const n6 = clampNibble(seed.left);
  const n7 = clampNibble(seed.upLeft);

  return new Uint8Array([
    (n0 & 15) | ((n1 & 15) << 4),
    (n2 & 15) | ((n3 & 15) << 4),
    (n4 & 15) | ((n5 & 15) << 4),
    (n6 & 15) | ((n7 & 15) << 4),
  ]);
}

export interface LightTransportSim {
  /** Run one light transport step. Swaps ping-pong buffers internally. */
  step(matterTex: WebGLTexture, foliageTex: WebGLTexture, branchTex2: WebGLTexture): void;

  /** Latest directional light texture. */
  currentTexture(): WebGLTexture;

  dispose(): void;
}

export function createLightTransportSim(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  tuningConfig: FoliageTuningConfig,
): LightTransportSim {
  const program = createProgram(gl, simVert, lightTransportFrag);
  const u_matter = gl.getUniformLocation(program, "u_matter");
  const u_light_prev = gl.getUniformLocation(program, "u_light_prev");
  const u_foliage = gl.getUniformLocation(program, "u_foliage");
  const u_branch_tex2 = gl.getUniformLocation(program, "u_branch_tex2");
  const u_light_branch_absorb = gl.getUniformLocation(program, "u_light_branch_absorb");
  const u_boundary_seed = gl.getUniformLocation(program, "u_boundary_seed");

  const emptyVAO = gl.createVertexArray()!;

  const seedBytes = packDirectionalSeed(LIGHT_DIRECTION_SEED);
  const seedVec4 = [
    seedBytes[0] / 255,
    seedBytes[1] / 255,
    seedBytes[2] / 255,
    seedBytes[3] / 255,
  ] as const;

  const initialLight = new Uint8Array(width * height * 4);
  for (let i = 0; i < initialLight.length; i += 4) {
    initialLight[i + 0] = seedBytes[0];
    initialLight[i + 1] = seedBytes[1];
    initialLight[i + 2] = seedBytes[2];
    initialLight[i + 3] = seedBytes[3];
  }

  const texA = createTexture(gl, width, height, initialLight);
  const texB = createTexture(gl, width, height, initialLight);
  const fboA = createFBO(gl, texA);
  const fboB = createFBO(gl, texB);

  const textures: [WebGLTexture, WebGLTexture] = [texA, texB];
  const fbos: [WebGLFramebuffer, WebGLFramebuffer] = [fboA, fboB];
  let readIdx = 0;

  function step(matterTex: WebGLTexture, foliageTex: WebGLTexture, branchTex2: WebGLTexture): void {
    const readTex = textures[readIdx];
    const writeIdx = 1 - readIdx;
    const writeFbo = fbos[writeIdx];

    gl.useProgram(program);
    gl.bindVertexArray(emptyVAO);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
    gl.viewport(0, 0, width, height);

    gl.uniform1i(u_matter, 0);
    gl.uniform1i(u_light_prev, 1);
    gl.uniform1i(u_foliage, 2);
    gl.uniform1i(u_branch_tex2, 3);
    gl.uniform1f(u_light_branch_absorb, tuningConfig.lightBranchAbsorb);
    gl.uniform4f(u_boundary_seed, seedVec4[0], seedVec4[1], seedVec4[2], seedVec4[3]);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, matterTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, foliageTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, branchTex2);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    readIdx = writeIdx;
  }

  function currentTexture(): WebGLTexture {
    return textures[readIdx];
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
    currentTexture,
    dispose,
  };
}
