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
uniform sampler2D u_matter;
uniform int u_show_matter;   // 0 = visual, 1 = matter

out vec4 out_color;

void main() {
  // Flip V: PNG top-left origin → OpenGL bottom-left origin
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);

  if (u_show_matter == 1) {
    vec4 m = texture(u_matter, uv);
    out_color = vec4(m.rgb, 1.0);
    return;
  }

  vec3 sky = texture(u_sky, uv).rgb;
  vec4 bg  = texture(u_background, uv);
  vec4 fg  = texture(u_foreground, uv);

  // Composite back-to-front
  vec3 c = sky;
  c = mix(c, bg.rgb, bg.a);
  c = mix(c, fg.rgb, fg.a);

  out_color = vec4(c, 1.0);
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
