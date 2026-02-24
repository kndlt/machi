/// <reference types="vite/client" />

declare module '*.glsl' {
  const value: string;
  export default value;
}

declare module '*.vert' {
  const value: string;
  export default value;
}

declare module '*.frag' {
  const value: string;
  export default value;
}

declare module 'wasm-webp/dist/esm/webp-wasm.js' {
  interface WebpWasmModuleOptions {
    locateFile?: (path: string) => string;
  }

  interface WebpWasmModule {
    encodeAnimation(
      width: number,
      height: number,
      hasAlpha: boolean,
      durations: number[],
      data: Uint8Array,
    ): Uint8Array | null;
  }

  export default function createWebpModule(options?: WebpWasmModuleOptions): Promise<WebpWasmModule>;
}
