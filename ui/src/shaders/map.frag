#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_sky;
uniform sampler2D u_background;
uniform sampler2D u_foreground;
uniform sampler2D u_support;
uniform sampler2D u_matter;
uniform sampler2D u_foliage;
uniform sampler2D u_noise;
uniform sampler2D u_light;
uniform int u_view_mode;       // 0=visual, 1=matter, 2=segmentation, 3=foliage,
                               // 4=branch-R(occupancy), 5=branch-G(direction),
                               // 6=branch-B(mirror), 7=branch-A(alpha), 8=noise,
                               // 9=directional-light(debug)
uniform int u_foliage_enabled; // 1 = show foliage layer, 0 = hide
uniform int u_outline_enabled; // 1 = show foliage outline, 0 = hide

out vec4 out_color;

// Outline color: darker green for foliage edges
const vec3 OUTLINE_COLOR = vec3(0.15, 0.30, 0.10);

// Foliage visual colors — mapped from energy level
const vec3 FOLIAGE_LUSH  = vec3(0.30, 0.55, 0.20); // high energy: vibrant green
const vec3 FOLIAGE_WEAK  = vec3(0.50, 0.45, 0.15); // low energy: yellow-brown

// Heatmap colors for data visualization modes
const vec3 HUE_BRANCH_R  = vec3(1.0, 0.31, 0.08);   // occupancy (R)
const vec3 HUE_BRANCH_B  = vec3(0.24, 0.55, 1.0);   // mirror (B)
const vec3 HUE_BRANCH_A  = vec3(1.0, 1.0, 1.0);     // alpha (A)
const vec3 HUE_NOISE     = vec3(0.71, 0.47, 1.0);   // purple

vec3 hueWheel(float t) {
  float r = abs(t * 6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(t * 6.0 - 2.0);
  float b = 2.0 - abs(t * 6.0 - 4.0);
  return clamp(vec3(r, g, b), 0.0, 1.0);
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

  // ── Data visualization modes (4–9) ──────────────────────────────────────
  // Show branch-map channels and diagnostics.
  // Background = composited world; branch pixels = channel value visualization.
  if (u_view_mode >= 4 && u_view_mode <= 9) {
    // Base world composite (dim background for contrast)
    vec3 sky = texture(u_sky, uv).rgb;
    vec3 base = sky;
    base = mix(base, bg.rgb, bg.a);
    base = mix(base, sp.rgb, sp.a);
    base = mix(base, fg.rgb, fg.a);
    base *= 0.3; // dim

    vec4 fol = texture(u_foliage, uv);

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

    if (fol.a > 0.05) {
      if (u_view_mode == 5) {
        // Branch direction (G) as cyclic hue wheel.
        out_color = vec4(hueWheel(fract(fol.g)), 1.0);
      } else {
        float val;
        vec3 hue;
        if (u_view_mode == 4)      { val = fol.r; hue = HUE_BRANCH_R; }
        else if (u_view_mode == 6) { val = fol.b; hue = HUE_BRANCH_B; }
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
      c = mix(c, fColor, 1.0);
    } else if (u_outline_enabled == 1 && isFoliageOutline(u_foliage, uv, folTexelSize)) {
      c = mix(c, OUTLINE_COLOR, 1.0);
    }
  }

  out_color = vec4(c, 1.0);
}
