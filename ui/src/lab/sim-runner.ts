/**
 * sim-runner.ts — Headless-friendly WebGL2 simulation runner.
 *
 * Imports the SAME shaders used by the real app, runs them on a small
 * test grid, reads back pixel data, and logs ASCII + stats to console.
 *
 * Usage:
 *   Browser:  open http://localhost:8588/sim-lab.html
 *   Headless: pnpm sim:headless
 */

import {
  SIM_VERTEX,
  SIM_FOLIAGE_FRAGMENT,
  createProgram,
} from "../renderer/shaders";

// ── Configuration ────────────────────────────────────────────────────────────
const W = 16;
const H = 16;
const DIRT_ROWS = 8;        // bottom 8 rows are dirt
const NUM_STEPS = 40;       // how many simulation steps to run
const SEED = 0.42;          // fixed seed for reproducibility

// Dirt color must match shader: (103, 82, 75, 255)
const DIRT_RGBA = [103, 82, 75, 255] as const;
const AIR_RGBA = [0, 0, 0, 0] as const;

// ── Output helper ────────────────────────────────────────────────────────────
const outputEl = document.getElementById("output");

function log(msg: string) {
  console.log(msg);
  if (outputEl) outputEl.textContent += msg + "\n";
}

// ── Visualization canvas (scaled-up color render) ────────────────────────────
const SCALE = 16;  // 16x16 grid → 256x256 image
const vizCanvas = document.getElementById("viz-canvas") as HTMLCanvasElement;
vizCanvas.width = W * SCALE;
vizCanvas.height = H * SCALE;
const vizCtx = vizCanvas.getContext("2d")!;
vizCtx.imageSmoothingEnabled = false;

// Global array of { step, dataUrl } for Playwright to collect
const frameStore: Array<{ step: number; dataUrl: string }> = [];
(window as unknown as Record<string, unknown>).__SIM_FRAMES__ = frameStore;

// ── Color mapping ────────────────────────────────────────────────────────────
const DIRT_COLOR = [103, 82, 75] as const;
const AIR_COLOR = [20, 18, 22] as const;

/** Map foliage energy to a green→yellow→brown gradient */
function foliageColor(energy: number): [number, number, number] {
  // Lush green (high energy) → yellow-brown (low energy)
  const t = Math.max(0, Math.min(1, energy));
  const r = Math.round(30 + (1 - t) * 120);   // 30 (green) → 150 (brown)
  const g = Math.round(140 + t * 80);          // 140 (weak) → 220 (lush)
  const b = Math.round(20 + (1 - t) * 20);     // 20 → 40
  return [r, g, b];
}

/** Render a color visualization of foliage + matter to the viz canvas */
function renderVizFrame(foliage: PixelGrid, step: number): string {
  const imgData = vizCtx.createImageData(W, H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const energy = foliage.data[idx + 0];
      const alive = foliage.data[idx + 3];
      const isDirt = y >= (H - DIRT_ROWS);

      let r: number, g: number, b: number;
      if (isDirt) {
        [r, g, b] = DIRT_COLOR;
      } else if (alive > 0.05) {
        [r, g, b] = foliageColor(energy);
      } else {
        [r, g, b] = AIR_COLOR;
      }

      imgData.data[idx + 0] = r;
      imgData.data[idx + 1] = g;
      imgData.data[idx + 2] = b;
      imgData.data[idx + 3] = 255;
    }
  }

  // Draw at 1:1 then scale up with nearest-neighbor
  const tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = W;
  tmpCanvas.height = H;
  const tmpCtx = tmpCanvas.getContext("2d")!;
  tmpCtx.putImageData(imgData, 0, 0);

  vizCtx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
  vizCtx.drawImage(tmpCanvas, 0, 0, W * SCALE, H * SCALE);

  // Add step label
  vizCtx.fillStyle = "#fff";
  vizCtx.font = "bold 14px monospace";
  vizCtx.fillText(`Step ${step}`, 4, 16);

  return vizCanvas.toDataURL("image/png");
}

// ── WebGL2 setup ─────────────────────────────────────────────────────────────
const canvas = document.getElementById("sim-canvas") as HTMLCanvasElement;
canvas.width = W;
canvas.height = H;

const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
if (!gl) {
  log("ERROR: WebGL2 not available");
  throw new Error("WebGL2 not available");
}

// ── Create matter texture ────────────────────────────────────────────────────
function createMatterTexture(): WebGLTexture {
  const pixels = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      // In texture space: Y=0 is top row. Dirt in bottom DIRT_ROWS rows.
      const isDirt = y >= (H - DIRT_ROWS);
      const rgba = isDirt ? DIRT_RGBA : AIR_RGBA;
      pixels[idx + 0] = rgba[0];
      pixels[idx + 1] = rgba[1];
      pixels[idx + 2] = rgba[2];
      pixels[idx + 3] = rgba[3];
    }
  }

  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// ── Create empty foliage texture ─────────────────────────────────────────────
function createFoliageTexture(): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function createFBO(tex: WebGLTexture): WebGLFramebuffer {
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`FBO incomplete: ${status}`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}

// ── Read back pixels ─────────────────────────────────────────────────────────
interface PixelGrid {
  /** RGBA float values per pixel (energy, nutrients, light, alive) */
  data: Float32Array;
}

function readPixels(fbo: WebGLFramebuffer): PixelGrid {
  const buf = new Uint8Array(W * H * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // Convert to float (0–1)
  const data = new Float32Array(W * H * 4);
  for (let i = 0; i < buf.length; i++) {
    data[i] = buf[i] / 255;
  }
  return { data };
}

// ── ASCII rendering ──────────────────────────────────────────────────────────
function renderASCII(foliage: PixelGrid, step: number): string {
  const lines: string[] = [];
  lines.push(`\n═══ Step ${step} ${"═".repeat(40)}`);

  let aliveCount = 0;
  let totalEnergy = 0;
  let totalNutrients = 0;
  let totalLight = 0;

  // Render grid (Y=0 is top in texture space)
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const energy = foliage.data[idx + 0];
      const nutrients = foliage.data[idx + 1];
      const light = foliage.data[idx + 2];
      const alive = foliage.data[idx + 3];

      const isDirt = y >= (H - DIRT_ROWS);

      if (isDirt) {
        row += "█";
      } else if (alive > 0.05) {
        // Foliage — show energy level as digit 1-9
        const level = Math.max(1, Math.min(9, Math.ceil(energy * 9)));
        row += level.toString();
        aliveCount++;
        totalEnergy += energy;
        totalNutrients += nutrients;
        totalLight += light;
      } else {
        row += "·";
      }
    }
    lines.push(row);
  }

  // Stats
  const avgE = aliveCount > 0 ? (totalEnergy / aliveCount).toFixed(3) : "—";
  const avgN = aliveCount > 0 ? (totalNutrients / aliveCount).toFixed(3) : "—";
  const avgL = aliveCount > 0 ? (totalLight / aliveCount).toFixed(3) : "—";
  lines.push(
    `Alive: ${aliveCount}/${W * (H - DIRT_ROWS)} | ` +
    `Energy: ${avgE} | Nutrients: ${avgN} | Light: ${avgL}`
  );

  return lines.join("\n");
}

// ── RUN SIMULATION ───────────────────────────────────────────────────────────
function run() {
  log(`Simulation Lab — ${W}×${H} grid, ${DIRT_ROWS} dirt rows, seed=${SEED}`);
  log(`Running ${NUM_STEPS} steps...\n`);

  // Compile simulation program (uses the REAL shaders from shaders.ts)
  const program = createProgram(gl, SIM_VERTEX, SIM_FOLIAGE_FRAGMENT);
  const u_matter = gl.getUniformLocation(program, "u_matter");
  const u_foliage_prev = gl.getUniformLocation(program, "u_foliage_prev");
  const u_seed = gl.getUniformLocation(program, "u_seed");

  const emptyVAO = gl.createVertexArray()!;

  // Create textures
  const matterTex = createMatterTexture();
  const folA = createFoliageTexture();
  const folB = createFoliageTexture();
  const fboA = createFBO(folA);
  const fboB = createFBO(folB);

  let readIdx = 0;
  const textures = [folA, folB];
  const fbos = [fboA, fboB];

  let prevAliveCount = -1;
  let convergedAt = -1;

  for (let step = 0; step < NUM_STEPS; step++) {
    const readTex = textures[readIdx];
    const writeIdx = 1 - readIdx;
    const writeFbo = fbos[writeIdx];

    // Run simulation shader
    gl.useProgram(program);
    gl.bindVertexArray(emptyVAO);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
    gl.viewport(0, 0, W, H);

    gl.uniform1i(u_matter, 0);
    gl.uniform1i(u_foliage_prev, 1);
    // Vary seed per step so RNG produces different values each tick
    gl.uniform1f(u_seed, SEED);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, matterTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readTex);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Read back result
    const pixels = readPixels(writeFbo);

    // Count alive
    let aliveCount = 0;
    for (let i = 0; i < W * H; i++) {
      if (pixels.data[i * 4 + 3] > 0.05) aliveCount++;
    }

    // Check convergence
    if (aliveCount === prevAliveCount && convergedAt < 0) {
      convergedAt = step;
    } else if (aliveCount !== prevAliveCount) {
      convergedAt = -1;
    }

    // Log every step for the first 10, then every 5th
    if (step < 10 || step % 5 === 0 || step === NUM_STEPS - 1) {
      log(renderASCII(pixels, step));
    }

    // Save color frame for every step
    const dataUrl = renderVizFrame(pixels, step);
    frameStore.push({ step, dataUrl });

    prevAliveCount = aliveCount;
    readIdx = writeIdx;

    // Stop early if converged for 3 consecutive steps
    if (convergedAt >= 0 && step - convergedAt >= 3) {
      log(`\n✓ Converged at step ${convergedAt} (alive=${aliveCount})`);
      break;
    }
  }

  // Cleanup
  gl.deleteTexture(matterTex);
  gl.deleteTexture(folA);
  gl.deleteTexture(folB);
  gl.deleteFramebuffer(fboA);
  gl.deleteFramebuffer(fboB);
  gl.deleteVertexArray(emptyVAO);
  gl.deleteProgram(program);

  log("\n═══ Done ═══");

  // Signal to headless runner that we're done
  (window as unknown as Record<string, boolean>).__SIM_DONE__ = true;
}

// Run immediately
run();
