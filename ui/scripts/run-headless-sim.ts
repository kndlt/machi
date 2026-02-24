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
    const seedParam = SEED != null ? `?seed=${SEED}` : "";
    const url = `http://localhost:${address.port}/sim.html${seedParam}`;
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
