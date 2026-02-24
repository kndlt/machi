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

// Foliage visual colors — mapped from energy level
const vec3 FOLIAGE_LUSH  = vec3(0.30, 0.55, 0.20); // high energy: vibrant green
const vec3 FOLIAGE_WEAK  = vec3(0.50, 0.45, 0.15); // low energy: yellow-brown

// Convert foliage resource channels to visual color
vec3 foliageColor(vec4 fol) {
  float energy = fol.r;
  return mix(FOLIAGE_WEAK, FOLIAGE_LUSH, clamp(energy, 0.0, 1.0));
}

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
    // Foliage-only view (resource channels → visual color)
    vec4 fol = texture(u_foliage, uv);
    if (fol.a > 0.05) {
      out_color = vec4(foliageColor(fol), 1.0);
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
      vec3 fColor = foliageColor(fol);
      c = mix(c, fColor, 1.0);
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
 * OUT: new foliage RGBA where channels encode resources:
 *        R = energy (0–1): combined vitality, determines color/survival
 *        G = nutrients (0–1): supplied by dirt, flows through neighbors
 *        B = light (0–1): supplied from above, blocked by canopy
 *        A = alive flag (> 0 = alive)
 *
 * Growth is constrained by resources:
 * - Nutrients come from dirt and decay with each hop through foliage
 * - Light comes from above and is blocked by foliage canopy
 * - Energy = nutrients * light; pixel dies if energy too low
 * - Growth requires a neighbor with surplus energy to share
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

// ── Resource constants ───────────────────────────────────────────────────
const float NUTRIENT_ROOT = 1.0;       // Max nutrients at dirt contact
const float NUTRIENT_DECAY = 0.15;     // Nutrient loss per hop through foliage
const float LIGHT_FULL = 1.0;          // Full light (no canopy above)
const float LIGHT_BLOCK = 0.2;         // Light lost per foliage pixel above
const float ENERGY_DEATH = 0.05;       // Below this energy → die
const float ENERGY_GROW_MIN = 0.3;     // Neighbor needs this energy to spread
const float GROW_BASE_CHANCE = 0.15;   // Base probability for growth attempt

// ── Pseudo-random hash ───────────────────────────────────────────────────
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

bool hasMatter(vec4 m) {
  return !isAir(m);
}

void main() {
  vec4 mHere = texture(u_matter, v_uv);
  vec4 fPrev = texture(u_foliage_prev, v_uv);
  vec2 texelSize = 1.0 / vec2(textureSize(u_matter, 0));
  
  float rngStable = hash(v_uv, u_seed);

  // ── Not air → no foliage ───────────────────────────────────────────────
  if (!isAir(mHere)) {
    out_color = vec4(0.0);
    return;
  }

  // ── Sample 4 neighbors (matter + foliage) ──────────────────────────────
  vec2 offR = vec2( texelSize.x, 0.0);
  vec2 offL = vec2(-texelSize.x, 0.0);
  vec2 offU = vec2(0.0, -texelSize.y); // up in texture = -Y
  vec2 offD = vec2(0.0,  texelSize.y); // down in texture = +Y

  bool dirtR = hasMatter(texture(u_matter, v_uv + offR));
  bool dirtL = hasMatter(texture(u_matter, v_uv + offL));
  bool dirtU = hasMatter(texture(u_matter, v_uv + offU));
  bool dirtD = hasMatter(texture(u_matter, v_uv + offD));
  bool isTouchingDirt = dirtR || dirtL || dirtU || dirtD;

  vec4 fR = texture(u_foliage_prev, v_uv + offR);
  vec4 fL = texture(u_foliage_prev, v_uv + offL);
  vec4 fU = texture(u_foliage_prev, v_uv + offU);
  vec4 fD = texture(u_foliage_prev, v_uv + offD);

  int foliageNeighbors = 0;
  if (hasFoliage(fR)) foliageNeighbors++;
  if (hasFoliage(fL)) foliageNeighbors++;
  if (hasFoliage(fU)) foliageNeighbors++;
  if (hasFoliage(fD)) foliageNeighbors++;

  // ── Calculate NUTRIENTS ────────────────────────────────────────────────
  // Rooted pixels get full nutrients. Otherwise, take the max from
  // foliage neighbors minus decay (nutrients flow through the network).
  float nutrients = 0.0;
  if (isTouchingDirt) {
    nutrients = NUTRIENT_ROOT;
  } else {
    // Best nutrient supply from any foliage neighbor
    if (hasFoliage(fR)) nutrients = max(nutrients, fR.g - NUTRIENT_DECAY);
    if (hasFoliage(fL)) nutrients = max(nutrients, fL.g - NUTRIENT_DECAY);
    if (hasFoliage(fU)) nutrients = max(nutrients, fU.g - NUTRIENT_DECAY);
    if (hasFoliage(fD)) nutrients = max(nutrients, fD.g - NUTRIENT_DECAY);
    nutrients = max(nutrients, 0.0);
  }

  // ── Calculate LIGHT ────────────────────────────────────────────────────
  // Check how many foliage pixels are above (up to 5). More canopy = less light.
  float light = LIGHT_FULL;
  for (int i = 1; i <= 5; i++) {
    vec4 above = texture(u_foliage_prev, v_uv + vec2(0.0, -texelSize.y * float(i)));
    if (hasFoliage(above)) {
      light -= LIGHT_BLOCK;
    }
    // Stop scanning if we hit matter (ceiling)
    if (hasMatter(texture(u_matter, v_uv + vec2(0.0, -texelSize.y * float(i))))) {
      break;
    }
  }
  light = max(light, 0.0);

  // ── Calculate ENERGY ───────────────────────────────────────────────────
  float energy = nutrients * light;

  bool wasAlive = hasFoliage(fPrev);

  if (wasAlive) {
    // ── Survival ─────────────────────────────────────────────────────────
    // Die if energy too low (starving: no nutrients or no light)
    if (energy < ENERGY_DEATH) {
      out_color = vec4(0.0);
      return;
    }

    // Always survive if touching dirt (roots are permanent)
    if (isTouchingDirt) {
      out_color = vec4(energy, nutrients, light, 1.0);
      return;
    }

    // Isolated (< 2 neighbors) and not rooted → die
    if (foliageNeighbors < 2) {
      out_color = vec4(0.0);
      return;
    }

    // Survive with updated resources
    out_color = vec4(energy, nutrients, light, 1.0);
  } else {
    // ── Growth ───────────────────────────────────────────────────────────
    // 1. Rooting: spawn adjacent to dirt
    if (isTouchingDirt && rngStable < 0.25) {
      out_color = vec4(energy, nutrients, light, 1.0);
      return;
    }

    // 2. Spreading: grow from neighbor with surplus energy
    if (foliageNeighbors >= 1 && energy >= ENERGY_DEATH) {
      // Check if any neighbor has enough energy to support growth
      float maxNeighborEnergy = 0.0;
      if (hasFoliage(fR)) maxNeighborEnergy = max(maxNeighborEnergy, fR.r);
      if (hasFoliage(fL)) maxNeighborEnergy = max(maxNeighborEnergy, fL.r);
      if (hasFoliage(fU)) maxNeighborEnergy = max(maxNeighborEnergy, fU.r);
      if (hasFoliage(fD)) maxNeighborEnergy = max(maxNeighborEnergy, fD.r);

      if (maxNeighborEnergy >= ENERGY_GROW_MIN) {
        float chance = GROW_BASE_CHANCE * (float(foliageNeighbors) * 0.5);
        if (rngStable < chance) {
          out_color = vec4(energy, nutrients, light, 1.0);
          return;
        }
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
