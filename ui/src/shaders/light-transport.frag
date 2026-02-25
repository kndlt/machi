#version 300 es
precision highp float;
precision highp int;

// Directional light transport (MVP)
//
// Single-channel packed field in RGBA8:
//   8 directions × 4 bits = 32 bits total
//   Nibble order:
//     0: UP
//     1: UP_RIGHT
//     2: RIGHT
//     3: DOWN_RIGHT
//     4: DOWN
//     5: DOWN_LEFT
//     6: LEFT
//     7: UP_LEFT
//
// Rules per step:
// - Non-air cell -> 0 in all bands.
// - Air cell on world boundary -> 15 in all bands.
// - Otherwise for each direction band d:
//     band_d(cell) = band_d(source)
//   where source is the adjacent cell in the backward direction (-d),
//   and source must also be air; otherwise 0.

in vec2 v_uv;

uniform sampler2D u_matter;
uniform sampler2D u_light_prev;
uniform vec4 u_boundary_seed;

out vec4 out_color;

bool inBounds(ivec2 p, ivec2 sizePx) {
  return p.x >= 0 && p.y >= 0 && p.x < sizePx.x && p.y < sizePx.y;
}

bool isAir(ivec2 p) {
  vec4 m = texelFetch(u_matter, p, 0);
  return m.a < 0.1;
}

int getNibble(ivec4 bytes, int dirIdx) {
  int channel = dirIdx >> 1;
  int value = bytes[channel];
  if ((dirIdx & 1) == 0) {
    return value & 15;
  }
  return (value >> 4) & 15;
}

ivec4 sampleBytes(sampler2D tex, ivec2 p) {
  vec4 s = texelFetch(tex, p, 0);
  return ivec4(round(s * 255.0));
}

void main() {
  ivec2 sizePx = textureSize(u_matter, 0);
  ivec2 p = ivec2(floor(gl_FragCoord.xy));

  if (!isAir(p)) {
    out_color = vec4(0.0);
    return;
  }

  bool boundaryAir = (p.x == 0 || p.y == 0 || p.x == sizePx.x - 1 || p.y == sizePx.y - 1);
  if (boundaryAir) {
    out_color = u_boundary_seed;
    return;
  }

  ivec2 dirs[8] = ivec2[8](
    ivec2(0, -1),
    ivec2(1, -1),
    ivec2(1, 0),
    ivec2(1, 1),
    ivec2(0, 1),
    ivec2(-1, 1),
    ivec2(-1, 0),
    ivec2(-1, -1)
  );

  int n0 = 0;
  int n1 = 0;
  int n2 = 0;
  int n3 = 0;
  int n4 = 0;
  int n5 = 0;
  int n6 = 0;
  int n7 = 0;

  for (int i = 0; i < 8; i++) {
    ivec2 src = p - dirs[i];
    int value = 0;
    if (inBounds(src, sizePx) && isAir(src)) {
      ivec4 srcBytes = sampleBytes(u_light_prev, src);
      value = getNibble(srcBytes, i);
    }

    if (i == 0) n0 = value;
    else if (i == 1) n1 = value;
    else if (i == 2) n2 = value;
    else if (i == 3) n3 = value;
    else if (i == 4) n4 = value;
    else if (i == 5) n5 = value;
    else if (i == 6) n6 = value;
    else n7 = value;
  }

  ivec4 packed = ivec4(
    (n0 & 15) | ((n1 & 15) << 4),
    (n2 & 15) | ((n3 & 15) << 4),
    (n4 & 15) | ((n5 & 15) << 4),
    (n6 & 15) | ((n7 & 15) << 4)
  );

  out_color = vec4(packed) / 255.0;
}
