# World 01 - Phase 01: Foundation

This document outlines the first implementation phase for the World 01 system.

## Goal

Build the minimal rendering foundation:
- Load world/map data from XML + PNG assets
- Single map rendering with orthographic camera
- Layer-based composition (sky, background, foreground)
- Camera controls (pan, zoom)
- Animation loop (requestAnimationFrame)
- Proper WebGL setup with pixel-perfect rendering

## Out of Scope (Later Phases)

- Virtual texturing / tiled pages
- Matter simulation / matter layer rendering
- Support layer rendering
- Entity system
- Multiple maps in one world
- Persistence

> **Note**: The asset files include `matter.png` and `support.png` layers.
> These are loaded but not rendered in Phase 01.

## Phase 01 Deliverables

### 1. WebGL Renderer Setup

**Status**: ✅ Complete (App.tsx)

- [x] WebGL2 context with anti-aliasing disabled
- [x] Device pixel ratio handling
- [x] Pixelated CSS rendering
- [x] Proper resize handling
- [x] Cleanup on unmount

### 2. Camera System

**Requirements**:
- Orthographic projection
- World-space coordinates
- Pan controls (arrow keys or mouse drag)
- Zoom controls (mouse wheel)
- Camera bounds (optional)

**API**:
```typescript
interface Camera {
  x: number;          // world-space X position (center)
  y: number;          // world-space Y position (center)
  zoom: number;       // zoom level (1.0 = 100%)
  viewportWidth: number;
  viewportHeight: number;
}
```

**Shader Interface**:
```glsl
uniform mat4 u_camera_matrix;    // orthographic view-projection matrix
uniform vec2 u_viewport_size;    // viewport size in pixels
```

**Camera Matrix**:

The camera produces an orthographic projection matrix that maps world-space coordinates to clip space. This single matrix encapsulates position and zoom:

```typescript
function buildCameraMatrix(camera: Camera): Float32Array {
  const halfW = (camera.viewportWidth / camera.zoom) / 2;
  const halfH = (camera.viewportHeight / camera.zoom) / 2;
  
  // Column-major 4x4 orthographic projection
  return mat4.ortho(
    camera.x - halfW,  // left
    camera.x + halfW,  // right
    camera.y - halfH,  // bottom
    camera.y + halfH,  // top
    -1, 1              // near, far
  );
}
```

### 3. World & Map Data Structure

**Asset Layout**:
```
public/worlds/world1/
  world.xml                  # world definition + map placements
  maps/map1/
    map.xml                  # map metadata (title, dimensions)
    foreground.png           # RGBA, 512×256
    background.png           # RGBA, 512×256
    sky.png                  # RGB,  512×256
    matter.png               # RGBA, 512×256 (not rendered in Phase 01)
    support.png              # RGBA, 512×256 (not rendered in Phase 01)
```

**XML Formats**:
```xml
<!-- world.xml -->
<world title="World 1" description="Welcome to World 1!">
  <map path="maps/map1/map.xml" x="0" y="0" />
</world>

<!-- map.xml -->
<map title="Map 1" description="..." width="512" height="256" />
```

**In-Memory Types**:
```typescript
interface World {
  title: string;
  description: string;
  mapPlacements: MapPlacement[];
}

interface MapPlacement {
  path: string;       // relative path to map.xml
  x: number;          // world-space X position
  y: number;          // world-space Y position
  map: GameMap;       // loaded map data
}

interface GameMap {
  title: string;
  width: number;       // map width in pixels (512)
  height: number;      // map height in pixels (256)
  layers: MapLayers;
}

interface MapLayers {
  sky: WebGLTexture | null;
  background: WebGLTexture | null;
  foreground: WebGLTexture | null;
  // matter and support loaded but not rendered in Phase 01
}
```

### 4. Layer Rendering

**Requirements**:
- Render sky as solid color
- Render background image
- Render foreground image
- Proper layer ordering
- Use camera transformation

**Rendering Order** (back to front):
1. Sky (texture from `sky.png`)
2. Background
3. Foreground

**Shader Strategy**:

**World-space quad** — each map is rendered as a quad positioned at its world coordinates. The camera matrix transforms world-space vertices to clip-space. This approach (vs fullscreen quad):
- Enables natural GPU culling when map is outside viewport
- Supports multiple maps at different world positions (future whiteboard)
- Uses same coordinate system as entities (future)

**Vertex Layout**:
```typescript
// Quad corners in world-space for a 512×256 map placed at (mapX, mapY)
const vertices = new Float32Array([
  mapX,           mapY,            // bottom-left
  mapX + 512,     mapY,            // bottom-right
  mapX,           mapY + 256,      // top-left
  mapX + 512,     mapY + 256       // top-right
]);
```

**Shaders**:
```glsl
// Vertex Shader
#version 300 es
uniform mat4 u_camera_matrix;
layout(location=0) in vec2 a_position;   // world-space
out vec2 v_world_pos;

void main() {
  v_world_pos = a_position;
  gl_Position = u_camera_matrix * vec4(a_position, 0.0, 1.0);
}

// Fragment Shader
#version 300 es
precision highp float;
in vec2 v_world_pos;
uniform vec2 u_map_size;
uniform sampler2D u_foreground;
uniform sampler2D u_background;
uniform sampler2D u_sky;
out vec4 color;

void main() {
  vec2 uv = v_world_pos / u_map_size;   // normalize to [0,1]

  vec3 sky = texture(u_sky, uv).rgb;
  vec4 bg  = texture(u_background, uv);
  vec4 fg  = texture(u_foreground, uv);

  // Composite back-to-front
  vec3 c = sky;
  c = mix(c, bg.rgb, bg.a);
  c = mix(c, fg.rgb, fg.a);

  color = vec4(c, 1.0);
}
```

### 5. Asset Loading Pipeline

**Requirements**:
- Parse `world.xml` to get map placements
- Parse each `map.xml` to get map metadata
- Load PNG textures and upload to WebGL as textures
- Handle async loading with error reporting
- `preventDefault` on mouse wheel to avoid browser scroll

**Loader API**:
```typescript
async function loadWorld(basePath: string, gl: WebGL2RenderingContext): Promise<World> {
  const worldXml = await fetchAndParseXml(`${basePath}/world.xml`);
  const placements: MapPlacement[] = [];

  for (const entry of worldXml.maps) {
    const mapXml = await fetchAndParseXml(`${basePath}/${entry.path}`);
    const mapDir = basePath + '/' + dirname(entry.path);

    const layers: MapLayers = {
      sky:        await loadTexture(gl, `${mapDir}/sky.png`),
      background: await loadTexture(gl, `${mapDir}/background.png`),
      foreground: await loadTexture(gl, `${mapDir}/foreground.png`),
    };

    placements.push({
      path: entry.path,
      x: entry.x,
      y: entry.y,
      map: { title: mapXml.title, width: mapXml.width, height: mapXml.height, layers },
    });
  }

  return { title: worldXml.title, description: worldXml.description, mapPlacements: placements };
}
```

### 6. Animation Loop

**Requirements**:
- `requestAnimationFrame` loop for smooth camera movement
- Render only when camera state changes (dirty flag) or continuously
- Track frame timing for consistent pan speed

```typescript
function startLoop(render: () => void): () => void {
  let rafId: number;
  const tick = () => {
    render();
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}
```

### 7. Controls

**Pan**:
- Arrow keys: move camera
- Mouse drag: click and drag to pan

**Zoom**:
- Mouse wheel: zoom in/out
- Keep zoom centered on mouse position

**Speed**:
- Pan speed: ~5 pixels per frame (at 1x zoom)
- Zoom speed: 1.1x per wheel notch
- Min zoom: 0.25x
- Max zoom: 4.0x

## Implementation Order

1. **Refactor App.tsx** - Extract WebGL init into separate renderer module
2. **World/Map types** - Define World, MapPlacement, GameMap, MapLayers types
3. **Asset loader** - XML parsing + PNG texture loading pipeline
4. **Camera module** - Implement camera state and matrix building
5. **Layer shader** - Write multi-layer compositing shader (sky texture + bg + fg)
6. **Animation loop** - requestAnimationFrame loop with render dispatch
7. **Renderer integration** - Connect camera, world, and renderer
8. **Controls** - Wire up keyboard and mouse input with preventDefault

## File Structure

```
ui/src/
  renderer/
    WebGLRenderer.ts     # Core WebGL setup and lifecycle
    Camera.ts            # Camera state and transformations
    LayerRenderer.ts     # Multi-layer rendering logic
    shaders.ts           # Vertex and fragment shaders
  world/
    types.ts            # World, MapPlacement, GameMap, MapLayers
    WorldLoader.ts      # XML parsing + PNG texture loading
  controls/
    CameraControls.ts   # Keyboard and mouse input handling
  App.tsx               # Main component (orchestration only)

ui/public/
  worlds/world1/        # Asset directory (already exists)
    world.xml
    maps/map1/
      map.xml
      foreground.png, background.png, sky.png, matter.png, support.png
```

## Success Criteria

- [ ] World and map assets load from XML + PNG files
- [ ] Can see the loaded map with sky, background, and foreground layers
- [ ] Can pan camera with arrow keys and mouse drag
- [ ] Can zoom with mouse wheel
- [ ] Zoom stays centered on mouse cursor
- [ ] Rendering is pixel-perfect (no anti-aliasing)
- [ ] No performance issues at 60 FPS
- [ ] Smooth animation loop (requestAnimationFrame)
- [ ] Proper cleanup on unmount

## Next Phase Preview

**Phase 02** will add:
- Matter layer rendering
- Simple matter visualization (color-coded)
- Pixel-level inspection (hover to see matter type)
- Basic matter editing (paint tool)

---

*Document version: 0.3.0*
*Last updated: 2026-02-23*
