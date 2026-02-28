/**
 * gl-utils.ts — Shared WebGL2 helper functions.
 *
 * Pure GL plumbing: texture creation, FBO creation, shader compilation.
 * No domain logic — used by renderer, simulation, and lab code.
 */

// ── Texture & FBO helpers ────────────────────────────────────────────────────

/** Create an RGBA8 texture with NEAREST filtering and CLAMP_TO_EDGE wrapping. */
export function createTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  data: Uint8Array | null = null,
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA8,
    width, height, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, data,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** Create an RGBA8UI integer texture with NEAREST filtering and CLAMP_TO_EDGE wrapping. */
export function createIntegerTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  data: Uint8Array | null = null,
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA8UI,
    width, height, 0,
    gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, data,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** Create a framebuffer with a single color attachment. */
export function createFBO(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
): WebGLFramebuffer {
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D, tex, 0,
  );
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`FBO incomplete: ${status}`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}

// ── Shader compilation helpers ───────────────────────────────────────────────

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
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
  fsSource: string,
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
