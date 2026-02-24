#version 300 es

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
