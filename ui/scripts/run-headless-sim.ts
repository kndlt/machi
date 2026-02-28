/**
 * run-headless-sim.ts — Self-contained headless simulation runner.
 *
 * Spins up its own Vite dev server, launches headless Chrome via Playwright,
 * runs the sim page, captures console output, then tears everything down.
 *
 * Usage:
 *   npx tsx scripts/run-headless-sim.ts
 *
 * One-time setup:
 *   npx playwright install chromium
 */

import { createServer, type ViteDevServer } from "vite";
import { chromium } from "playwright";
import { resolve, join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import sharp from "sharp";

const TIMEOUT_MS = 30_000;
const ROOT = resolve(import.meta.dirname, "..");
const DEBUG_DIR = join(ROOT, "debug", "frames");

// Parse --seed argument: npx tsx scripts/run-headless-sim.ts --seed 42
function parseSeed(): number | undefined {
  const idx = process.argv.indexOf("--seed");
  if (idx < 0 || idx + 1 >= process.argv.length) return undefined;
  const val = Number(process.argv[idx + 1]);
  return Number.isFinite(val) ? val : undefined;
}
const SEED = parseSeed();

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

const RESOURCE_MAP = hasFlag("--resource-map");
const ROOT_DIAG = hasFlag("--root-diag");

async function main() {
  // ── 1. Start a temporary Vite server ─────────────────────────────────────
  let server: ViteDevServer | undefined;
  try {
    server = await createServer({
      root: ROOT,
      server: { port: 0, strictPort: false }, // random available port
      logLevel: "silent",
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to get server address");
    }
    const query = new URLSearchParams();
    if (SEED != null) query.set("seed", String(SEED));
    if (RESOURCE_MAP) query.set("resourcemap", "1");
    if (ROOT_DIAG) query.set("rootdiag", "1");
    const qs = query.toString();
    const url = `http://localhost:${address.port}/sim.html${qs ? `?${qs}` : ""}`;
    console.log(`\n🔬 Vite server on port ${address.port}${SEED != null ? ` (seed=${SEED})` : ""}`);
    console.log(`   Loading ${url}\n`);

    // ── 2. Launch headless Chrome ────────────────────────────────────────────
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--enable-webgl",
        "--enable-gpu",
        "--ignore-gpu-blocklist",
      ],
    });
    const page = await browser.newPage();

    // Pipe browser console → terminal
    page.on("console", (msg) => {
      const text = msg.text();
      if (text) console.log(text);
    });
    page.on("pageerror", (err) => {
      console.error("PAGE ERROR:", err.message);
    });

    // ── 3. Run simulation ────────────────────────────────────────────────────
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => (window as unknown as Record<string, boolean>).__SIM_DONE__ === true,
        { timeout: TIMEOUT_MS }
      );

      // ── 4. Save grid image ───────────────────────────────────────────────
      const gridDataUrl = await page.evaluate(() => {
        return (window as unknown as Record<string, unknown>).__SIM_GRID__ as string;
      });

      if (gridDataUrl) {
        rmSync(DEBUG_DIR, { recursive: true, force: true });
        mkdirSync(DEBUG_DIR, { recursive: true });

        const base64 = gridDataUrl.replace(/^data:image\/png;base64,/, "");
        const buf = Buffer.from(base64, "base64");
        writeFileSync(join(DEBUG_DIR, "grid.png"), buf);
        console.log(`\n📁 Saved grid.png to debug/frames/`);
      }

      // // ── 4b. Animated WebP generation ──────────────────────────────────
      // interface AnimFrames {
      //   gridFrames: string[];
      //   perLayer: Record<string, string[]>;
      //   gridWidth: number;
      //   gridHeight: number;
      //   cellWidth: number;
      //   cellHeight: number;
      // }

      // const animData = await page.evaluate(() => {
      //   return (window as unknown as Record<string, unknown>).__SIM_ANIM__ as AnimFrames | undefined;
      // }) as AnimFrames | undefined;

      // if (animData) {
      //   mkdirSync(DEBUG_DIR, { recursive: true });

      //   /**
      //    * Assemble base64 PNG frames into an animated WebP.
      //    * Strategy: decode each frame to raw RGBA, stack vertically,
      //    * then use sharp's `pageHeight` to split into animation frames.
      //    */
      //   async function createAnimatedWebP(
      //     frames: string[],
      //     width: number,
      //     height: number,
      //     outputPath: string,
      //     delayMs = 200,
      //   ): Promise<void> {
      //     // Decode all frames to raw RGBA buffers
      //     const rawFrames: Buffer[] = [];
      //     for (const dataUrl of frames) {
      //       const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      //       const pngBuf = Buffer.from(b64, "base64");
      //       const { data } = await sharp(pngBuf)
      //         .ensureAlpha()
      //         .raw()
      //         .toBuffer({ resolveWithObject: true });
      //       rawFrames.push(data);
      //     }

      //     // Stack all frames into one tall image
      //     const allPixels = Buffer.concat(rawFrames);
      //     const totalHeight = height * rawFrames.length;

      //     await sharp(allPixels, {
      //       raw: { width, height: totalHeight, channels: 4 },
      //     })
      //       .webp({
      //         loop: 0, // loop forever
      //         delay: rawFrames.map(() => delayMs),
      //         pageHeight: height,
      //       })
      //       .toFile(outputPath);
      //   }

      //   // Grid animated WebP (all layers side by side, one frame per step)
      //   try {
      //     await createAnimatedWebP(
      //       animData.gridFrames,
      //       animData.gridWidth,
      //       animData.gridHeight,
      //       join(DEBUG_DIR, "grid-animated.webp"),
      //     );
      //     console.log("📽  Saved grid-animated.webp");
      //   } catch (err) {
      //     console.error("Failed to create grid-animated.webp:", err);
      //   }

      //   // Per-layer animated WebPs
      //   for (const [layerName, frames] of Object.entries(animData.perLayer)) {
      //     const filename = layerName.toLowerCase().replace(/\s+/g, "-") + ".webp";
      //     try {
      //       await createAnimatedWebP(
      //         frames,
      //         animData.cellWidth,
      //         animData.cellHeight,
      //         join(DEBUG_DIR, filename),
      //       );
      //       console.log(`📽  Saved ${filename}`);
      //     } catch (err) {
      //       console.error(`Failed to create ${filename}:`, err);
      //     }
      //   }

      //   console.log(`\n📁 All animated WebPs saved to debug/frames/`);
      // }
    } catch (err) {
      console.error("Simulation timed out or failed:", err);
    } finally {
      await browser.close();
    }
  } finally {
    // ── 5. Cleanup ─────────────────────────────────────────────────────────
    if (server) await server.close();
  }
}

main();
