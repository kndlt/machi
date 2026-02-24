/**
 * sim-runner.ts — Headless-friendly WebGL2 simulation runner.
 *
 * Imports the SAME shaders used by the real app (via FoliageSim),
 * runs them on a small test grid, reads back pixel data, and logs
 * ASCII + stats to console.
 *
 * Usage:
 *   Browser:  open http://localhost:8588/sim.html
 *   Headless: pnpm sim:headless
 */

import { createFoliageSim } from "../simulation/FoliageSim";
import { createNoiseSim } from "../simulation/NoiseSim";
import { createTexture, createFBO, createProgram } from "../utils/gl-utils";
import simVert from "../shaders/simulation.vert";
import mapFrag from "../shaders/map.frag";

// ── Configuration ────────────────────────────────────────────────────────────
const W = 16;
const H = 16;
const DIRT_ROWS = 8;        // bottom 8 rows are dirt
const NUM_STEPS = 40;       // how many simulation steps to run

// Dirt color must match shader: (103, 82, 75, 255)
const DIRT_RGBA = [103, 82, 75, 255] as const;
const AIR_RGBA = [0, 0, 0, 0] as const;

// ── Output helper ────────────────────────────────────────────────────────────
const outputEl = document.getElementById("output");

function log(msg: string) {
  console.log(msg);
  if (outputEl) outputEl.textContent += msg + "\n";
}

// ── Snapshot storage ─────────────────────────────────────────────────────────
// Collect raw textures per step; render the grid at the end
interface Snapshot {
  foliageTex: WebGLTexture;
  noiseTex: WebGLTexture;
  /** CPU readback of foliage for ASCII rendering + convergence checking */
  foliageData: Float32Array;
}
const snapshots: Snapshot[] = [];

// ── Color mapping (for ASCII rendering only) ─────────────────────────────────
const BG_COLOR   = [30, 28, 34] as const;

// ── Grid column definitions ──────────────────────────────────────────────────
// Each column maps to a u_view_mode value in map.frag
interface GridColumn {
  label: string;
  viewMode: number;
}

const GRID_COLUMNS: GridColumn[] = [
  { label: "Visual",    viewMode: 0 },
  { label: "Energy",    viewMode: 4 },
  { label: "Nutrients", viewMode: 5 },
  { label: "Light",     viewMode: 6 },
  { label: "Alive",     viewMode: 7 },
  { label: "Noise",     viewMode: 8 },
];

// ── Bitmap pixel font (5×7, no anti-aliasing) ───────────────────────────────
const GLYPH_W = 5;
const GLYPH_H = 7;
const GLYPH_GAP = 1;

// Each glyph is 7 rows of 5-bit bitmasks (MSB = leftmost pixel)
const GLYPHS: Record<string, number[]> = {
  A: [0b01110,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001],
  B: [0b11110,0b10001,0b10001,0b11110,0b10001,0b10001,0b11110],
  C: [0b01110,0b10001,0b10000,0b10000,0b10000,0b10001,0b01110],
  D: [0b11110,0b10001,0b10001,0b10001,0b10001,0b10001,0b11110],
  E: [0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b11111],
  F: [0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b10000],
  G: [0b01110,0b10001,0b10000,0b10111,0b10001,0b10001,0b01110],
  H: [0b10001,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001],
  I: [0b01110,0b00100,0b00100,0b00100,0b00100,0b00100,0b01110],
  K: [0b10001,0b10010,0b10100,0b11000,0b10100,0b10010,0b10001],
  L: [0b10000,0b10000,0b10000,0b10000,0b10000,0b10000,0b11111],
  N: [0b10001,0b11001,0b10101,0b10011,0b10001,0b10001,0b10001],
  O: [0b01110,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110],
  R: [0b11110,0b10001,0b10001,0b11110,0b10100,0b10010,0b10001],
  S: [0b01110,0b10001,0b10000,0b01110,0b00001,0b10001,0b01110],
  T: [0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100],
  U: [0b10001,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110],
  V: [0b10001,0b10001,0b10001,0b10001,0b01010,0b01010,0b00100],
  W: [0b10001,0b10001,0b10001,0b10101,0b10101,0b11011,0b10001],
  Y: [0b10001,0b10001,0b01010,0b00100,0b00100,0b00100,0b00100],
  a: [0b00000,0b00000,0b01110,0b00001,0b01111,0b10001,0b01111],
  b: [0b10000,0b10000,0b11110,0b10001,0b10001,0b10001,0b11110],
  e: [0b00000,0b00000,0b01110,0b10001,0b11111,0b10000,0b01110],
  g: [0b00000,0b00000,0b01111,0b10001,0b01111,0b00001,0b01110],
  h: [0b10000,0b10000,0b10110,0b11001,0b10001,0b10001,0b10001],
  i: [0b00100,0b00000,0b01100,0b00100,0b00100,0b00100,0b01110],
  l: [0b01100,0b00100,0b00100,0b00100,0b00100,0b00100,0b01110],
  n: [0b00000,0b00000,0b10110,0b11001,0b10001,0b10001,0b10001],
  o: [0b00000,0b00000,0b01110,0b10001,0b10001,0b10001,0b01110],
  r: [0b00000,0b00000,0b10110,0b11001,0b10000,0b10000,0b10000],
  s: [0b00000,0b00000,0b01110,0b10000,0b01110,0b00001,0b11110],
  t: [0b00100,0b00100,0b01110,0b00100,0b00100,0b00100,0b00010],
  u: [0b00000,0b00000,0b10001,0b10001,0b10001,0b10011,0b01101],
  v: [0b00000,0b00000,0b10001,0b10001,0b10001,0b01010,0b00100],
  y: [0b00000,0b00000,0b10001,0b10001,0b01111,0b00001,0b01110],
  "0": [0b01110,0b10001,0b10011,0b10101,0b11001,0b10001,0b01110],
  "1": [0b00100,0b01100,0b00100,0b00100,0b00100,0b00100,0b01110],
  "2": [0b01110,0b10001,0b00001,0b00010,0b00100,0b01000,0b11111],
  "3": [0b01110,0b10001,0b00001,0b00110,0b00001,0b10001,0b01110],
  "4": [0b00010,0b00110,0b01010,0b10010,0b11111,0b00010,0b00010],
  "5": [0b11111,0b10000,0b11110,0b00001,0b00001,0b10001,0b01110],
  "6": [0b01110,0b10000,0b11110,0b10001,0b10001,0b10001,0b01110],
  "7": [0b11111,0b00001,0b00010,0b00100,0b01000,0b01000,0b01000],
  "8": [0b01110,0b10001,0b10001,0b01110,0b10001,0b10001,0b01110],
  "9": [0b01110,0b10001,0b10001,0b01111,0b00001,0b00001,0b01110],
  " ": [0b00000,0b00000,0b00000,0b00000,0b00000,0b00000,0b00000],
};

/** Draw a pixel-font string onto a canvas 2d context (no anti-aliasing) */
function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (!glyph) { cx += (GLYPH_W + GLYPH_GAP) * scale; continue; }
    for (let row = 0; row < GLYPH_H; row++) {
      for (let col = 0; col < GLYPH_W; col++) {
        if (glyph[row] & (1 << (GLYPH_W - 1 - col))) {
          ctx.fillRect(cx + col * scale, y + row * scale, scale, scale);
        }
      }
    }
    cx += (GLYPH_W + GLYPH_GAP) * scale;
  }
}

/** Measure pixel-font string width */
function pixelTextWidth(text: string, scale = 1): number {
  return text.length * (GLYPH_W + GLYPH_GAP) * scale - GLYPH_GAP * scale;
}

// ── Grid renderer (uses map.frag shader for all visualization) ───────────────
const CELL = 64;       // each cell is 64×64 px
const PAD = 2;         // gap between cells
const LABEL_H = 18;    // row label height
const HEADER_H = 16;   // column header height

function renderGrid(steps: Snapshot[], matterTex: WebGLTexture): string {
  const numSteps = steps.length;
  const numCols = GRID_COLUMNS.length;
  const labelH = 14;   // top row for channel headers
  const rowLabelW = 24; // left column for t0, t1, ...

  const gridW = rowLabelW + numCols * (CELL + PAD);
  const gridH = labelH + numSteps * (CELL + PAD);

  const gridCanvas = document.createElement("canvas");
  gridCanvas.width = gridW;
  gridCanvas.height = gridH;
  const ctx = gridCanvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  // Background
  ctx.fillStyle = `rgb(${BG_COLOR[0]},${BG_COLOR[1]},${BG_COLOR[2]})`;
  ctx.fillRect(0, 0, gridW, gridH);

  // Column headers (channel names) — pixel font
  for (let c = 0; c < numCols; c++) {
    const label = GRID_COLUMNS[c].label;
    const tw = pixelTextWidth(label);
    const x = rowLabelW + c * (CELL + PAD) + Math.floor((CELL - tw) / 2);
    drawPixelText(ctx, label, x, 3, "#aaa");
  }

  // ── Set up map shader for rendering cells ──────────────────────────────
  const mapProgram = createProgram(gl, simVert, mapFrag);
  const u_sky_loc = gl.getUniformLocation(mapProgram, "u_sky");
  const u_bg_loc = gl.getUniformLocation(mapProgram, "u_background");
  const u_fg_loc = gl.getUniformLocation(mapProgram, "u_foreground");
  const u_sp_loc = gl.getUniformLocation(mapProgram, "u_support");
  const u_matter_loc = gl.getUniformLocation(mapProgram, "u_matter");
  const u_foliage_loc = gl.getUniformLocation(mapProgram, "u_foliage");
  const u_noise_loc = gl.getUniformLocation(mapProgram, "u_noise");
  const u_mode_loc = gl.getUniformLocation(mapProgram, "u_view_mode");
  const u_fol_enabled_loc = gl.getUniformLocation(mapProgram, "u_foliage_enabled");
  const u_outline_loc = gl.getUniformLocation(mapProgram, "u_outline_enabled");

  // Dummy 1×1 transparent textures for unused world layers
  const emptyPixel = new Uint8Array([0, 0, 0, 0]);
  const dummyTex = createTexture(gl, 1, 1, emptyPixel);

  // Readback FBO at simulation resolution
  const readTex = createTexture(gl, W, H);
  const readFbo = createFBO(gl, readTex);

  const emptyVAO = gl.createVertexArray()!;

  // 1:1 scratch canvas for pixel data
  const tmp = document.createElement("canvas");
  tmp.width = W;
  tmp.height = H;
  const tmpCtx = tmp.getContext("2d")!;

  // Rows = timesteps, Columns = view modes
  for (let row = 0; row < numSteps; row++) {
    const snap = steps[row];
    const y0 = labelH + row * (CELL + PAD);

    // Row label (t0, t1, ...) — pixel font, right-aligned
    const label = `t${row}`;
    const tw = pixelTextWidth(label);
    drawPixelText(ctx, label, rowLabelW - 4 - tw, y0 + Math.floor((CELL - GLYPH_H) / 2), "#888");

    for (let col = 0; col < numCols; col++) {
      const { viewMode } = GRID_COLUMNS[col];
      const x0 = rowLabelW + col * (CELL + PAD);

      // Render to FBO using map.frag with the given view mode
      gl.bindFramebuffer(gl.FRAMEBUFFER, readFbo);
      gl.viewport(0, 0, W, H);
      gl.clearColor(BG_COLOR[0] / 255, BG_COLOR[1] / 255, BG_COLOR[2] / 255, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(mapProgram);
      gl.bindVertexArray(emptyVAO);
      gl.disable(gl.BLEND);

      gl.uniform1i(u_mode_loc, viewMode);
      gl.uniform1i(u_fol_enabled_loc, 1);
      gl.uniform1i(u_outline_loc, 0);

      // Bind textures: dummy for unused world layers, real for simulation data
      gl.uniform1i(u_sky_loc, 0);
      gl.uniform1i(u_bg_loc, 1);
      gl.uniform1i(u_fg_loc, 2);
      gl.uniform1i(u_sp_loc, 3);
      gl.uniform1i(u_matter_loc, 4);
      gl.uniform1i(u_foliage_loc, 5);
      gl.uniform1i(u_noise_loc, 6);

      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dummyTex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, dummyTex);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, dummyTex);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, dummyTex);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, matterTex);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, snap.foliageTex);
      gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, snap.noiseTex);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Read back rendered pixels
      const buf = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);

      // Copy to Canvas2D ImageData (flip Y since GL reads bottom-up)
      const imgData = tmpCtx.createImageData(W, H);
      for (let py = 0; py < H; py++) {
        const srcRow = (H - 1 - py) * W * 4;
        const dstRow = py * W * 4;
        for (let px = 0; px < W * 4; px++) {
          imgData.data[dstRow + px] = buf[srcRow + px];
        }
      }

      // Draw 1:1 then scale into grid cell
      tmpCtx.putImageData(imgData, 0, 0);
      ctx.drawImage(tmp, x0, y0, CELL, CELL);
    }
  }

  // Cleanup rendering resources
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(readFbo);
  gl.deleteTexture(readTex);
  gl.deleteTexture(dummyTex);
  gl.deleteVertexArray(emptyVAO);
  gl.deleteProgram(mapProgram);

  return gridCanvas.toDataURL("image/png");
}

// ── WebGL2 setup ─────────────────────────────────────────────────────────────
const canvas = document.getElementById("sim-canvas") as HTMLCanvasElement;
canvas.width = W;
canvas.height = H;

const glOrNull = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
if (!glOrNull) {
  log("ERROR: WebGL2 not available");
  throw new Error("WebGL2 not available");
}
const gl: WebGL2RenderingContext = glOrNull;

// ── Create matter texture ────────────────────────────────────────────────────
function createMatterTexture(): WebGLTexture {
  const pixels = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const isDirt = y >= (H - DIRT_ROWS);
      const rgba = isDirt ? DIRT_RGBA : AIR_RGBA;
      pixels[idx + 0] = rgba[0];
      pixels[idx + 1] = rgba[1];
      pixels[idx + 2] = rgba[2];
      pixels[idx + 3] = rgba[3];
    }
  }
  return createTexture(gl, W, H, pixels);
}

// ── Read back pixels ─────────────────────────────────────────────────────────
interface PixelGrid {
  /** RGBA float values per pixel (energy, nutrients, light, alive) */
  data: Float32Array;
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

/** Copy a GPU texture to a new texture (for snapshotting ping-pong buffers) */
function copyTexture(src: WebGLTexture, w: number, h: number): WebGLTexture {
  const dst = createTexture(gl, w, h);
  const fbo = createFBO(gl, src);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.bindTexture(gl.TEXTURE_2D, dst);
  gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  return dst;
}

function run() {
  log(`Simulation Lab — ${W}×${H} grid, ${DIRT_ROWS} dirt rows`);
  log(`Running ${NUM_STEPS} steps...\n`);

  const matterTex = createMatterTexture();
  const sim = createFoliageSim(gl, W, H);
  const noise = createNoiseSim(gl, W, H);

  let prevAliveCount = -1;
  let convergedAt = -1;

  for (let step = 0; step < NUM_STEPS; step++) {
    noise.step(step);
    sim.step(matterTex, noise.currentTexture());

    // Read back result for ASCII rendering + convergence
    const data = sim.readPixels();
    const pixels: PixelGrid = { data };

    // Count alive
    let aliveCount = 0;
    for (let i = 0; i < W * H; i++) {
      if (data[i * 4 + 3] > 0.05) aliveCount++;
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

    // Snapshot GPU textures for grid rendering (copy because ping-pong swaps)
    snapshots.push({
      foliageTex: copyTexture(sim.currentTexture(), W, H),
      noiseTex: copyTexture(noise.currentTexture(), W, H),
      foliageData: new Float32Array(data),
    });

    prevAliveCount = aliveCount;

    // Stop early if converged for 3 consecutive steps
    if (convergedAt >= 0 && step - convergedAt >= 3) {
      log(`\n✓ Converged at step ${convergedAt} (alive=${aliveCount})`);
      break;
    }
  }

  // Render the composite grid image (needs matterTex still alive)
  const gridDataUrl = renderGrid(snapshots, matterTex);
  (window as unknown as Record<string, unknown>).__SIM_GRID__ = gridDataUrl;

  // Cleanup
  for (const snap of snapshots) {
    gl.deleteTexture(snap.foliageTex);
    gl.deleteTexture(snap.noiseTex);
  }
  gl.deleteTexture(matterTex);
  sim.dispose();
  noise.dispose();

  log(`\n═══ Done — ${snapshots.length} steps captured ═══`);

  // Signal to headless runner that we're done
  (window as unknown as Record<string, boolean>).__SIM_DONE__ = true;
}

// Run immediately
run();
