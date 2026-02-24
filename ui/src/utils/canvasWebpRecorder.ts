import createWebpModule from "wasm-webp/dist/esm/webp-wasm.js";
import webpWasmUrl from "wasm-webp/dist/esm/webp-wasm.wasm?url";

export interface CanvasWebpRecorderOptions {
  intervalMs?: number;
  quality?: number;
  loop?: number;
  filename?: string;
  maxFrames?: number;
  onAutoStopStart?: () => void;
  onAutoStopComplete?: (error?: unknown) => void;
}

interface RecordedFrame {
  data: Uint8Array;
  duration: number;
}

interface WebpEncoderModule {
  encodeAnimation(
    width: number,
    height: number,
    hasAlpha: boolean,
    durations: number[],
    data: Uint8Array,
  ): Uint8Array | null;
}

let webpModulePromise: Promise<WebpEncoderModule> | null = null;

async function getWebpModule(): Promise<WebpEncoderModule> {
  if (!webpModulePromise) {
    webpModulePromise = createWebpModule({
      locateFile(path: string) {
        if (path.endsWith("webp-wasm.wasm")) {
          return webpWasmUrl;
        }
        return path;
      },
    }) as Promise<WebpEncoderModule>;
  }
  return webpModulePromise;
}

export interface CanvasWebpRecorder {
  start(): void;
  stopAndDownload(): Promise<void>;
  isRecording(): boolean;
  dispose(): void;
}

export function createCanvasWebpRecorder(
  canvas: HTMLCanvasElement,
  _gl: WebGL2RenderingContext,
  options: CanvasWebpRecorderOptions = {},
): CanvasWebpRecorder {
  const intervalMs = Math.max(16, options.intervalMs ?? 100);
  const filename = options.filename ?? "map-capture.webp";
  const maxFrames = Math.max(1, Math.floor(options.maxFrames ?? 1000));

  const snapshotCanvas = document.createElement("canvas");
  const maybeSnapshotCtx = snapshotCanvas.getContext("2d", { willReadFrequently: true });
  if (!maybeSnapshotCtx) {
    throw new Error("Failed to create 2D context for capture");
  }
  const snapshotCtx = maybeSnapshotCtx;

  let recording = false;
  let rafId = 0;
  let lastCaptureAt = 0;
  let frames: RecordedFrame[] = [];
  let previousPixels: Uint8ClampedArray | null = null;
  let finalizingPromise: Promise<void> | null = null;

  function readCurrentFramePixels(): Uint8ClampedArray {
    const width = canvas.width;
    const height = canvas.height;

    if (snapshotCanvas.width !== width || snapshotCanvas.height !== height) {
      snapshotCanvas.width = width;
      snapshotCanvas.height = height;
    }

    snapshotCtx.clearRect(0, 0, width, height);
    snapshotCtx.drawImage(canvas, 0, 0, width, height);
    return snapshotCtx.getImageData(0, 0, width, height).data;
  }

  function arraysEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function captureFrame(delayMs: number): void {
    if (canvas.width === 0 || canvas.height === 0) return;

    const pixels = readCurrentFramePixels();
    if (previousPixels && frames.length > 0 && arraysEqual(pixels, previousPixels)) {
      frames[frames.length - 1].duration += delayMs;
      return;
    }

    frames.push({ data: new Uint8Array(pixels), duration: delayMs });
    previousPixels = pixels;
  }

  function tick(now: number): void {
    if (!recording) return;

    const elapsed = now - lastCaptureAt;
    if (elapsed >= intervalMs) {
      captureFrame(Math.round(elapsed));
      lastCaptureAt = now;

      if (frames.length >= maxFrames) {
        recording = false;
        if (rafId) cancelAnimationFrame(rafId);
        options.onAutoStopStart?.();
        void finalizeAndDownload()
          .then(() => options.onAutoStopComplete?.())
          .catch((error) => options.onAutoStopComplete?.(error));
        return;
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  function start(): void {
    if (recording) return;
    recording = true;
    frames = [];
    previousPixels = null;
    lastCaptureAt = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  async function stopAndDownload(): Promise<void> {
    if (!recording) return;
    recording = false;
    if (rafId) cancelAnimationFrame(rafId);

    await finalizeAndDownload();
  }

  async function finalizeAndDownload(): Promise<void> {
    if (finalizingPromise) {
      await finalizingPromise;
      return;
    }

    finalizingPromise = (async () => {
      if (frames.length === 0) {
        captureFrame(intervalMs);
      }
      if (frames.length === 0) return;

      const module = await getWebpModule();
      const durations = frames.map((frame) => frame.duration);
      const totalLength = frames.reduce((sum, frame) => sum + frame.data.length, 0);
      const packed = new Uint8Array(totalLength);

      let offset = 0;
      for (const frame of frames) {
        packed.set(frame.data, offset);
        offset += frame.data.length;
      }

      const encoded = module.encodeAnimation(canvas.width, canvas.height, true, durations, packed);
      if (!encoded) {
        throw new Error("Animated WebP encode failed");
      }

      const webpBuffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);

      const blob = new Blob([webpBuffer], { type: "image/webp" });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(url);
    })();

    try {
      await finalizingPromise;
    } finally {
      finalizingPromise = null;
    }
  }

  function dispose(): void {
    recording = false;
    if (rafId) cancelAnimationFrame(rafId);
    frames = [];
    previousPixels = null;
  }

  return {
    start,
    stopAndDownload,
    isRecording: () => recording,
    dispose,
  };
}