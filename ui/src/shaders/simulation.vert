#version 300 es

// Fullscreen triangle trick — vertices 0,1,2 cover the whole screen
out vec2 v_uv;

void main() {
  float x = float((gl_VertexID & 1) << 2);  // 0, 4, 0
  float y = float((gl_VertexID & 2) << 1);  // 0, 0, 4
  v_uv = vec2(x, y) * 0.5;
  gl_Position = vec4(x - 1.0, y - 1.0, 0.0, 1.0);
}
