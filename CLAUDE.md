# CLAUDE.md — Machi Codebase Guide

## What is Machi?

Machi is a pixel-art 2D tile world editor and renderer. It has two rendering paths:

1. **World Viewer** (`App.tsx`) — Raw WebGL2 renderer that loads PNG-based map layers from XML definitions and composites them with custom shaders. Read-only viewing of authored worlds.
2. **Tile Editor** (`Editor.tsx`) — PixiJS-based interactive editor for painting tile maps with tools (pencil, eraser, bucket fill), undo/redo, and file persistence.

Currently `main.tsx` renders the World Viewer (`App`), not the Editor.

The long-term vision (see `docs/semantic-tile-*.md`) is "Semantic Tiles" — tiles carrying continuous latent vectors instead of fixed type enums, enabling emergent behavior and rendering.

## Tech Stack

- **Runtime**: React 19, TypeScript 5.8, Vite 7
- **Rendering**: PixiJS 8 (tile editor), WebGL2 (world viewer), GLSL 300 ES shaders
- **State**: Preact Signals (`@preact/signals-react`) — no Redux/Zustand
- **UI**: Radix UI Themes, Emotion CSS (`css` prop via Babel plugin)
- **Backend**: Cloudflare Workers (Hono), currently just a `/api/health` stub
- **Persistence**: localStorage only (no server-side save yet)
- **Package manager**: pnpm 10
- **Deploy**: `wrangler deploy` to Cloudflare (SPA mode with worker)
- **Tests**: vitest configured but **no tests exist yet**

## Project Structure

```
machi/
├── ui/                        # Main application (all active code)
│   ├── src/
│   │   ├── main.tsx           # React root → renders App
│   │   ├── App.tsx            # WebGL2 world viewer entry point
│   │   ├── Editor.tsx         # PixiJS tile editor entry point
│   │   ├── renderer/          # WebGL2 world rendering
│   │   │   ├── WebGLRenderer.ts   # GL context, resize, animation loop, FPS meter
│   │   │   ├── Camera.ts         # Orthographic camera, matrix math, screen↔world
│   │   │   ├── LayerRenderer.ts  # Multi-layer texture compositing (5 layers)
│   │   │   └── shaders.ts       # GLSL vertex/fragment shaders, compile helpers
│   │   ├── world/             # World data loading
│   │   │   ├── types.ts          # World, MapPlacement, GameMap, MapLayers interfaces
│   │   │   └── WorldLoader.ts    # XML parsing, PNG→WebGL texture loading
│   │   ├── controls/
│   │   │   └── CameraControls.ts # Keyboard/mouse pan, zoom, view mode toggle
│   │   ├── components/        # React UI (tile editor)
│   │   │   ├── Scene.tsx         # PixiJS canvas: tile rendering, painting, camera (685 lines)
│   │   │   ├── MenuBar.tsx       # File menu (New/Open/Save/Save As)
│   │   │   ├── Toolbar.tsx       # Tool picker (Pencil/Eraser/Bucket)
│   │   │   ├── Inspector.tsx     # Right panel: minimap, palette, info
│   │   │   ├── StatusBar.tsx     # Bottom bar: map name, zoom, coords
│   │   │   └── FileBrowser.tsx   # Open/Save As dialogs
│   │   ├── states/            # Preact Signal stores
│   │   │   ├── editorStore.ts    # UI state: active tool, dialog, viewport
│   │   │   ├── tileMapStore.ts   # Tile data, undo/redo, autosave
│   │   │   └── persistence.ts   # localStorage serialization
│   │   ├── models/            # Data types
│   │   │   ├── Tile.ts           # TileMatter: "dirt" | "water"
│   │   │   └── TileMap.ts        # { name, width, height, tiles[] }
│   │   └── global.css         # CSS reset
│   ├── worker/
│   │   └── index.ts           # Cloudflare Worker (Hono, /api/health only)
│   ├── public/
│   │   └── worlds/world1/     # Sample world data (world.xml + map PNGs)
│   ├── conf/                  # TypeScript configs (app, node, worker)
│   ├── package.json           # v0.9.2
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   └── wrangler.jsonc         # Cloudflare deployment config
├── docs/                      # Design documents
│   ├── world-01.md            # World ontology: layers, matter, simulation
│   ├── world-01-phase-01.md   # Phase 01 implementation spec
│   ├── semantic-tile-1.md     # Semantic tile research (latent vectors)
│   └── semantic-tile-2.md     # Pixel-level semantic approach
└── deprecated/                # Old Next.js + WASM prototype (ignore)
```

## Key Commands

```bash
cd ui
pnpm install          # Install dependencies
pnpm dev              # Start dev server on port 8588
pnpm build            # TypeScript check + Vite build
pnpm test             # Run vitest (no tests exist yet)
pnpm lint             # ESLint
pnpm deploy           # Build + wrangler deploy to Cloudflare
pnpm kill             # Kill process on port 8588
```

## Architecture & Patterns

### Factory Functions Over Classes
The entire codebase uses factory functions returning interface objects — no classes anywhere. Example:
```ts
const renderer = createWebGLRenderer(canvas);  // returns WebGLRenderer interface
const camera = createCamera();                  // returns Camera interface
```

### State Management
- **Preact Signals** for all reactive state (`signal()`, `computed()`)
- Components use `useSignals()` hook for React integration
- Module-scoped singletons: `editorStore`, `tileMapStore`
- `tileMapStore` is exposed on `window.tileMapStore` for debugging

### Rendering Architecture

**World Viewer (WebGL2):**
- 5 map layers: sky → background → support → foreground → matter
- Single-pass fragment shader composites all layers with alpha blending
- 3 view modes: visual (composited), matter (raw), segmentation (color-coded)
- Textures: `NEAREST` filtering, `CLAMP_TO_EDGE` — pixel-perfect, no smoothing
- Canvas ignores `devicePixelRatio` intentionally for chunky pixel look

**Tile Editor (PixiJS):**
- Tiles stored as flat 1D array, row-major: `index = y * width + x`
- `TILE_SIZE = 8px`, `RENDER_SCALE = 2x`
- Pixel buffer (`Uint8Array`) uploaded as texture + overlay `RenderTexture` for incremental dirty-tile updates
- Bresenham line interpolation for smooth brush strokes
- Flood fill uses BFS queue

### Camera
- Orthographic projection, column-major 4x4 matrix
- Y-axis flipped: screen top-left → world bottom-left
- Smooth interpolation to target position/zoom (lerp factor 0.15)
- Zoom levels snap to: `[0.125, 0.25, 0.5, 1, 2, 3, ... 16]`
- Zoom centers on mouse cursor position

### Persistence
- localStorage only, `machi:` key prefix
- Tiles serialized as compact array of matter strings (or null for air)
- Autosave separate from named files
- File index with metadata (id, name, dimensions, updatedAt)
- `crypto.randomUUID()` for file IDs

### CSS
- Emotion `css` prop for component styles (requires `@emotion/react` JSX source in tsconfig)
- Radix UI Themes for dark mode and base components
- Minimal global CSS reset

## Data Model

```
World
  └── MapPlacement[] (x, y position + GameMap ref)
        └── GameMap (title, width, height)
              └── MapLayers (sky, background, foreground, support, matter — all WebGLTexture | null)

TileMap (editor)
  ├── name: string
  ├── width: number (default 160)
  ├── height: number (default 120)
  └── tiles: Array<Tile | null>  (null = air)
        └── Tile { matter: "dirt" | "water" }
```

## Conventions

- **No classes** — factory functions + interfaces everywhere
- **No dependency injection** — direct imports
- **Dispose pattern** — resources clean up via `dispose()` methods
- **Event cleanup** — all event listeners removed in cleanup functions
- **Signals for state** — never use `useState` for shared/global state
- **File naming** — PascalCase for components/models, camelCase for utilities
- **GLSL** — version 300 ES, embedded as template string constants

## Things To Know

1. The `deprecated/` folder contains an old Next.js + WASM prototype. Ignore it entirely.
2. The Cloudflare Worker (`worker/index.ts`) is a stub — only `/api/health` exists.
3. `main.tsx` currently renders `App` (world viewer), not `Editor` (tile editor). To work on the editor, change the import in `main.tsx`.
4. Only 2 tile matter types exist: `"dirt"` and `"water"`. The docs envision many more (stone, vegetation, semantic latents).
5. `Scene.tsx` at 685 lines is the largest file and most complex — handles all PixiJS rendering, painting, camera, and input.
6. Undo/redo caps at 50 snapshots (full tile array copies).
7. The world viewer loads maps from `public/worlds/world1/world.xml` → individual map XML files → 5 PNG layer textures per map.
8. Dev server runs on port **8588** (strict — fails if port is taken).
