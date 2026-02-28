/**
 * FoliageSim.ts — Core foliage simulation with ping-pong double buffering.
 *
 * Encapsulates the shader program, two ping-pong texture pairs (branchTex1 + branchTex2), and two FBOs.
 * Both SimulationRenderer (app) and sim-runner (lab) use this.
 */

import simVert from "../shaders/simulation.vert";
import simFrag from "../shaders/simulation.frag";
import { createIntegerTexture, createProgram } from "../utils/gl-utils";
import {
  DEFAULT_FOLIAGE_TUNING_CONFIG,
  type FoliageTuningConfig,
} from "./FoliageTuningConfig";

export type { FoliageTuningConfig } from "./FoliageTuningConfig";

export interface FoliageUniformConfig {
  matterUnit: number;
  foliagePrevUnit: number;
  branchTex2PrevUnit: number;
  noiseUnit: number;
  lightUnit: number;
  tick: number;
  branchingEnabled: boolean;
  branchInhibitionEnabled: boolean;
  mainTurnEnabled: boolean;
  tuning: FoliageTuningConfig;
}

export interface FoliageSim {
  /** Run one simulation step. Swaps ping-pong buffers internally. */
  step(matterTex: WebGLTexture, noiseTex: WebGLTexture, lightTex: WebGLTexture, tick: number): void;

  /** Toggle side-branch generation. */
  branchingEnabled: boolean;

  /** Toggle inhibition field update + inhibition effect on side branching. */
  branchInhibitionEnabled: boolean;

  /** Toggle main-path turn/swerve behavior. */
  mainTurnEnabled: boolean;

  /** Upload explicit initial branch-state textures into both ping-pong buffers. */
  setInitialState(branchTex1: Uint8Array, branchTex2?: Uint8Array): void;

  /** The foliage texture that holds the latest result (read source). */
  currentTexture(): WebGLTexture;

  /** The branchTex2 metadata texture that holds the latest result (read source). */
  currentTexture2(): WebGLTexture;

  /** Read back the current foliage FBO as raw bytes (0–255). */
  readPixels(): Uint8Array;

  /** Clean up all GPU resources. */
  dispose(): void;
}

export function createFoliageSim(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  tuningConfig: FoliageTuningConfig = { ...DEFAULT_FOLIAGE_TUNING_CONFIG },
): FoliageSim {
  const TEXTURE_UNITS = {
    matter: 0,
    foliagePrev: 1,
    noise: 2,
    light: 3,
    branchTex2Prev: 4,
  } as const;

  const program = createProgram(gl, simVert, simFrag);
  const u_matter = gl.getUniformLocation(program, "u_matter");
  const u_foliage_prev = gl.getUniformLocation(program, "u_foliage_prev");
  const u_branch_tex2_prev = gl.getUniformLocation(program, "u_branch_tex2_prev");
  const u_noise = gl.getUniformLocation(program, "u_noise");
  const u_light = gl.getUniformLocation(program, "u_light");
  const u_branching_enabled = gl.getUniformLocation(program, "u_branching_enabled");
  const u_branch_inhibition_enabled = gl.getUniformLocation(program, "u_branch_inhibition_enabled");
  const u_main_turn_enabled = gl.getUniformLocation(program, "u_main_turn_enabled");
  const u_tick = gl.getUniformLocation(program, "u_tick");
  const u_branch_side_rate = gl.getUniformLocation(program, "u_branch_side_rate");
  const u_branch_side_angle_min = gl.getUniformLocation(program, "u_branch_side_angle_min");
  const u_branch_side_angle_max = gl.getUniformLocation(program, "u_branch_side_angle_max");
  const u_main_turn_rate = gl.getUniformLocation(program, "u_main_turn_rate");
  const u_main_turn_rate_blocked = gl.getUniformLocation(program, "u_main_turn_rate_blocked");
  const u_main_turn_max = gl.getUniformLocation(program, "u_main_turn_max");
  const u_root_side_rate = gl.getUniformLocation(program, "u_root_side_rate");
  const u_root_side_angle_min = gl.getUniformLocation(program, "u_root_side_angle_min");
  const u_root_side_angle_max = gl.getUniformLocation(program, "u_root_side_angle_max");
  const u_root_turn_rate = gl.getUniformLocation(program, "u_root_turn_rate");
  const u_root_turn_rate_blocked = gl.getUniformLocation(program, "u_root_turn_rate_blocked");
  const u_root_turn_max = gl.getUniformLocation(program, "u_root_turn_max");
  const u_forward_cone_cos = gl.getUniformLocation(program, "u_forward_cone_cos");
  const u_branch_inhibition_decay = gl.getUniformLocation(program, "u_branch_inhibition_decay");
  const u_root_inhibition_decay = gl.getUniformLocation(program, "u_root_inhibition_decay");
  const u_root_creation_cost = gl.getUniformLocation(program, "u_root_creation_cost");
  const u_branch_creation_cost = gl.getUniformLocation(program, "u_branch_creation_cost");
  const u_resource_canopy_transfer_fraction = gl.getUniformLocation(program, "u_resource_canopy_transfer_fraction");
  const u_resource_anti_canopy_transfer_fraction = gl.getUniformLocation(program, "u_resource_anti_canopy_transfer_fraction");
  const u_dirt_diffusion_fraction = gl.getUniformLocation(program, "u_dirt_diffusion_fraction");
  const u_root_sap_threshold = gl.getUniformLocation(program, "u_root_sap_threshold");
  const u_root_sap_amount = gl.getUniformLocation(program, "u_root_sap_amount");

  const emptyVAO = gl.createVertexArray()!;

  const texA = createIntegerTexture(gl, width, height);
  const texB = createIntegerTexture(gl, width, height);
  const tex2A = createIntegerTexture(gl, width, height);
  const tex2B = createIntegerTexture(gl, width, height);

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
  let mainTurnEnabled = true;

  function buildUniformConfig(tick: number): FoliageUniformConfig {
    return {
      matterUnit: TEXTURE_UNITS.matter,
      foliagePrevUnit: TEXTURE_UNITS.foliagePrev,
      branchTex2PrevUnit: TEXTURE_UNITS.branchTex2Prev,
      noiseUnit: TEXTURE_UNITS.noise,
      lightUnit: TEXTURE_UNITS.light,
      tick,
      branchingEnabled,
      branchInhibitionEnabled,
      mainTurnEnabled,
      tuning: tuningConfig,
    };
  }

  function applyUniformConfig(config: FoliageUniformConfig): void {
    gl.uniform1i(u_matter, config.matterUnit);
    gl.uniform1i(u_foliage_prev, config.foliagePrevUnit);
    gl.uniform1i(u_branch_tex2_prev, config.branchTex2PrevUnit);
    gl.uniform1i(u_noise, config.noiseUnit);
    gl.uniform1i(u_light, config.lightUnit);
    gl.uniform1i(u_tick, config.tick);
    gl.uniform1i(u_branching_enabled, config.branchingEnabled ? 1 : 0);
    gl.uniform1i(u_branch_inhibition_enabled, config.branchInhibitionEnabled ? 1 : 0);
    gl.uniform1i(u_main_turn_enabled, config.mainTurnEnabled ? 1 : 0);

    gl.uniform1f(u_branch_side_rate, config.tuning.branchSideRate);
    gl.uniform1f(u_branch_side_angle_min, config.tuning.branchSideAngleMin);
    gl.uniform1f(u_branch_side_angle_max, config.tuning.branchSideAngleMax);
    gl.uniform1f(u_main_turn_rate, config.tuning.mainTurnRate);
    gl.uniform1f(u_main_turn_rate_blocked, config.tuning.mainTurnRateBlocked);
    gl.uniform1f(u_main_turn_max, config.tuning.mainTurnMax);
    gl.uniform1f(u_root_side_rate, config.tuning.rootSideRate);
    gl.uniform1f(u_root_side_angle_min, config.tuning.rootSideAngleMin);
    gl.uniform1f(u_root_side_angle_max, config.tuning.rootSideAngleMax);
    gl.uniform1f(u_root_turn_rate, config.tuning.rootTurnRate);
    gl.uniform1f(u_root_turn_rate_blocked, config.tuning.rootTurnRateBlocked);
    gl.uniform1f(u_root_turn_max, config.tuning.rootTurnMax);
    gl.uniform1f(u_forward_cone_cos, config.tuning.forwardConeCos);
    gl.uniform1f(u_branch_inhibition_decay, config.tuning.branchInhibitionDecay);
    gl.uniform1f(u_root_inhibition_decay, config.tuning.rootInhibitionDecay);
    gl.uniform1f(u_root_creation_cost, config.tuning.rootCreationCost);
    gl.uniform1f(u_branch_creation_cost, config.tuning.branchCreationCost);
    gl.uniform1f(u_resource_canopy_transfer_fraction, config.tuning.resourceCanopyTransferFraction);
    gl.uniform1f(u_resource_anti_canopy_transfer_fraction, config.tuning.resourceAntiCanopyTransferFraction);
    gl.uniform1f(u_dirt_diffusion_fraction, config.tuning.dirtDiffusionFraction);
    gl.uniform1f(u_root_sap_threshold, config.tuning.rootSapThreshold);
    gl.uniform1f(u_root_sap_amount, config.tuning.rootSapAmount);
  }

  function setInitialState(branchTex1: Uint8Array, branchTex2?: Uint8Array): void {
    const expectedSize = width * height * 4;
    if (branchTex1.length !== expectedSize) {
      throw new Error(`Invalid initial state size: expected ${expectedSize}, got ${branchTex1.length}`);
    }
    if (branchTex2 && branchTex2.length !== expectedSize) {
      throw new Error(`Invalid branchTex2 size: expected ${expectedSize}, got ${branchTex2.length}`);
    }

    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, branchTex1);
    gl.bindTexture(gl.TEXTURE_2D, texB);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, branchTex1);

    const initialMeta = branchTex2 ?? new Uint8Array(width * height * 4);
    if (!branchTex2) {
      for (let i = 0; i < initialMeta.length; i += 4) {
        initialMeta[i + 1] = 127;
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, tex2A);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, initialMeta);
    gl.bindTexture(gl.TEXTURE_2D, tex2B);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, initialMeta);

    readIdx = 0;
  }

  function step(matterTex: WebGLTexture, noiseTex: WebGLTexture, lightTex: WebGLTexture, tick: number): void {
    const readTex = textures[readIdx];
    const readTex2 = textures2[readIdx];
    const writeIdx = 1 - readIdx;
    const writeFbo = fbos[writeIdx];
    const config = buildUniformConfig(tick);

    gl.useProgram(program);
    gl.bindVertexArray(emptyVAO);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
    gl.viewport(0, 0, width, height);

    applyUniformConfig(config);

    gl.activeTexture(gl.TEXTURE0 + config.matterUnit);
    gl.bindTexture(gl.TEXTURE_2D, matterTex);
    gl.activeTexture(gl.TEXTURE0 + config.foliagePrevUnit);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.activeTexture(gl.TEXTURE0 + config.noiseUnit);
    gl.bindTexture(gl.TEXTURE_2D, noiseTex);
    gl.activeTexture(gl.TEXTURE0 + config.lightUnit);
    gl.bindTexture(gl.TEXTURE_2D, lightTex);
    gl.activeTexture(gl.TEXTURE0 + config.branchTex2PrevUnit);
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

  function readPixelsOut(): Uint8Array {
    const readFbo = fbos[readIdx];
    const buf = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, readFbo);
    gl.readPixels(0, 0, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return buf;
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
    get mainTurnEnabled() { return mainTurnEnabled; },
    set mainTurnEnabled(v: boolean) { mainTurnEnabled = v; },
    setInitialState,
    currentTexture,
    currentTexture2,
    readPixels: readPixelsOut,
    dispose,
  };
}
