import { useEffect, useRef, useState } from "react";
import { Button, Theme } from "@radix-ui/themes";
import { createWebGLRenderer } from "./renderer/WebGLRenderer";
import { createCamera } from "./renderer/Camera";
import { createMapRenderer } from "./renderer/MapRenderer";
import { createSimulationRenderer } from "./simulation/SimulationRenderer";
import { createCameraControls } from "./controls/CameraControls";
import { loadWorld } from "./world/WorldLoader";
import { createCanvasWebpRecorder } from "./utils/canvasWebpRecorder";

const WORLD_PATH = "/worlds/world1";

interface AppRuntime {
  startRecording(): void;
  stopRecordingAndDownload(): Promise<void>;
  dispose(): void;
}

interface InitAppCallbacks {
  onAutoStopStart: () => void;
  onAutoStopComplete: (error?: unknown) => void;
}

async function initApp(canvas: HTMLCanvasElement, callbacks: InitAppCallbacks): Promise<AppRuntime> {
  console.log("Initializing app...");

  // 1. WebGL context
  const renderer = createWebGLRenderer(canvas);
  const { gl } = renderer;

  // 2. Camera
  const camera = createCamera();

  // 3. Load world assets
  const world = await loadWorld(gl, WORLD_PATH);

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
  const simulation = createSimulationRenderer(gl, world);

  // 5. Controls
  const controls = createCameraControls(canvas, camera, mapRenderer, simulation, renderer);

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
