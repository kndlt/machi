import type { World } from "../world/types";

interface NutrientHudController {
  setEnabled(enabled: boolean): void;
  tick(now: number, isResourceViewMode: boolean): void;
  getLabel(): string | null;
  dispose(): void;
}

const HUD_SAMPLE_INTERVAL_MS = 500;

export function createNutrientHud(
  gl: WebGL2RenderingContext,
  world: World,
): NutrientHudController {
  const sampleFbo = gl.createFramebuffer();
  const readbackCache = new Map<string, Uint8Array>();

  let enabled = true;
  let resourceViewModeActive = false;
  let lastSampleMs = -1;
  let label: string | null = null;

  function readTotalSignedNutrient(texture: WebGLTexture, width: number, height: number): number | null {
    if (!sampleFbo) return null;
    if (width <= 0 || height <= 0) return null;

    const key = `${width}x${height}`;
    const requiredLength = width * height * 4;
    let buf = readbackCache.get(key);
    if (!buf || buf.length !== requiredLength) {
      buf = new Uint8Array(requiredLength);
      readbackCache.set(key, buf);
    }

    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, sampleFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
      return null;
    }

    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);

    let sum = 0;
    for (let i = 0; i < requiredLength; i += 4) {
      sum += buf[i + 1] - 127;
    }
    return sum;
  }

  function refresh(): void {
    if (!enabled || !resourceViewModeActive) {
      label = null;
      return;
    }

    let hasAny = false;
    let totalSigned = 0;
    for (const placement of world.mapPlacements) {
      const branch2Tex = placement.map.layers.branch2;
      if (!branch2Tex) continue;

      const partial = readTotalSignedNutrient(branch2Tex, placement.map.width, placement.map.height);
      if (partial == null) continue;

      totalSigned += partial;
      hasAny = true;
    }

    if (!hasAny) {
      label = null;
      return;
    }

    label = `Total nutrient: ${totalSigned >= 0 ? "+" : ""}${totalSigned}`;
  }

  function setEnabled(nextEnabled: boolean): void {
    enabled = nextEnabled;
    if (!enabled || !resourceViewModeActive) {
      label = null;
      return;
    }

    lastSampleMs = -1;
    refresh();
  }

  function tick(now: number, isResourceViewMode: boolean): void {
    resourceViewModeActive = isResourceViewMode;
    if (!enabled || !resourceViewModeActive) {
      label = null;
      return;
    }
    if (lastSampleMs >= 0 && now - lastSampleMs < HUD_SAMPLE_INTERVAL_MS) return;

    refresh();
    lastSampleMs = now;
  }

  function getLabel(): string | null {
    return label;
  }

  function dispose(): void {
    label = null;
    if (sampleFbo) {
      gl.deleteFramebuffer(sampleFbo);
    }
    readbackCache.clear();
  }

  return {
    setEnabled,
    tick,
    getLabel,
    dispose,
  };
}
