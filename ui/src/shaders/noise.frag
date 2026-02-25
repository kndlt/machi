#version 300 es
precision highp float;

// ─────────────────────────────────────────────────────────────
// Evolving noise field (isotropic + stable)
//
// Produces smooth drifting organic noise with no directional bias.
// Suitable for ecology / foliage / probability fields.
//
// Steps:
//   1. 8-neighbor diffusion (isotropic Laplacian)
//   2. Small stochastic perturbation
//   3. Clamp for stability
//
// ─────────────────────────────────────────────────────────────

in vec2 v_uv;

uniform sampler2D u_prev;
uniform float u_time;
uniform float u_diffusion;     // recommended 0.05
uniform float u_perturbation;  // recommended 0.01

out vec4 out_color;

// ─────────────────────────────────────────────────────────────
// Better isotropic hash
// ─────────────────────────────────────────────────────────────
float hash(vec2 p) {
  p = fract(p * vec2(5.3983, 5.4427));
  p += dot(p, p + 33.333);
  return fract(p.x * p.y);
}

void main() {

  vec2 texSize = vec2(textureSize(u_prev, 0));
  vec2 texel = 1.0 / texSize;

  // Integer pixel coordinates (important for stable hash)
  vec2 pixel = floor(v_uv * texSize);

  // Current value
  float c = texture(u_prev, v_uv).r;

  // 4 neighbors
  float r = texture(u_prev, v_uv + vec2( texel.x, 0.0)).r;
  float l = texture(u_prev, v_uv + vec2(-texel.x, 0.0)).r;
  float u = texture(u_prev, v_uv + vec2(0.0,  texel.y)).r;
  float d = texture(u_prev, v_uv + vec2(0.0, -texel.y)).r;

  // Diagonals
  float ur = texture(u_prev, v_uv + texel).r;
  float ul = texture(u_prev, v_uv + vec2(-texel.x, texel.y)).r;
  float dr = texture(u_prev, v_uv + vec2(texel.x, -texel.y)).r;
  float dl = texture(u_prev, v_uv - texel).r;

  // Isotropic weighted average
  float neighborAvg =
      (r + l + u + d) * 0.2 +
      (ur + ul + dr + dl) * 0.05;

  // Diffusion
  float diffused = mix(c, neighborAvg, u_diffusion);

  // Small stochastic perturbation
  float n = hash(pixel + u_time);
  float nudge = (n * 2.0 - 1.0) * u_perturbation;

  float result = diffused + nudge;

  // Stability clamp
  result = clamp(result, 0.0, 1.0);

  out_color = vec4(result, 0.0, 0.0, 1.0);
}