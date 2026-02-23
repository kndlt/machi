import { useEffect, useRef, useState } from "react";
import { Theme } from "@radix-ui/themes";
import { createWebGLRenderer } from "./renderer/WebGLRenderer";
import { createCamera } from "./renderer/Camera";
import { createLayerRenderer } from "./renderer/LayerRenderer";
import { createCameraControls } from "./controls/CameraControls";
import { loadWorld } from "./world/WorldLoader";

const WORLD_PATH = "/worlds/world1";

async function initApp(canvas: HTMLCanvasElement): Promise<() => void> {
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
    camera.zoom = 3; // default zoom so 512x256 map fills more of the screen
  }

  // 4. Layer renderer
  const layerRenderer = createLayerRenderer(gl, world);

  // 5. Controls
  const controls = createCameraControls(canvas, camera);

  // 6. Start animation loop
  const stopLoop = renderer.start(camera, layerRenderer);

  console.log("World rendered!");

  // Cleanup
  return () => {
    stopLoop();
    controls.dispose();
    layerRenderer.dispose();
    renderer.dispose();
  };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cleanup: (() => void) | undefined;

    initApp(canvas)
      .then((fn) => { cleanup = fn; })
      .catch((err) => {
        console.error("Init failed:", err);
        setError(err.message || "Failed to initialize");
      });

    return () => cleanup?.();
  }, []);

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
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            imageRendering: "pixelated",
          }}
        />
      )}
    </Theme>
  );
}
