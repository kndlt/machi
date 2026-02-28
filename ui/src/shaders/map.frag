#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_sky;
uniform sampler2D u_background;
uniform sampler2D u_foreground;
uniform sampler2D u_support;
uniform sampler2D u_matter;
uniform sampler2D u_foliage;
uniform sampler2D u_branch_tex2;
uniform sampler2D u_noise;
uniform sampler2D u_light;
uniform int u_view_mode;       // 0=visual, 1=matter, 2=segmentation, 3=foliage,
                               // 4=branch-R(tree-id), 5=branch-dir(decoded),
                               // 6=branch-err(decoded), 7=branch-A(alpha), 8=noise,
                               // 9=directional-light(debug), 10=branch-inhibition(B), 11=resource(branchTex2.G)
uniform int u_foliage_enabled; // 1 = show foliage layer, 0 = hide
uniform int u_outline_enabled; // 1 = show foliage outline, 0 = hide

out vec4 out_color;

// Outline color: darker green for foliage edges
const vec3 OUTLINE_COLOR = vec3(0.15, 0.30, 0.10);
const vec3 ROOT_OUTLINE_COLOR = vec3(0.0f);

// Foliage visual colors — mapped from energy level
const vec3 FOLIAGE_LUSH  = vec3(0.30, 0.55, 0.20); // high energy: vibrant green
const vec3 FOLIAGE_WEAK  = vec3(0.50, 0.45, 0.15); // low energy: yellow-brown

// Heatmap colors for data visualization modes
const vec3 HUE_BRANCH_R  = vec3(1.0, 0.31, 0.08);   // tree ID (R)
const vec3 HUE_BRANCH_B  = vec3(0.24, 0.55, 1.0);   // error accumulator (decoded)
const vec3 HUE_BRANCH_A  = vec3(1.0, 1.0, 1.0);     // alpha (A)
const vec3 HUE_INHIBITION = vec3(1.0, 0.2, 0.65);   // inhibition (B)
const vec3 HUE_NOISE     = vec3(0.71, 0.47, 1.0);   // purple
const vec3 ROOT_SUBTLE_TINT = vec3(0.32, 0.40, 0.52);
const vec3 DIRT_REF_COLOR = vec3(0.404, 0.322, 0.294);
const float DIRT_COLOR_THRESHOLD = 0.12;
const vec3 DEBUG_DARK_DIRT_TINT = vec3(0.22, 0.32, 0.22);
const float DEBUG_DARK_DIRT_LUMA = 0.28;
const vec3 HEAT_COLD = vec3(0.05, 0.10, 0.45);
const vec3 HEAT_MID_LOW = vec3(0.00, 0.75, 1.00);
const vec3 HEAT_MID_HIGH = vec3(1.00, 0.95, 0.10);
const vec3 HEAT_HOT = vec3(0.95, 0.10, 0.05);

vec3 hueWheel(float t) {
  float r = abs(t * 6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(t * 6.0 - 2.0);
  float b = 2.0 - abs(t * 6.0 - 4.0);
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

vec3 heatMap(float t) {
  float x = clamp(t, 0.0, 1.0);
  if (x < 0.35) {
    float k = x / 0.35;
    return mix(HEAT_COLD, HEAT_MID_LOW, k);
  }
  if (x < 0.65) {
    float k = (x - 0.35) / 0.30;
    return mix(HEAT_MID_LOW, HEAT_MID_HIGH, k);
  }
  float k = (x - 0.65) / 0.35;
  return mix(HEAT_MID_HIGH, HEAT_HOT, k);
}

float unpackDirFromPacked(float packedDirErr) {
  float packed = floor(clamp(packedDirErr, 0.0, 1.0) * 255.0 + 0.5);
  float dirQ = floor(packed / 8.0);
  return dirQ / 32.0;
}

float unpackErrFromPacked(float packedDirErr) {
  float packed = floor(clamp(packedDirErr, 0.0, 1.0) * 255.0 + 0.5);
  float errQ = mod(packed, 8.0);
  return errQ / 7.0;
}

float unpackNibble(vec4 packed, int dir) {
  vec4 bytes = floor(packed * 255.0 + 0.5);
  float b;
  if (dir == 0 || dir == 1) b = bytes.r;
  else if (dir == 2 || dir == 3) b = bytes.g;
  else if (dir == 4 || dir == 5) b = bytes.b;
  else b = bytes.a;

  float nibble = mod(floor(b / (dir % 2 == 0 ? 1.0 : 16.0)), 16.0);
  return nibble / 15.0;
}

bool isRootCell(vec2 uv) {
  vec4 meta = texture(u_branch_tex2, uv);
  float packed = floor(clamp(meta.r, 0.0, 1.0) * 255.0 + 0.5);
  float typeNibble = mod(packed, 16.0);
  return typeNibble == 1.0;
}

bool isDirtMatter(vec4 m) {
  return m.a > 0.5 && distance(m.rgb, DIRT_REF_COLOR) < DIRT_COLOR_THRESHOLD;
}

// Convert foliage resource channels to visual color
vec3 foliageColor(vec4 fol) {
  return mix(FOLIAGE_WEAK, FOLIAGE_LUSH, clamp(fol.a, 0.0, 1.0));
}

// Check if a pixel is an outline for branch neighbors.
bool isFoliageOutline(sampler2D folTex, vec2 uv, vec2 ts) {
  if (texture(folTex, uv).a > 0.05) return false; // is foliage → not outline (we want outset)

  // Check 4 neighbors, but only outline around branch cells (not roots).
  vec2 n0 = uv + vec2( ts.x, 0.0);
  vec2 n1 = uv + vec2(-ts.x, 0.0);
  vec2 n2 = uv + vec2(0.0,  ts.y);
  vec2 n3 = uv + vec2(0.0, -ts.y);

  vec4 f0 = texture(folTex, n0);
  if (f0.a > 0.05 && !isRootCell(n0)) return true;
  vec4 f1 = texture(folTex, n1);
  if (f1.a > 0.05 && !isRootCell(n1)) return true;
  vec4 f2 = texture(folTex, n2);
  if (f2.a > 0.05 && !isRootCell(n2)) return true;
  vec4 f3 = texture(folTex, n3);
  if (f3.a > 0.05 && !isRootCell(n3)) return true;

  return false;
}

// Check if a pixel is an outline for root neighbors.
bool isRootOutline(sampler2D folTex, vec2 uv, vec2 ts) {
  if (texture(folTex, uv).a > 0.05) return false;

  vec2 n0 = uv + vec2( ts.x, 0.0);
  vec2 n1 = uv + vec2(-ts.x, 0.0);
  vec2 n2 = uv + vec2(0.0,  ts.y);
  vec2 n3 = uv + vec2(0.0, -ts.y);

  vec4 f0 = texture(folTex, n0);
  if (f0.a > 0.05 && isRootCell(n0)) return true;
  vec4 f1 = texture(folTex, n1);
  if (f1.a > 0.05 && isRootCell(n1)) return true;
  vec4 f2 = texture(folTex, n2);
  if (f2.a > 0.05 && isRootCell(n2)) return true;
  vec4 f3 = texture(folTex, n3);
  if (f3.a > 0.05 && isRootCell(n3)) return true;

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
      vec3 fColor = foliageColor(fol);
      if (isRootCell(uv)) {
        out_color = vec4(mix(vec3(0.0), mix(fColor, ROOT_SUBTLE_TINT, 0.7), 0.35), 1.0);
      } else {
        out_color = vec4(fColor, 1.0);
      }
    } else if (u_outline_enabled == 1 && isFoliageOutline(u_foliage, uv, folTexelSize)) {
      out_color = vec4(OUTLINE_COLOR, 1.0); // branch outline
    } else if (u_outline_enabled == 1 && isRootOutline(u_foliage, uv, folTexelSize)) {
      out_color = vec4(ROOT_OUTLINE_COLOR, 1.0); // subtle root outline
    } else {
      out_color = vec4(0.0);
    }
    return;
  }

  // ── Data visualization modes (4–11) ─────────────────────────────────────
  // Show branch-map channels and diagnostics.
  // Background = composited world; branch pixels = channel value visualization.
  if (u_view_mode >= 4 && u_view_mode <= 11) {
    // Base = full visual composite (including foliage), then dim for contrast.
    vec3 sky = texture(u_sky, uv).rgb;
    vec3 base = sky;
    base = mix(base, bg.rgb, bg.a);
    base = mix(base, sp.rgb, sp.a);
    base = mix(base, fg.rgb, fg.a);
    vec4 fol = texture(u_foliage, uv);
    if (u_foliage_enabled == 1) {
      if (fol.a > 0.05) {
        vec3 fColor = foliageColor(fol);
        if (isRootCell(uv)) {
          vec3 subtleRoot = mix(fColor, ROOT_SUBTLE_TINT, 0.7);
          base = mix(base, subtleRoot, 0.28);
        } else {
          base = mix(base, fColor, 1.0);
        }
      } else if (u_outline_enabled == 1 && isFoliageOutline(u_foliage, uv, folTexelSize)) {
        base = mix(base, OUTLINE_COLOR, 1.0);
      } else if (u_outline_enabled == 1 && isRootOutline(u_foliage, uv, folTexelSize)) {
        base = mix(base, ROOT_OUTLINE_COLOR, 0.45);
      }
    }

    vec4 m = texture(u_matter, uv);
    if (isDirtMatter(m)) {
      float luma = dot(base, vec3(0.299, 0.587, 0.114));
      if (luma < DEBUG_DARK_DIRT_LUMA) {
        base = mix(base, DEBUG_DARK_DIRT_TINT, 0.45);
      }
    }

    base *= 0.3; // dim

    if (u_view_mode == 8) {
      // Noise: show everywhere (it's a spatial field, not just foliage)
      float val = texture(u_noise, uv).r;
      vec3 c = HUE_NOISE * val;
      // Blend over dimmed base
      out_color = vec4(mix(base, c, 0.8), 1.0);
      return;
    }

    if (u_view_mode == 9) {
      // Directional light debug (grayscale):
      // decode all 8 directional bands and visualize total normalized energy.
      vec4 packed = texture(u_light, uv);
      float up = unpackNibble(packed, 0);
      float upRight = unpackNibble(packed, 1);
      float right = unpackNibble(packed, 2);
      float downRight = unpackNibble(packed, 3);
      float down = unpackNibble(packed, 4);
      float downLeft = unpackNibble(packed, 5);
      float left = unpackNibble(packed, 6);
      float upLeft = unpackNibble(packed, 7);

      float totalEnergy = (up + upRight + right + downRight + down + downLeft + left + upLeft) / 8.0;
      out_color = vec4(vec3(totalEnergy), 1.0);
      return;
    }

    if (u_view_mode == 10) {
      float val = texture(u_foliage, uv).b;
      vec3 c = HUE_INHIBITION * val;
      out_color = vec4(mix(base, c, val * 0.9), 1.0);
      return;
    }

    if (u_view_mode == 11) {
      float resourceByte = floor(clamp(texture(u_branch_tex2, uv).g, 0.0, 1.0) * 255.0 + 0.5);
      float signedResource = resourceByte - 127.0;
      float mag = min(abs(signedResource) / 127.0, 1.0);
      float t = clamp((signedResource + 127.0) / 254.0, 0.0, 1.0);
      vec3 heat = heatMap(t);
      float isBranchOrRoot = step(0.05, fol.a);
      float backgroundBaseBlend = min(0.90, 0.20 + 0.70 * sqrt(mag));
      float dirtBlendScale = isDirtMatter(m) ? 0.75 : 0.30;
      float backgroundBlend = backgroundBaseBlend * dirtBlendScale;
      float blend = mix(backgroundBlend, 1.0, isBranchOrRoot);
      out_color = vec4(mix(base, heat, blend), 1.0);
      return;
    }

    if (fol.a > 0.05) {
      if (u_view_mode == 5) {
        // Branch direction decoded from packed channel (G) as cyclic hue wheel.
        out_color = vec4(hueWheel(fract(unpackDirFromPacked(fol.g))), 1.0);
      } else {
        float val;
        vec3 hue;
        if (u_view_mode == 4) {
          out_color = vec4(hueWheel(fract(fol.r * 255.0 * 0.61803398875)), 1.0);
          return;
        }
        else if (u_view_mode == 6) { val = unpackErrFromPacked(fol.g); hue = HUE_BRANCH_B; }
        else                       { val = fol.a; hue = HUE_BRANCH_A; } // mode 7
        out_color = vec4(hue * val, 1.0);
      }
    } else {
      out_color = vec4(base, 1.0);
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
    
    if (fol.a > 0.05) {
      vec3 fColor = foliageColor(fol);
      if (isRootCell(uv)) {
        vec3 subtleRoot = mix(fColor, ROOT_SUBTLE_TINT, 0.7);
        c = mix(c, subtleRoot, 0.28);
      } else {
        c = mix(c, fColor, 1.0);
      }
    } else if (u_outline_enabled == 1 && isFoliageOutline(u_foliage, uv, folTexelSize)) {
      c = mix(c, OUTLINE_COLOR, 1.0);
    } else if (u_outline_enabled == 1 && isRootOutline(u_foliage, uv, folTexelSize)) {
      c = mix(c, ROOT_OUTLINE_COLOR, 0.45);
    }
  }

  out_color = vec4(c, 1.0);
}
