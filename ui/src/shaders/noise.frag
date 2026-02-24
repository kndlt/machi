#version 300 es
precision highp float;

// Noise evolution shader.
//
// Slowly evolves a spatially-coherent noise field via:
//   1. Diffusion — blend toward neighbor average
//   2. Perturbation — small hash-based random nudge
//
// The result is a smooth, organic noise gradient that drifts
// over time, used by simulation shaders to control random events.

in vec2 v_uv;

uniform sampler2D u_prev;   // previous noise state
uniform float u_time;        // incrementing time value (for hash variation)

out vec4 out_color;

// ── Tuning ──────────────────────────────────────────────────────────────
const float DIFFUSION_RATE  = 0.05;  // 5% blend toward neighbors per step
const float PERTURBATION    = 0.01;  // ±1% random nudge per step

// ── Hash ────────────────────────────────────────────────────────────────
float hash(vec2 p, float seed) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031 + seed);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 texelSize = 1.0 / vec2(textureSize(u_prev, 0));

  // Current value
  float current = texture(u_prev, v_uv).r;

  // Sample 4 neighbors
  float r = texture(u_prev, v_uv + vec2( texelSize.x, 0.0)).r;
  float l = texture(u_prev, v_uv + vec2(-texelSize.x, 0.0)).r;
  float u = texture(u_prev, v_uv + vec2(0.0,  texelSize.y)).r;
  float d = texture(u_prev, v_uv + vec2(0.0, -texelSize.y)).r;

  float neighborAvg = (r + l + u + d) * 0.25;

  // Diffuse: blend toward neighbor average
  float diffused = mix(current, neighborAvg, DIFFUSION_RATE);

  // Perturb: small hash-based nudge in [-1, 1] range
  float nudge = hash(v_uv, u_time) * 2.0 - 1.0;
  float result = diffused + nudge * PERTURBATION;

  out_color = vec4(clamp(result, 0.0, 1.0), 0.0, 0.0, 1.0);
}
