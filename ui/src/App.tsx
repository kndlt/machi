import { useEffect, useRef } from "react";
import { Theme } from "@radix-ui/themes";

function initApp(canvas: HTMLCanvasElement): () => void {
  console.log("Initializing app...");

  const gl = canvas.getContext("webgl2", { antialias: false });
  if (!gl) {
    console.error("WebGL2 not supported");
    alert("WebGL2 not supported");
    return () => {};
  }

  // ---------- Triangle geometry ----------
  const positions = new Float32Array([
    0.0, 0.5,    // top
   -0.5, -0.5,   // bottom left
    0.5, -0.5    // bottom right
  ]);

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // ---------- Simple shaders ----------
  const vs = `#version 300 es
  layout(location=0) in vec2 pos;
  void main() {
    gl_Position = vec4(pos, 0.0, 1.0);
  }`;

  const fs = `#version 300 es
  precision highp float;
  out vec4 color;
  void main() {
    color = vec4(1.0, 0.5, 0.2, 1.0); // orange
  }`;

  function compile(type: number, src: string) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("Shader error:", gl.getShaderInfoLog(s));
      throw new Error("Shader compilation failed");
    }
    return s;
  }

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Program error:", gl.getProgramInfoLogin(prog));
    throw new Error("Program linking failed");
  }

  gl.useProgram(prog);

  // ---------- Render function ----------
  const render = () => {
    gl.clearColor(0.1, 0.1, 0.15, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // ---------- Resize ----------
  const resize = () => {
    // Use clientWidth/Height directly for low-res canvas that scales up
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    render();
  };
  window.addEventListener("resize", resize);
  resize();

  console.log("Triangle rendered!");

  // ---------- Cleanup ----------
  return () => {
    window.removeEventListener("resize", resize);
    gl.deleteBuffer(buf);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(prog);
  };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = initApp(canvas);
    return cleanup;
  }, []);

  return (
    <Theme
      appearance="dark"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          imageRendering: "pixelated"
        }}
      />
    </Theme>
  );
}