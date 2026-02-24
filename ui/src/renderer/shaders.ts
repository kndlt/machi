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
uniform int u_view_mode;       // 0 = visual, 1 = matter, 2 = segmentation
uniform int u_foliage_enabled; // 1 = show foliage layer, 0 = hide

out vec4 out_color;

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

  // Visual mode: composite back-to-front
  vec3 sky = texture(u_sky, uv).rgb;
  vec3 c = sky;
  c = mix(c, bg.rgb, bg.a);
  c = mix(c, sp.rgb, sp.a);
  c = mix(c, fg.rgb, fg.a);

  // Composite foliage layer on top of foreground
  if (u_foliage_enabled == 1) {
    vec4 fol = texture(u_foliage, uv);
    c = mix(c, fol.rgb, fol.a);
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
 * IN:  all layer textures (sky, bg, fg, support, matter) + previous foliage
 * OUT: new foliage RGBA
 *
 * Rule: air pixel (in matter) with dirt directly below → green foliage pixel.
 * Note: textures are in PNG orientation (top-left origin), no Y-flip needed
 * because simulation works entirely in texture space.
 */
export const SIM_FOLIAGE_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_matter;
uniform sampler2D u_foliage_prev;

out vec4 out_color;

// Dirt matter color: (103, 82, 75) / 255
const vec3 DIRT_COLOR = vec3(0.404, 0.322, 0.294);
const float DIRT_THRESHOLD = 0.12;

// Foliage rendering color
const vec4 FOLIAGE_RGBA = vec4(0.30, 0.52, 0.22, 1.0);

bool isDirt(vec4 m) {
  return m.a > 0.5 && distance(m.rgb, DIRT_COLOR) < DIRT_THRESHOLD;
}

bool isAir(vec4 m) {
  return m.a < 0.1;
}

void main() {
  vec4 mHere = texture(u_matter, v_uv);

  // In PNG/texture space: Y increases downward.
  // "Below in world" = one row down in the image = +texelY.
  vec2 texelSize = 1.0 / vec2(textureSize(u_matter, 0));
  vec4 mBelow = texture(u_matter, v_uv + vec2(0.0, texelSize.y));

  if (isAir(mHere) && isDirt(mBelow)) {
    out_color = FOLIAGE_RGBA;
  } else {
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
