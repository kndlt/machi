import { useEffect, useRef, useState } from "react";
import { Button, Theme } from "@radix-ui/themes";
import { createWebGLRenderer } from "./renderer/WebGLRenderer";
import { createCamera } from "./renderer/Camera";
import { screenToWorld } from "./renderer/Camera";
import { createMapRenderer } from "./renderer/MapRenderer";
import { createSimulationRenderer } from "./simulation/SimulationRenderer";
import { createCameraControls } from "./controls/CameraControls";
import { loadWorld } from "./world/WorldLoader";
import { createCanvasWebpRecorder } from "./utils/canvasWebpRecorder";
import { createNutrientHud } from "./utils/nutrientHud";

const DEFAULT_WORLD_NAME = "world1";

interface AppRuntime {
  startRecording(): void;
  stopRecordingAndDownload(): Promise<void>;
  dispose(): void;
}

interface InitAppCallbacks {
  onAutoStopStart: () => void;
  onAutoStopComplete: (error?: unknown) => void;
}

function readLocationParam(name: string): string | null {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hashParams.get(name)
    ?? new URLSearchParams(window.location.search).get(name);
}

function readWorldName(): string {
  const raw = readLocationParam("world");
  if (!raw) return DEFAULT_WORLD_NAME;

  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_WORLD_NAME;

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return DEFAULT_WORLD_NAME;

  return trimmed;
}

function readPerturbNoiseSpeed(): number | null {
  const raw = readLocationParam("perturb");

  if (raw == null) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;

  return Math.max(0, Math.round(parsed));
}

function readSimulationSpeedMultiplier(): number | null {
  const raw = readLocationParam("speed");
  if (raw == null) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return parsed;
}

function readSimulationStartDelayMs(): number | null {
  const raw = readLocationParam("delay");
  if (raw == null) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;

  const seconds = Math.max(0, parsed);
  return Math.round(seconds * 1000);
}

function readSimulationSeed(): number | undefined {
  const raw = readLocationParam("seed");
  if (raw == null) return undefined;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;

  return Math.trunc(parsed);
}

function readBooleanParam(name: string, defaultValue: boolean): boolean {
  const raw = readLocationParam(name);
  if (raw == null) return defaultValue;

  const value = raw.trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(value)) return false;
  if (["1", "true", "on", "yes"].includes(value)) return true;
  return defaultValue;
}

function readBranchingEnabled(): boolean {
  return readBooleanParam("branching", true);
}

function readBranchInhibitionEnabled(): boolean {
  return readBooleanParam("inhibition", true);
}

function readNutrientHudEnabled(): boolean {
  return readBooleanParam("nutrienthud", true);
}

function readViewMode(): number | null {
  const raw = readLocationParam("view");
  if (raw == null) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;

  return Math.trunc(parsed);
}

async function initApp(canvas: HTMLCanvasElement, callbacks: InitAppCallbacks): Promise<AppRuntime> {
  console.log("Initializing app...");

  // 1. WebGL context
  const renderer = createWebGLRenderer(canvas);
  const { gl } = renderer;

  // 2. Camera
  const camera = createCamera();

  // 3. Load world assets
  const worldName = readWorldName();
  const worldPath = `/worlds/${worldName}`;
  const world = await loadWorld(gl, worldPath);
  console.log(`Loaded world: ${worldName}`);

  // Center camera on first map
  if (world.mapPlacements.length > 0) {
    const p = world.mapPlacements[0];
    camera.x = p.x + p.map.width / 2;
    camera.y = p.y + p.map.height / 2;
    camera.zoom = 4; // default zoom so 512x256 map fills more of the screen
  }

  // 4. Map renderer
  const mapRenderer = createMapRenderer(gl, world);

  // 4b. Simulation renderer (produces foliage layer)
  const simulationSeed = readSimulationSeed();
  const simulation = createSimulationRenderer(gl, world, {
    seed: simulationSeed,
    branchingEnabled: readBranchingEnabled(),
    branchInhibitionEnabled: readBranchInhibitionEnabled(),
  });
  simulation.prewarm();

  const BASE_SIM_INTERVAL_MS = 1024;

  const applyLocationControls = () => {
    const perturbNoiseSpeed = readPerturbNoiseSpeed();
    simulation.noiseSpeed = perturbNoiseSpeed ?? 1;

    const viewMode = readViewMode();
    if (viewMode != null) {
      mapRenderer.viewMode = viewMode;
    }

    simulation.branchingEnabled = readBranchingEnabled();
    simulation.branchInhibitionEnabled = readBranchInhibitionEnabled();
    const nutrientHudEnabled = readNutrientHudEnabled();
    nutrientHud.setEnabled(nutrientHudEnabled);

    const speedMultiplier = readSimulationSpeedMultiplier() ?? 1;
    renderer.simInterval = Math.round(BASE_SIM_INTERVAL_MS / speedMultiplier);
    renderer.simStartDelayMs = readSimulationStartDelayMs() ?? 0;

    console.log(
      `Location controls applied: perturb=${simulation.noiseSpeed}, speed=${speedMultiplier}, simInterval=${renderer.simInterval}ms, delay=${renderer.simStartDelayMs}ms, seed=${simulationSeed ?? "random"}, view=${mapRenderer.viewMode}, branching=${simulation.branchingEnabled}, inhibition=${simulation.branchInhibitionEnabled}, nutrienthud=${nutrientHudEnabled}`,
    );
  };

  // 5. Controls
  const controls = createCameraControls(canvas, camera, mapRenderer, simulation, renderer);

  const resourceHoverEl = document.createElement("div");
  resourceHoverEl.style.cssText =
    "position:absolute;left:10px;bottom:54px;display:none;" +
    "color:rgba(210,255,220,0.95);font:11px monospace;pointer-events:none;z-index:11;" +
    "text-shadow:0 0 1px #000";
  resourceHoverEl.style.whiteSpace = "pre";
  canvas.parentElement?.appendChild(resourceHoverEl);

  const nutrientHud = createNutrientHud(gl, world);

  applyLocationControls();

  const onHashChange = () => {
    applyLocationControls();
  };
  window.addEventListener("hashchange", onHashChange);

  const sampleFbo = gl.createFramebuffer();
  const samplePixel = new Uint8Array(4);
  let hoverScreenX = 0;
  let hoverScreenY = 0;
  let hoverActive = false;
  let hoverRafId = 0;

  function sampleResourceAtCell(
    texture: WebGLTexture,
    localX: number,
    localY: number,
    width: number,
    height: number,
  ): number | null {
    if (!sampleFbo) return null;
    if (localX < 0 || localY < 0 || localX >= width || localY >= height) return null;

    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, sampleFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
      return null;
    }

    gl.readPixels(localX, localY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, samplePixel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    return samplePixel[1] - 127;
  }

  const refreshHoverResource = () => {
    if (mapRenderer.viewMode !== 11) {
      resourceHoverEl.style.display = "none";
      return;
    }

    const nutrientLine = nutrientHud.getLabel();
    if (!hoverActive) {
      if (nutrientLine) {
        resourceHoverEl.textContent = nutrientLine;
        resourceHoverEl.style.display = "block";
      } else {
        resourceHoverEl.style.display = "none";
      }
      return;
    }

    const { wx, wy } = screenToWorld(camera, hoverScreenX, hoverScreenY);

    const placement = world.mapPlacements.find((p) => (
      wx >= p.x
      && wy >= p.y
      && wx < p.x + p.map.width
      && wy < p.y + p.map.height
    ));

    if (!placement || !placement.map.layers.branch2) {
      if (nutrientLine) {
        resourceHoverEl.textContent = nutrientLine;
        resourceHoverEl.style.display = "block";
      } else {
        resourceHoverEl.style.display = "none";
      }
      return;
    }

    const localX = Math.floor(wx - placement.x);
    const mapY = Math.floor(wy - placement.y);
    const localY = placement.map.height - 1 - mapY;
    const signedResource = sampleResourceAtCell(
      placement.map.layers.branch2,
      localX,
      localY,
      placement.map.width,
      placement.map.height,
    );

    if (signedResource == null) {
      if (nutrientLine) {
        resourceHoverEl.textContent = nutrientLine;
        resourceHoverEl.style.display = "block";
      } else {
        resourceHoverEl.style.display = "none";
      }
      return;
    }

    const cellLine = `cell ${localX},${localY} | resource ${signedResource >= 0 ? "+" : ""}${signedResource}`;
    resourceHoverEl.textContent = nutrientLine ? `${nutrientLine}\n${cellLine}` : cellLine;
    resourceHoverEl.style.display = "block";
  };

  const onCanvasMouseMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    hoverScreenX = e.clientX - rect.left;
    hoverScreenY = e.clientY - rect.top;
    hoverActive = true;
    refreshHoverResource();
  };

  const onCanvasMouseLeave = () => {
    hoverActive = false;
    refreshHoverResource();
  };

  const hoverTick = (now: number) => {
    nutrientHud.tick(now, mapRenderer.viewMode === 11);
    refreshHoverResource();
    hoverRafId = requestAnimationFrame(hoverTick);
  };
  hoverRafId = requestAnimationFrame(hoverTick);

  canvas.addEventListener("mousemove", onCanvasMouseMove);
  canvas.addEventListener("mouseleave", onCanvasMouseLeave);

  // 6. Start animation loop (simulation ticks inside at 200ms intervals)
  const stopLoop = renderer.start(camera, mapRenderer, simulation);
  const recorder = createCanvasWebpRecorder(canvas, gl, {
    intervalMs: 100,
    quality: 85,
    loop: 0,
    maxFrames: 100,
    onAutoStopStart: callbacks.onAutoStopStart,
    onAutoStopComplete: callbacks.onAutoStopComplete,
    filename: `map-capture-${new Date().toISOString().replace(/[:.]/g, "-")}.webp`,
  });

  console.log("World rendered!");

  return {
    startRecording() {
      recorder.start();
    },
    stopRecordingAndDownload() {
      return recorder.stopAndDownload();
    },
    dispose() {
      window.removeEventListener("hashchange", onHashChange);
      canvas.removeEventListener("mousemove", onCanvasMouseMove);
      canvas.removeEventListener("mouseleave", onCanvasMouseLeave);
      cancelAnimationFrame(hoverRafId);
      resourceHoverEl.remove();
      nutrientHud.dispose();
      if (sampleFbo) {
        gl.deleteFramebuffer(sampleFbo);
      }
      recorder.dispose();
      stopLoop();
      controls.dispose();
      simulation.dispose();
      mapRenderer.dispose();
      renderer.dispose();
    },
  };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<AppRuntime | null>(null);
  const initPromiseRef = useRef<Promise<AppRuntime> | null>(null);
  const mountedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [encoding, setEncoding] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setRuntimeReady(false);

    mountedRef.current = true;
    if (!initPromiseRef.current) {
      initPromiseRef.current = initApp(canvas, {
        onAutoStopStart: () => {
          setEncoding(true);
        },
        onAutoStopComplete: (error) => {
          setRecording(false);
          setEncoding(false);
          if (error) {
            console.error("Auto recording export failed:", error);
            setError(error instanceof Error ? error.message : "Failed to export recording");
          }
        },
      });
    }

    let active = true;

    initPromiseRef.current
      .then((runtime) => {
        if (!active) {
          return;
        }
        if (!mountedRef.current) {
          runtime.dispose();
          initPromiseRef.current = null;
          return;
        }
        runtimeRef.current = runtime;
        setRuntimeReady(true);
      })
      .catch((err) => {
        console.error("Init failed:", err);
        setError(err.message || "Failed to initialize");
        setRuntimeReady(false);
        initPromiseRef.current = null;
      });

    return () => {
      active = false;
      mountedRef.current = false;

      if (runtimeRef.current) {
        runtimeRef.current.dispose();
        runtimeRef.current = null;
        initPromiseRef.current = null;
      }

      setRuntimeReady(false);
    };
  }, []);

  const onRecordToggle = async () => {
    const runtime = runtimeRef.current;
    if (!runtime || encoding) return;

    if (!recording) {
      runtime.startRecording();
      setRecording(true);
      return;
    }

    setEncoding(true);
    try {
      await runtime.stopRecordingAndDownload();
      setRecording(false);
    } catch (err) {
      console.error("Recording export failed:", err);
      setError(err instanceof Error ? err.message : "Failed to export recording");
    } finally {
      setEncoding(false);
    }
  };

  return (
    <Theme
      appearance="dark"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {error ? (
        <div style={{ color: "#f44", padding: 24, fontFamily: "monospace" }}>
          Error: {error}
        </div>
      ) : (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              imageRendering: "pixelated",
            }}
          />
          <div style={{ position: "absolute", top: 12, right: 12, zIndex: 20 }}>
            <Button onClick={onRecordToggle} disabled={encoding || !runtimeReady}>
              {encoding ? "Encoding..." : recording ? "Done" : "Record"}
            </Button>
          </div>
        </div>
      )}
    </Theme>
  );
}
