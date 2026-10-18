import React, { useEffect, useRef, useState } from 'react';

interface FrameInterpolatorProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  isEnabled: boolean;
  mode?: 'optical_flow' | 'temporal_blend';
  isAudioFile?: boolean;
  is360Mode?: boolean;
  videoSrc?: string;
  targetWidth: string;
  targetHeight: string;
  objectFitMode: string;
  transformStyle: string;
  filterStyle: string;
  borderRadius?: string;
  boxShadow?: string;
  onActiveChange?: (active: boolean) => void;
}

const VERTEX_SHADER_SRC = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER_SRC = `
  precision mediump float;
  varying vec2 v_texCoord;

  uniform sampler2D u_currTexture;
  uniform sampler2D u_prevTexture;
  uniform float u_blendFactor;
  uniform int u_mode; // 0: Optical Flow, 1: Temporal Blend
  uniform vec2 u_resolution;
  uniform float u_motionStrength;

  float rgb2luma(vec3 rgb) {
    return dot(rgb, vec3(0.299, 0.587, 0.114));
  }

  void main() {
    vec2 uv = v_texCoord;

    if (u_mode == 1) {
      // Pure Temporal Blend
      vec4 prevCol = texture2D(u_prevTexture, uv);
      vec4 currCol = texture2D(u_currTexture, uv);
      gl_FragColor = mix(prevCol, currCol, u_blendFactor);
      return;
    }

    // Optical Flow Shader (Lucas-Kanade / Gradient-based)
    vec2 texel = 1.0 / u_resolution;
    float I_curr = rgb2luma(texture2D(u_currTexture, uv).rgb);
    float I_prev = rgb2luma(texture2D(u_prevTexture, uv).rgb);
    float It = I_curr - I_prev;

    // Spatial gradients
    float I_curr_x1 = rgb2luma(texture2D(u_currTexture, uv + vec2(texel.x, 0.0)).rgb);
    float I_curr_x0 = rgb2luma(texture2D(u_currTexture, uv - vec2(texel.x, 0.0)).rgb);
    float I_curr_y1 = rgb2luma(texture2D(u_currTexture, uv + vec2(0.0, texel.y)).rgb);
    float I_curr_y0 = rgb2luma(texture2D(u_currTexture, uv - vec2(0.0, texel.y)).rgb);

    float Ix = (I_curr_x1 - I_curr_x0) * 0.5;
    float Iy = (I_curr_y1 - I_curr_y0) * 0.5;

    vec2 grad = vec2(Ix, Iy);
    float gradMagSq = dot(grad, grad) + 0.003; // Regularization epsilon

    // Motion velocity vector
    vec2 velocity = - (It * grad) / gradMagSq;

    // Limit maximum displacement to prevent warping/jello artifacts
    float maxDisplace = 14.0;
    velocity = clamp(velocity, -maxDisplace, maxDisplace) * texel * u_motionStrength;

    // Detect hard scene cuts or sudden flash: fade out optical flow warp to pure blend
    float sceneCutFactor = smoothstep(0.4, 0.12, abs(It));

    vec2 warpPrev = clamp(uv + velocity * u_blendFactor * sceneCutFactor, vec2(0.001), vec2(0.999));
    vec2 warpCurr = clamp(uv - velocity * (1.0 - u_blendFactor) * sceneCutFactor, vec2(0.001), vec2(0.999));

    vec4 colPrev = texture2D(u_prevTexture, warpPrev);
    vec4 colCurr = texture2D(u_currTexture, warpCurr);

    gl_FragColor = mix(colPrev, colCurr, u_blendFactor);
  }
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('WebGL shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function initTexture(gl: WebGLRenderingContext): WebGLTexture | null {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Single pixel transparent placeholder
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

export const FrameInterpolator: React.FC<FrameInterpolatorProps> = ({
  videoRef,
  isPlaying,
  isEnabled,
  mode = 'optical_flow',
  isAudioFile,
  is360Mode,
  videoSrc,
  targetWidth,
  targetHeight,
  objectFitMode,
  transformStyle,
  filterStyle,
  borderRadius,
  boxShadow,
  onActiveChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasError, setHasError] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // WebGL references
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const texCurrRef = useRef<WebGLTexture | null>(null);
  const texPrevRef = useRef<WebGLTexture | null>(null);
  const uniformLocsRef = useRef<{
    currTex: WebGLUniformLocation | null;
    prevTex: WebGLUniformLocation | null;
    blendFactor: WebGLUniformLocation | null;
    mode: WebGLUniformLocation | null;
    resolution: WebGLUniformLocation | null;
    motionStrength: WebGLUniformLocation | null;
  }>({ currTex: null, prevTex: null, blendFactor: null, mode: null, resolution: null, motionStrength: null });

  // Frame timing refs
  const lastFrameWallTimeRef = useRef<number>(0);
  const frameDurationRef = useRef<number>(33.33); // default ~30fps
  const lastMediaTimeRef = useRef<number>(-1);
  const animFrameIdRef = useRef<number | null>(null);
  const rvfcIdRef = useRef<number | null>(null);
  const hasUploadedFrameRef = useRef<boolean>(false);

  const shouldBeActive = isEnabled && !isAudioFile && !is360Mode && !!videoSrc && !hasError;

  useEffect(() => {
    onActiveChange?.(shouldBeActive && isReady);
  }, [shouldBeActive, isReady, onActiveChange]);

  // Initialize WebGL context
  useEffect(() => {
    if (!isEnabled || isAudioFile || is360Mode || !videoSrc) {
      setIsReady(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    }) || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) {
      console.warn('WebGL not supported for FrameInterpolator');
      setHasError(true);
      return;
    }

    glRef.current = gl;

    const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);

    if (!vs || !fs) {
      setHasError(true);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      setHasError(true);
      return;
    }

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('WebGL Program link error:', gl.getProgramInfoLog(program));
      setHasError(true);
      return;
    }

    programRef.current = program;

    // Setup Quad geometry
    // Map top-left to top-left of video without needing unpack flip
    const quadVertices = new Float32Array([
      // pos: x, y,   texCoord: u, v
      -1.0,  1.0,   0.0, 0.0, // Top-left
      -1.0, -1.0,   0.0, 1.0, // Bottom-left
       1.0,  1.0,   1.0, 0.0, // Top-right
       1.0,  1.0,   1.0, 0.0, // Top-right
      -1.0, -1.0,   0.0, 1.0, // Bottom-left
       1.0, -1.0,   1.0, 1.0, // Bottom-right
    ]);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, 'a_position');
    const aTexCoord = gl.getAttribLocation(program, 'a_texCoord');

    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 4 * 4, 0);

    gl.enableVertexAttribArray(aTexCoord);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 4 * 4, 2 * 4);

    uniformLocsRef.current = {
      currTex: gl.getUniformLocation(program, 'u_currTexture'),
      prevTex: gl.getUniformLocation(program, 'u_prevTexture'),
      blendFactor: gl.getUniformLocation(program, 'u_blendFactor'),
      mode: gl.getUniformLocation(program, 'u_mode'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      motionStrength: gl.getUniformLocation(program, 'u_motionStrength'),
    };

    // Textures
    texCurrRef.current = initTexture(gl);
    texPrevRef.current = initTexture(gl);

    setIsReady(true);
    setHasError(false);

    return () => {
      setIsReady(false);
      if (gl) {
        if (texCurrRef.current) gl.deleteTexture(texCurrRef.current);
        if (texPrevRef.current) gl.deleteTexture(texPrevRef.current);
        if (program) gl.deleteProgram(program);
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
        if (vbo) gl.deleteBuffer(vbo);
      }
      glRef.current = null;
      programRef.current = null;
      texCurrRef.current = null;
      texPrevRef.current = null;
    };
  }, [isEnabled, isAudioFile, is360Mode, videoSrc]);

  // Main Render & Video Tracking Loop
  useEffect(() => {
    if (!shouldBeActive || !isReady) {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (rvfcIdRef.current && videoRef.current && typeof (videoRef.current as any).cancelVideoFrameCallback === 'function') {
        (videoRef.current as any).cancelVideoFrameCallback(rvfcIdRef.current);
      }
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const gl = glRef.current;
    const program = programRef.current;
    if (!video || !canvas || !gl || !program) return;

    let isActive = true;

    const uploadCurrentFrame = () => {
      if (!video || video.readyState < 2 || !gl) return;

      try {
        // Match internal canvas resolution to video resolution
        const vw = Math.min(video.videoWidth || 1280, 1920);
        const vh = Math.min(video.videoHeight || 720, 1080);
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
          gl.viewport(0, 0, vw, vh);
        }

        // Swap ping-pong textures: current becomes previous
        const temp = texPrevRef.current;
        texPrevRef.current = texCurrRef.current;
        texCurrRef.current = temp;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texCurrRef.current);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

        // If this is first frame, copy to previous too so blend starts clean
        if (!hasUploadedFrameRef.current) {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, texPrevRef.current);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
          hasUploadedFrameRef.current = true;
        }
      } catch (err) {
        // SecurityError in case of cross-origin without CORS
        console.warn('CORS or security error uploading video frame to WebGL:', err);
        setHasError(true);
      }
    };

    const drawFrame = (blendFactor: number) => {
      if (!gl || !program || !texCurrRef.current || !texPrevRef.current) return;

      gl.useProgram(program);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texCurrRef.current);
      if (uniformLocsRef.current.currTex) gl.uniform1i(uniformLocsRef.current.currTex, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texPrevRef.current);
      if (uniformLocsRef.current.prevTex) gl.uniform1i(uniformLocsRef.current.prevTex, 1);

      if (uniformLocsRef.current.blendFactor) gl.uniform1f(uniformLocsRef.current.blendFactor, blendFactor);
      if (uniformLocsRef.current.mode) gl.uniform1i(uniformLocsRef.current.mode, mode === 'optical_flow' ? 0 : 1);
      if (uniformLocsRef.current.resolution) gl.uniform2f(uniformLocsRef.current.resolution, canvas.width, canvas.height);
      if (uniformLocsRef.current.motionStrength) gl.uniform1f(uniformLocsRef.current.motionStrength, 1.0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    // Callback when native video presents a new frame
    const onVideoFramePresented = (now: DOMHighResTimeStamp, metadata?: any) => {
      if (!isActive) return;

      const mediaTime = metadata?.mediaTime ?? video.currentTime;
      const wallTime = performance.now();

      if (mediaTime !== lastMediaTimeRef.current) {
        const delta = wallTime - lastFrameWallTimeRef.current;
        if (delta >= 12 && delta <= 100) {
          // Smooth adaptive estimation of native video frame rate (e.g. 41.7ms for 24fps)
          frameDurationRef.current = frameDurationRef.current * 0.65 + delta * 0.35;
        }
        lastFrameWallTimeRef.current = wallTime;
        lastMediaTimeRef.current = mediaTime;
        uploadCurrentFrame();
      }

      if (typeof (video as any).requestVideoFrameCallback === 'function') {
        rvfcIdRef.current = (video as any).requestVideoFrameCallback(onVideoFramePresented);
      }
    };

    // Register RVFC if available
    if (typeof (video as any).requestVideoFrameCallback === 'function') {
      rvfcIdRef.current = (video as any).requestVideoFrameCallback(onVideoFramePresented);
    }

    // Interpolation Animation Loop (runs at display refresh rate e.g. 60Hz - 144Hz)
    const animateInterpolation = () => {
      if (!isActive) return;

      // Fallback check if requestVideoFrameCallback is not available
      if (typeof (video as any).requestVideoFrameCallback !== 'function') {
        const mediaTime = video.currentTime;
        if (mediaTime !== lastMediaTimeRef.current && !video.paused) {
          const wallTime = performance.now();
          const delta = wallTime - lastFrameWallTimeRef.current;
          if (delta >= 12 && delta <= 100) {
            frameDurationRef.current = frameDurationRef.current * 0.65 + delta * 0.35;
          }
          lastFrameWallTimeRef.current = wallTime;
          lastMediaTimeRef.current = mediaTime;
          uploadCurrentFrame();
        }
      }

      if (video.paused || video.ended || !isPlaying) {
        // Crisp static frame
        drawFrame(1.0);
      } else {
        const elapsed = performance.now() - lastFrameWallTimeRef.current;
        const progress = Math.min(1.0, Math.max(0.0, elapsed / Math.max(15, frameDurationRef.current)));
        drawFrame(progress);
      }

      animFrameIdRef.current = requestAnimationFrame(animateInterpolation);
    };

    // Trigger initial frame
    uploadCurrentFrame();
    drawFrame(1.0);

    animFrameIdRef.current = requestAnimationFrame(animateInterpolation);

    // Event listeners for seek, play, pause
    const handleSeekedOrLoaded = () => {
      lastFrameWallTimeRef.current = performance.now();
      uploadCurrentFrame();
      // Sync previous texture as well on seek so no ghosting from previous scene
      if (gl && texPrevRef.current && video.readyState >= 2) {
        try {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, texPrevRef.current);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        } catch (_) {}
      }
      drawFrame(1.0);
    };

    video.addEventListener('seeked', handleSeekedOrLoaded);
    video.addEventListener('loadeddata', handleSeekedOrLoaded);
    video.addEventListener('play', handleSeekedOrLoaded);

    return () => {
      isActive = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      if (rvfcIdRef.current && typeof (video as any).cancelVideoFrameCallback === 'function') {
        (video as any).cancelVideoFrameCallback(rvfcIdRef.current);
        rvfcIdRef.current = null;
      }
      video.removeEventListener('seeked', handleSeekedOrLoaded);
      video.removeEventListener('loadeddata', handleSeekedOrLoaded);
      video.removeEventListener('play', handleSeekedOrLoaded);
    };
  }, [shouldBeActive, isReady, isPlaying, mode, videoRef]);

  if (!shouldBeActive) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute z-10 pointer-events-none"
      style={{
        left: '50%',
        top: '50%',
        width: targetWidth,
        height: targetHeight,
        maxWidth: 'none',
        maxHeight: 'none',
        objectFit: objectFitMode as any,
        transform: transformStyle,
        filter: filterStyle,
        borderRadius: borderRadius || '0px',
        boxShadow: boxShadow || 'none',
        display: isReady && !hasError ? 'block' : 'none',
        willChange: 'transform, filter',
      }}
      aria-hidden="true"
    />
  );
};
