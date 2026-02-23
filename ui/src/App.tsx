import { useEffect, useRef } from "react";
import { Theme } from "@radix-ui/themes";

let initPromise: Promise<() => void> | undefined;

async function initApp(canvas: HTMLCanvasElement): Promise<() => void> {
  console.log("Initializing app...");

  const gl = canvas.getContext("webgl2");
  if (!gl) {
    alert("WebGL2 not supported");
    return () => {};
  }

  // ---------- Resize ----------
  const resize = () => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  window.addEventListener("resize", resize);
  resize();

  // ---------- Fullscreen quad ----------
  const quad = new Float32Array([
    -1,-1,
     1,-1,
    -1, 1,
     1, 1
  ]);

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // ---------- Shaders ----------
  const vs = `#version 300 es
  layout(location=0) in vec2 pos;
  out vec2 uv;
  void main() {
    uv = pos * 0.5 + 0.5;
    gl_Position = vec4(pos,0,1);
  }`;

  const fs = `#version 300 es
  precision highp float;

  in vec2 uv;
  out vec4 color;

  uniform vec2 resolution;
  uniform float time;
  uniform vec2 camera;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
  }

  float dust(vec2 p) {
    vec2 cell = floor(p * 40.0);
    float h = hash(cell);
    float d = length(fract(p*40.0)-0.5);
    return smoothstep(0.02, 0.0, d) * step(0.995, h);
  }

  void main() {
    vec2 world = (uv * resolution + camera) / 200.0;

    float d = dust(world + time * 0.05);

    vec3 bg = vec3(0.05,0.06,0.07);
    vec3 dustColor = vec3(0.8,0.75,0.6);

    vec3 c = bg + dustColor * d;

    color = vec4(c,1.0);
  }
  `;

  function compile(type: number, src: string) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw gl.getShaderInfoLog(s);
    return s;
  }

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);

  gl.useProgram(prog);

  const uRes = gl.getUniformLocation(prog, "resolution");
  const uTime = gl.getUniformLocation(prog, "time");
  const uCam = gl.getUniformLocation(prog, "camera");

  // ---------- Camera ----------
  let camX = 0;
  let camY = 0;

  const handleKeydown = (e: KeyboardEvent) => {
    const s = 20;
    if(e.key==="ArrowLeft") camX -= s;
    if(e.key==="ArrowRight") camX += s;
    if(e.key==="ArrowUp") camY -= s;
    if(e.key==="ArrowDown") camY += s;
  };
  window.addEventListener("keydown", handleKeydown);

  // ---------- Loop ----------
  let animationId: number;
  const frame = (t: number) => {
    gl.useProgram(prog);
    gl.bindVertexArray(vao);

    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, t * 0.001);
    gl.uniform2f(uCam, camX, camY);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    animationId = requestAnimationFrame(frame);
  };

  animationId = requestAnimationFrame(frame);

  // ---------- Cleanup ----------
  return () => {
    cancelAnimationFrame(animationId);
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", handleKeydown);
    gl.deleteBuffer(buf);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(prog);
  };
}

export default function App() {
  console.log("[render] App");

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!initPromise && canvasRef.current) {
      initPromise = initApp(canvasRef.current);
    }
    return () => {
      initPromise?.then(cleanup => cleanup());
      initPromise = undefined;
    };
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
          display: "block"
        }}
      />
    </Theme>
  );
}