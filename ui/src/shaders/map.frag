#version 300 es
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
    
    if (fol.a > 0.05) {
      vec3 fColor = foliageColor(fol);
      c = mix(c, fColor, 1.0);
    } else if (u_outline_enabled == 1 && isFoliageOutline(u_foliage, uv, folTexelSize)) {
      c = mix(c, OUTLINE_COLOR, 1.0);
    }
  }

  out_color = vec4(c, 1.0);
}
