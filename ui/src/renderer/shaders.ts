/** GLSL 300 ES shaders for layer compositing */

export const LAYER_VERTEX = `#version 300 es
uniform mat4 u_camera_matrix;
layout(location=0) in vec2 a_position;  // world-space
out vec2 v_uv;

uniform vec2 u_map_origin;  // world-space origin of this map placement
uniform vec2 u_map_size;    // map width/height in pixels

void main() {
  // Compute UV from the quad vertex relative to map origin
  v_uv = (a_position - u_map_origin) / u_map_size;
  gl_Position = u_camera_matrix * vec4(a_position, 0.0, 1.0);
}
`;

export const LAYER_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_sky;
uniform sampler2D u_background;
uniform sampler2D u_foreground;
uniform sampler2D u_support;
uniform sampler2D u_matter;
uniform sampler2D u_foliage;
uniform int u_view_mode;       // 0 = visual, 1 = matter, 2 = segmentation, 3 = foliage
uniform int u_foliage_enabled; // 1 = show foliage layer, 0 = hide
uniform int u_outline_enabled; // 1 = show foliage outline, 0 = hide

out vec4 out_color;

// Outline color: darker green for foliage edges
const vec3 OUTLINE_COLOR = vec3(0.15, 0.30, 0.10);

// Check if a pixel is an outline (it has no foliage itself, but has a foliage neighbor)
bool isFoliageOutline(sampler2D folTex, vec2 uv, vec2 ts) {
  if (texture(folTex, uv).a > 0.05) return false; // is foliage → not outline (we want outset)
  
  // Check 4 neighbors
  if (texture(folTex, uv + vec2( ts.x, 0.0)).a > 0.05) return true;
  if (texture(folTex, uv + vec2(-ts.x, 0.0)).a > 0.05) return true;
  if (texture(folTex, uv + vec2(0.0,  ts.y)).a > 0.05) return true;
  if (texture(folTex, uv + vec2(0.0, -ts.y)).a > 0.05) return true;
  return false;
}

void main() {
  // Flip V: PNG top-left origin → OpenGL bottom-left origin
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);

  if (u_view_mode == 1) {
    // Matter view
    vec4 m = texture(u_matter, uv);
    out_color = vec4(m.rgb, 1.0);
    return;
  }

  vec4 bg  = texture(u_background, uv);
  vec4 fg  = texture(u_foreground, uv);
  vec4 sp  = texture(u_support, uv);

  if (u_view_mode == 2) {
    // Segmentation view: color-code which layer the pixel comes from
    vec3 segColor;
    if (fg.a > 0.5) {
      segColor = vec3(0.2, 0.8, 0.2);   // green = foreground
    } else if (sp.a > 0.5) {
      segColor = vec3(0.8, 0.2, 0.8);   // magenta = support
    } else if (bg.a > 0.5) {
      segColor = vec3(0.2, 0.5, 0.9);   // blue = background
    } else {
      segColor = vec3(0.3, 0.3, 0.3);   // gray = sky
    }
    out_color = vec4(segColor, 1.0);
    return;
  }

  // Texel size for foliage edge detection
  vec2 folTexelSize = 1.0 / vec2(textureSize(u_foliage, 0));

  if (u_view_mode == 3) {
    // Foliage-only view
    vec4 fol = texture(u_foliage, uv);
    if (fol.a > 0.05) {
      out_color = vec4(fol.rgb, 1.0);
    } else if (u_outline_enabled == 1 && isFoliageOutline(u_foliage, uv, folTexelSize)) {
      out_color = vec4(OUTLINE_COLOR, 1.0); // Outset outline
    } else {
      out_color = vec4(0.0);
    }
    return;
  }

  // Visual mode: composite back-to-front
  vec3 sky = texture(u_sky, uv).rgb;
  vec3 c = sky;
  c = mix(c, bg.rgb, bg.a);
  c = mix(c, sp.rgb, sp.a);
  c = mix(c, fg.rgb, fg.a);

  // Composite foliage layer on top of foreground
  if (u_foliage_enabled == 1) {
    vec4 fol = texture(u_foliage, uv);
    
    // Draw outline first (behind foliage, or rather "around" it)
    // Since we are checking current pixel, if it's an outline pixel, we draw outline.
    // If it's a foliage pixel, we draw foliage.
    if (fol.a > 0.05) {
      c = mix(c, fol.rgb, fol.a);
    } else if (u_outline_enabled == 1 && isFoliageOutline(u_foliage, uv, folTexelSize)) {
      // Draw outline on non-foliage pixels that are adjacent to foliage
      // We mix with 1.0 alpha because outline is opaque on top of whatever was below
      c = mix(c, OUTLINE_COLOR, 1.0);
    }
  }

  out_color = vec4(c, 1.0);
}
`;

// ── Simulation shaders (fullscreen quad in UV space) ─────────────────────────

/** Vertex shader for simulation passes — fullscreen triangle trick */
export const SIM_VERTEX = `#version 300 es
out vec2 v_uv;
void main() {
  // Fullscreen triangle: vertices 0,1,2 → covers the whole screen
  float x = float((gl_VertexID & 1) << 2);  // 0, 4, 0
  float y = float((gl_VertexID & 2) << 1);  // 0, 0, 4
  v_uv = vec2(x, y) * 0.5;
  gl_Position = vec4(x - 1.0, y - 1.0, 0.0, 1.0);
}
`;

/**
 * Foliage simulation fragment shader.
 *
 * IN:  matter texture + previous foliage state
 * OUT: new foliage RGBA
 *
 * Rules:
 * - Seeding: air pixel near dirt surface → spawn foliage
 * - Growth: air pixel adjacent to existing foliage → spread (with probability)
 * - Decay: foliage too far from dirt or too crowded → die
 * - Dirt tinting: shallow dirt pixels near air get a green tint
 *
 * Uses u_seed for per-step randomness (hash-based pseudo-random).
 */
export const SIM_FOLIAGE_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_matter;
uniform sampler2D u_foliage_prev;
uniform float u_seed;  // stable seed (changes rarely)

out vec4 out_color;

// Dirt matter color: (103, 82, 75) / 255
const vec3 DIRT_COLOR = vec3(0.404, 0.322, 0.294);
const float DIRT_THRESHOLD = 0.12;

// Foliage rendering color
const vec4 FOLIAGE_RGBA = vec4(0.30, 0.52, 0.22, 1.0);

// ── Pseudo-random hash ───────────────────────────────────────────────────
// Standard hash: depends on UV + input seed
float hash(vec2 p, float seed) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031 + seed);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

bool isDirt(vec4 m) {
  return m.a > 0.5 && distance(m.rgb, DIRT_COLOR) < DIRT_THRESHOLD;
}

bool isAir(vec4 m) {
  return m.a < 0.1;
}

bool hasFoliage(vec4 f) {
  return f.a > 0.05;
}

void main() {
  vec4 mHere = texture(u_matter, v_uv);
  vec4 fPrev = texture(u_foliage_prev, v_uv);
  vec2 texelSize = 1.0 / vec2(textureSize(u_matter, 0));
  
  // Stable RNG for survival (prevents flickering)
  float rngStable = hash(v_uv, u_seed);

  // // ── Dirt pixel: tint near-surface dirt ──────────────────────────────────
  // if (isDirt(mHere)) {
  //   float distToAir = 3.0;
  //   for (int i = 1; i <= 2; i++) {
  //     vec4 mAbove = texture(u_matter, v_uv - vec2(0.0, texelSize.y * float(i)));
  //     if (isAir(mAbove)) {
  //       distToAir = float(i);
  //       break;
  //     }
  //   }
  //   if (distToAir <= 2.0) {
  //     float alpha = 0.7 - (distToAir - 1.0) * 0.25;
  //     out_color = vec4(FOLIAGE_RGBA.rgb, alpha);
  //   } else {
  //     out_color = vec4(0.0);
  //   }
  //   return;
  // }

  // ── Non-air, non-dirt: no foliage ──────────────────────────────────────
  if (!isAir(mHere)) {
    out_color = vec4(0.0);
    return;
  }

  // ── Air pixel logic ────────────────────────────────────────────────────

  // Find distance to nearest dirt below (up to 5px)
  float distToDirt = 6.0;
  for (int i = 1; i <= 5; i++) {
    vec4 mBelow = texture(u_matter, v_uv + vec2(0.0, texelSize.y * float(i)));
    if (isDirt(mBelow)) {
      distToDirt = float(i);
      break;
    }
  }

  // Count neighboring foliage (4-connected)
  int neighborCount = 0;
  if (hasFoliage(texture(u_foliage_prev, v_uv + vec2( texelSize.x, 0.0)))) neighborCount++;
  if (hasFoliage(texture(u_foliage_prev, v_uv + vec2(-texelSize.x, 0.0)))) neighborCount++;
  if (hasFoliage(texture(u_foliage_prev, v_uv + vec2(0.0,  texelSize.y)))) neighborCount++;
  if (hasFoliage(texture(u_foliage_prev, v_uv + vec2(0.0, -texelSize.y)))) neighborCount++;

  bool wasAlive = hasFoliage(fPrev);

  if (wasAlive) {
    // ── Survival / decay ─────────────────────────────────────────────────
    // Die if dirt was removed (no dirt within range and no neighbors)
    if (distToDirt > 5.0 && neighborCount == 0) {
      out_color = vec4(0.0);
      return;
    }
    // Overcrowding decay (use STABLE RNG)
    // Only kill if persistently overcrowded.
    if (neighborCount >= 4 && rngStable < 0.05) {
      out_color = vec4(0.0);
      return;
    }
    // Random decay for far pixels (use STABLE RNG)
    if (distToDirt > 3.0 && rngStable < 0.02) {
      out_color = vec4(0.0);
      return;
    }
    // Survive
    out_color = fPrev;
  } else {
    // ── Seeding / growth ─────────────────────────────────────────────────
    // Direct seeding: air right above dirt (use STABLE RNG for fixed seed locations)
    if (distToDirt == 1.0 && rngStable < 0.4) {
      out_color = FOLIAGE_RGBA;
      return;
    }
    // Growth from neighbors: spread if adjacent to existing foliage
    // Use STABLE RNG so growth is deterministic (but may stall if unlucky)
    if (neighborCount >= 1 && distToDirt <= 5.0) {
      // More neighbors = higher chance to grow (0.02 base * count)
      float growChance = (0.52 * float(neighborCount)) / distToDirt;
      if (rngStable < growChance) {
        float alpha = 1.0 - (distToDirt - 1.0) * 0.15;
        out_color = vec4(FOLIAGE_RGBA.rgb, alpha);
        return;
      }
    }
    out_color = vec4(0.0);
  }
}
`;

// ── Shader compilation helpers ───────────────────────────────────────────────

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);

  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }

  // Shaders can be deleted after linking
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  return program;
}
