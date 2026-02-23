/** World & Map asset loader — parses XML, loads PNG textures into WebGL */

import type { World, MapPlacement, GameMap, MapLayers } from "./types";

// ── XML helpers ──────────────────────────────────────────────────────────────

async function fetchXml(url: string): Promise<Document> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const text = await res.text();
  return new DOMParser().parseFromString(text, "text/xml");
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i) : ".";
}

// ── Texture loading ──────────────────────────────────────────────────────────

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function uploadTexture(
  gl: WebGL2RenderingContext,
  img: HTMLImageElement
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("Failed to create WebGL texture");

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

  // Pixel-perfect: no interpolation
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return tex;
}

async function loadTexture(
  gl: WebGL2RenderingContext,
  url: string
): Promise<WebGLTexture> {
  const img = await loadImage(url);
  return uploadTexture(gl, img);
}

// ── Map loader ───────────────────────────────────────────────────────────────

async function loadMap(
  gl: WebGL2RenderingContext,
  basePath: string,
  mapPath: string
): Promise<{ map: GameMap }> {
  const fullMapUrl = `${basePath}/${mapPath}`;
  const mapDir = `${basePath}/${dirname(mapPath)}`;

  const doc = await fetchXml(fullMapUrl);
  const el = doc.querySelector("map");
  if (!el) throw new Error(`No <map> element in ${fullMapUrl}`);

  const title = el.getAttribute("title") ?? "Untitled";
  const description = el.getAttribute("description") ?? "";
  const width = parseInt(el.getAttribute("width") ?? "0", 10);
  const height = parseInt(el.getAttribute("height") ?? "0", 10);

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid map dimensions ${width}×${height} in ${fullMapUrl}`);
  }

  // Load layers in parallel
  const [sky, background, foreground, matter] = await Promise.all([
    loadTexture(gl, `${mapDir}/sky.png`),
    loadTexture(gl, `${mapDir}/background.png`),
    loadTexture(gl, `${mapDir}/foreground.png`),
    loadTexture(gl, `${mapDir}/matter.png`),
  ]);

  const layers: MapLayers = { sky, background, foreground, matter };

  return { map: { title, description, width, height, layers } };
}

// ── World loader ─────────────────────────────────────────────────────────────

export async function loadWorld(
  gl: WebGL2RenderingContext,
  basePath: string
): Promise<World> {
  const doc = await fetchXml(`${basePath}/world.xml`);
  const worldEl = doc.querySelector("world");
  if (!worldEl) throw new Error("No <world> element in world.xml");

  const title = worldEl.getAttribute("title") ?? "Untitled";
  const description = worldEl.getAttribute("description") ?? "";

  const mapEls = worldEl.querySelectorAll("map");
  const placements: MapPlacement[] = [];

  for (const el of mapEls) {
    const path = el.getAttribute("path");
    if (!path) continue;

    const x = parseFloat(el.getAttribute("x") ?? "0");
    const y = parseFloat(el.getAttribute("y") ?? "0");

    const { map } = await loadMap(gl, basePath, path);
    placements.push({ path, x, y, map });
  }

  console.log(`Loaded world "${title}" with ${placements.length} map(s)`);

  return { title, description, mapPlacements: placements };
}
