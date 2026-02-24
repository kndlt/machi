/**
 * sim-runner.ts — Headless-friendly WebGL2 simulation runner.
 *
 * Uses the SAME APIs as App.tsx (createMapRenderer, createSimulationRenderer,
 * createCamera) to run a synthetic world, read back pixel data, and produce
 * ASCII + grid-image diagnostics.
 *
 * Usage:
 *   Browser:  open http://localhost:8588/sim.html
 *   Headless: pnpm sim:headless
 */

import { createMapRenderer } from "../renderer/MapRenderer";
import { createCamera } from "../renderer/Camera";
import { createSimulationRenderer } from "../simulation/SimulationRenderer";
import { createTexture, createFBO } from "../utils/gl-utils";
import { createSyntheticWorld, DEFAULT_SIM_WORLD } from "./sim-world";
import { drawPixelText, pixelTextWidth, GLYPH_H } from "../utils/gl-text-utils";

// ── Configuration ────────────────────────────────────────────────────────────
const { width: W, height: H, dirtRows: DIRT_ROWS } = DEFAULT_SIM_WORLD;
const NUM_STEPS = 40;       // how many simulation steps to run

// Read seed from URL query param: ?seed=42
const urlSeed = new URLSearchParams(window.location.search).get("seed");
const SEED: number | undefined = urlSeed != null ? Number(urlSeed) : undefined;

// ── Output helper ────────────────────────────────────────────────────────────
const outputEl = document.getElementById("output");

function log(msg: string) {
  console.log(msg);
  if (outputEl) outputEl.textContent += msg + "\n";
}

// ── Snapshot storage ─────────────────────────────────────────────────────────
interface Snapshot {
  /** CPU readback of foliage for ASCII rendering + convergence checking */
  foliageData: Float32Array;
}
const snapshots: Snapshot[] = [];

// ── Color mapping ────────────────────────────────────────────────────────────
const BG_COLOR = [30, 28, 34] as const;

// ── Grid column definitions ──────────────────────────────────────────────────
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

// ── Grid renderer (uses MapRenderer for all visualization) ───────────────────
const CELL = 64;       // each cell is 64×64 px
const PAD = 2;         // gap between cells

/**
 * Render a diagnostic grid image.
 * Each row = one simulation step, each column = a view mode.
 * Uses the real MapRenderer (same shader as App.tsx) to render each cell.
 */
function renderGrid(
  gl: WebGL2RenderingContext,
  steps: Snapshot[],
  stepSimFn: () => void,
): string {
  const numSteps = steps.length;
  const numCols = GRID_COLUMNS.length;
  const labelH = 14;
  const rowLabelW = 24;

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

  // Column headers
  for (let c = 0; c < numCols; c++) {
    const label = GRID_COLUMNS[c].label;
    const tw = pixelTextWidth(label);
    const x = rowLabelW + c * (CELL + PAD) + Math.floor((CELL - tw) / 2);
    drawPixelText(ctx, label, x, 3, "#aaa");
  }

  // Build a fresh world + renderer to replay the simulation step-by-step.
  const world = createSyntheticWorld(gl);
  const mapRenderer = createMapRenderer(gl, world);
  const simulation = createSimulationRenderer(gl, world, { seed: SEED });

  // Camera set up to look at the entire map (1:1 pixels)
  const camera = createCamera();
  camera.x = W / 2;
  camera.y = H / 2;
  camera.zoom = 1;
  camera.viewportWidth = W;
  camera.viewportHeight = H;

  // Readback FBO at simulation resolution
  const readTex = createTexture(gl, W, H);
  const readFbo = createFBO(gl, readTex);

  // 1:1 scratch canvas for pixel data
  const tmp = document.createElement("canvas");
  tmp.width = W;
  tmp.height = H;
  const tmpCtx = tmp.getContext("2d")!;

  // Step through and render each row
  for (let row = 0; row < numSteps; row++) {
    // Advance simulation to match this step
    simulation.step();

    const y0 = labelH + row * (CELL + PAD);

    // Row label
    const label = `t${row}`;
    const tw = pixelTextWidth(label);
    drawPixelText(ctx, label, rowLabelW - 4 - tw, y0 + Math.floor((CELL - GLYPH_H) / 2), "#888");

    for (let col = 0; col < numCols; col++) {
      const { viewMode } = GRID_COLUMNS[col];
      const x0 = rowLabelW + col * (CELL + PAD);

      // Render to FBO using MapRenderer with the given view mode
      gl.bindFramebuffer(gl.FRAMEBUFFER, readFbo);
      gl.viewport(0, 0, W, H);
      gl.clearColor(BG_COLOR[0] / 255, BG_COLOR[1] / 255, BG_COLOR[2] / 255, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      mapRenderer.viewMode = viewMode;
      mapRenderer.foliageEnabled = true;
      mapRenderer.outlineEnabled = false;
      mapRenderer.render(camera);

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

  simulation.dispose();
  mapRenderer.dispose();

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

// ── Read back pixels ─────────────────────────────────────────────────────────
interface PixelGrid {
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
  log(`Simulation Lab — ${W}×${H} grid, ${DIRT_ROWS} dirt rows${SEED != null ? `, seed=${SEED}` : ""}`);
  log(`Running ${NUM_STEPS} steps...\n`);

  // Build a synthetic world and wire up simulation — same as App.tsx
  const world = createSyntheticWorld(gl);
  const simulation = createSimulationRenderer(gl, world, { seed: SEED });

  // Access the per-map foliage sim for readPixels (via the World's layers)
  const placement = world.mapPlacements[0];

  let prevAliveCount = -1;
  let convergedAt = -1;

  for (let step = 0; step < NUM_STEPS; step++) {
    simulation.step();

    // Read back foliage data from the GPU for ASCII rendering + convergence
    // The foliage texture is on the placement's layers — read it via FBO
    const foliageTex = placement.map.layers.foliage;
    if (!foliageTex) continue;

    const fbo = createFBO(gl, foliageTex);
    const buf = new Uint8Array(W * H * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);

    const data = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) data[i] = buf[i] / 255;

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

    snapshots.push({ foliageData: new Float32Array(data) });
    prevAliveCount = aliveCount;

    // Stop early if converged for 3 consecutive steps
    if (convergedAt >= 0 && step - convergedAt >= 3) {
      log(`\n✓ Converged at step ${convergedAt} (alive=${aliveCount})`);
      break;
    }
  }

  simulation.dispose();

  // Render the composite grid image (creates its own world + renderer internally)
  const gridDataUrl = renderGrid(gl, snapshots, () => {});
  (window as unknown as Record<string, unknown>).__SIM_GRID__ = gridDataUrl;

  log(`\n═══ Done — ${snapshots.length} steps captured ═══`);

  // Signal to headless runner that we're done
  (window as unknown as Record<string, boolean>).__SIM_DONE__ = true;
}

// Run immediately
run();
