# World 01 - Phase 01: Foundation

This document outlines the first implementation phase for the World 01 system.

## Goal

Build the minimal rendering foundation:
- Single map rendering with orthographic camera
- Layer-based composition (foreground, background, sky)
- Camera controls (pan, zoom)
- Proper WebGL setup with pixel-perfect rendering

## Out of Scope (Later Phases)

- Virtual texturing / tiled pages
- Matter simulation
- Entity system
- Support layer
- Multiple maps
- Persistence

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

### 3. Map Data Structure

**Requirements**:
- Fixed-size map (e.g., 1024x512 pixels)
- Layer collection
- Simple in-memory representation

**API**:
```typescript
interface Map {
  width: number;       // map width in pixels
  height: number;      // map height in pixels
  layers: Layer[];
}

interface Layer {
  type: 'foreground' | 'background' | 'sky';
  image: HTMLImageElement | HTMLCanvasElement;
  visible: boolean;
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
1. Sky (solid color or gradient)
2. Background
3. Foreground

**Shader Strategy**:

**World-space quad** — each map is rendered as a quad positioned at its world coordinates. The camera matrix transforms world-space vertices to clip-space. This approach (vs fullscreen quad):
- Enables natural GPU culling when map is outside viewport
- Supports multiple maps at different world positions (future whiteboard)
- Uses same coordinate system as entities (future)

**Vertex Layout**:
```typescript
// Quad corners in world-space for a 1024×512 map
const vertices = new Float32Array([
  0,    0,      // bottom-left
  1024, 0,      // bottom-right
  0,    512,    // top-left
  1024, 512     // top-right
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
uniform vec3 u_sky_color;
out vec4 color;

void main() {
  vec2 uv = v_world_pos / u_map_size;   // normalize to [0,1]

  vec4 bg = texture(u_background, uv);
  vec4 fg = texture(u_foreground, uv);

  // Composite back-to-front
  vec3 c = u_sky_color;
  c = mix(c, bg.rgb, bg.a);
  c = mix(c, fg.rgb, fg.a);

  color = vec4(c, 1.0);
}
```

### 5. Test Map Creation

**Requirements**:
- Create a simple test map programmatically
- Sky: solid color (e.g., `#87CEEB`)
- Background: simple pattern or gradient
- Foreground: hand-drawn or procedural platforms

**Example Generation**:
```typescript
function createTestMap(): Map {
  const foreground = createForegroundCanvas();
  const background = createBackgroundCanvas();
  
  return {
    width: 1024,
    height: 512,
    layers: [
      { type: 'sky', image: null, visible: true },
      { type: 'background', image: background, visible: true },
      { type: 'foreground', image: foreground, visible: true }
    ]
  };
}
```

### 6. Controls

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
2. **Camera module** - Implement camera state and controls
3. **Map module** - Define Map and Layer types
4. **Test map generator** - Create simple procedural test content
5. **Layer shader** - Write multi-layer compositing shader
6. **Renderer integration** - Connect camera, map, and renderer
7. **Controls** - Wire up keyboard and mouse input

## File Structure

```
ui/src/
  renderer/
    WebGLRenderer.ts     # Core WebGL setup and lifecycle
    Camera.ts            # Camera state and transformations
    LayerRenderer.ts     # Multi-layer rendering logic
    shaders.ts           # Vertex and fragment shaders
  world/
    Map.ts              # Map and Layer types
    TestMapGenerator.ts # Procedural test map creation
  controls/
    CameraControls.ts   # Keyboard and mouse input handling
  App.tsx               # Main component (orchestration only)
```

## Success Criteria

- [ ] Can see a test map with multiple layers
- [ ] Can pan camera with arrow keys and mouse drag
- [ ] Can zoom with mouse wheel
- [ ] Zoom stays centered on mouse cursor
- [ ] Rendering is pixel-perfect (no anti-aliasing)
- [ ] No performance issues at 60 FPS
- [ ] Proper cleanup on unmount

## Next Phase Preview

**Phase 02** will add:
- Matter layer rendering
- Simple matter visualization (color-coded)
- Pixel-level inspection (hover to see matter type)
- Basic matter editing (paint tool)

---

*Document version: 0.2.0*
*Last updated: 2026-02-22*
