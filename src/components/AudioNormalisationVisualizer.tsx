import React, { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';

interface VisualizerProps {
  isAudioNormalized: boolean;
  threshold: number; // dB, -100 to 0
  gain: number; // dB, 0 to 20
  lang?: 'id' | 'en';
  analyserRef?: React.MutableRefObject<AnalyserNode | null>;
}

export const AudioNormalisationVisualizer: React.FC<VisualizerProps> = ({
  isAudioNormalized,
  threshold,
  gain,
  lang = 'id',
  analyserRef
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Real-time animation states
  const [dimensions, setDimensions] = useState({ width: 300, height: 110 });
  const historyRef = useRef<{ input: number[]; output: number[] }>({ input: [], output: [] });
  const animFrameRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);

  // Peak levels for meters
  const [inputPeakDb, setInputPeakDb] = useState(-60);
  const [outputPeakDb, setOutputPeakDb] = useState(-60);

  // Handle auto-resize
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.max(width, 100),
          height: Math.max(height, 80)
        });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Initialize history buffers
  useEffect(() => {
    const size = 150;
    historyRef.current = {
      input: Array(size).fill(0),
      output: Array(size).fill(0)
    };
  }, []);

  // Animation Loop
  useEffect(() => {
    let lastTime = performance.now();
    
    const updateAndDraw = (timestamp: number) => {
      // Limit to ~35 fps to save CPU
      if (timestamp - lastTime < 28) {
        animFrameRef.current = requestAnimationFrame(updateAndDraw);
        return;
      }
      lastTime = timestamp;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height } = dimensions;
      const centerY = height / 2;

      // Check if we have active Web Audio AnalyserNode data
      const analyser = analyserRef?.current;
      let hasRealAudio = false;
      let realInputSamples: number[] = [];
      let realOutputSamples: number[] = [];
      let currentFrameInputDb = -80;
      let currentFrameOutputDb = -80;

      if (analyser) {
        try {
          const bufferLength = analyser.fftSize; // e.g., 256
          const dataArray = new Uint8Array(bufferLength);
          analyser.getByteTimeDomainData(dataArray);

          // Check if there is actual non-silent signal
          let isSilent = true;
          for (let i = 0; i < bufferLength; i++) {
            if (Math.abs(dataArray[i] - 128) > 2) {
              isSilent = false;
              break;
            }
          }

          if (!isSilent) {
            hasRealAudio = true;
            // Downsample buffer to 150 points for visualization
            const step = Math.max(1, Math.floor(bufferLength / 150));
            
            for (let i = 0; i < bufferLength; i += step) {
              if (realOutputSamples.length >= 150) break;

              // Map byte [0, 255] to [-1.0, 1.0]
              const outputVal = (dataArray[i] - 128) / 128.0;
              const outputAbs = Math.abs(outputVal);
              const outputDb = outputAbs > 0.0001 ? 20 * Math.log10(outputAbs) : -80;

              // Reverse normalization equation to calculate corresponding Input amplitude
              let inputDb = outputDb;
              if (isAudioNormalized) {
                const tempDb = outputDb - gain;
                if (tempDb > threshold) {
                  // Reverse Compression
                  inputDb = threshold + (tempDb - threshold) * 12;
                } else {
                  inputDb = tempDb;
                }
              }

              const inputAbs = Math.pow(10, inputDb / 20);
              const sign = outputVal < 0 ? -1 : 1;
              const inputVal = Math.max(-1.5, Math.min(1.5, sign * inputAbs));

              realOutputSamples.push(outputVal);
              realInputSamples.push(inputVal);

              if (inputDb > currentFrameInputDb) currentFrameInputDb = inputDb;
              if (outputDb > currentFrameOutputDb) currentFrameOutputDb = outputDb;
            }
          }
        } catch (e) {
          console.error("Analyser read error", e);
        }
      }

      // Fallback: If no real audio, generate synthetic simulation
      let inputDb = -80;
      let outputDb = -80;

      if (!hasRealAudio) {
        const t = phaseRef.current;
        phaseRef.current += 1;

        // Complex multi-frequency sine generator with occasional spikes (drum hits)
        const envelope = 0.35 + 0.25 * Math.sin(0.015 * t);
        const fastOsc = 0.65 * Math.sin(0.18 * t) * Math.cos(0.06 * t) + 0.35 * Math.sin(0.42 * t);
        let rawInput = envelope * fastOsc;

        if (t % 50 < 4) {
          rawInput *= 2.2;
        } else if (t % 50 < 8) {
          rawInput *= 1.4;
        } else {
          rawInput += (Math.random() - 0.5) * 0.05;
        }

        const inputVal = Math.max(-1.3, Math.min(1.3, rawInput));
        const inputAbs = Math.abs(inputVal);
        inputDb = inputAbs > 0.0001 ? 20 * Math.log10(inputAbs) : -80;

        outputDb = inputDb;
        if (isAudioNormalized) {
          if (inputDb > threshold) {
            outputDb = threshold + (inputDb - threshold) / 12;
          }
          outputDb += gain;
        }

        const outputAbs = Math.pow(10, outputDb / 20);
        const sign = inputVal < 0 ? -1 : 1;
        const outputVal = Math.max(-1.5, Math.min(1.5, sign * outputAbs));

        // Update scrolling buffers
        const history = historyRef.current;
        history.input.shift();
        history.input.push(inputVal);
        history.output.shift();
        history.output.push(outputVal);
      } else {
        // Use real audio DB peaks
        inputDb = currentFrameInputDb;
        outputDb = currentFrameOutputDb;
      }

      // Update smoothed DB peaks for meters
      setInputPeakDb(prev => Math.max(inputDb, prev - 1.2, -60));
      setOutputPeakDb(prev => Math.max(outputDb, prev - 1.2, -60));

      // 4. DRAWING
      ctx.clearRect(0, 0, width, height);

      // Draw background visual grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width - 45, y);
        ctx.stroke();
      }

      const waveWidth = width - 50;

      // Draw visual silent line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(waveWidth, centerY);
      ctx.stroke();

      // Power scaling for visual rhythm and expand small details
      const getVisualY = (val: number) => {
        const sign = val < 0 ? -1 : 1;
        const scaled = Math.pow(Math.abs(val), 0.55);
        const limit = Math.min(scaled, 1.2);
        return centerY - sign * limit * (centerY - 8);
      };

      // Draw Threshold indicators
      if (isAudioNormalized) {
        const threshLinear = Math.pow(10, threshold / 20);
        const yThreshTop = getVisualY(threshLinear);
        const yThreshBottom = getVisualY(-threshLinear);

        ctx.strokeStyle = 'rgba(249, 115, 22, 0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        ctx.beginPath();
        ctx.moveTo(0, yThreshTop);
        ctx.lineTo(waveWidth, yThreshTop);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, yThreshBottom);
        ctx.lineTo(waveWidth, yThreshBottom);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(249, 115, 22, 0.55)';
        ctx.font = '8px monospace';
        ctx.fillText(`Thresh ${threshold}dB`, 5, yThreshTop - 3);
      }

      // Wave source arrays
      const inputs = hasRealAudio ? realInputSamples : historyRef.current.input;
      const outputs = hasRealAudio ? realOutputSamples : historyRef.current.output;

      if (inputs.length > 0 && outputs.length > 0) {
        // Draw Input Wave (Semi-transparent background fill)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        for (let i = 0; i < inputs.length; i++) {
          const x = (i / (inputs.length - 1)) * waveWidth;
          const y = getVisualY(inputs[i]);
          ctx.lineTo(x, y);
        }
        for (let i = inputs.length - 1; i >= 0; i--) {
          const x = (i / (inputs.length - 1)) * waveWidth;
          const y = getVisualY(-inputs[i]);
          ctx.lineTo(x, centerY);
        }
        ctx.closePath();
        ctx.fill();

        // Draw Output Wave (Glowing Amber/Yellow curve)
        ctx.strokeStyle = isAudioNormalized ? 'rgb(245, 158, 11)' : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = isAudioNormalized ? 1.5 : 1;
        ctx.beginPath();
        for (let i = 0; i < outputs.length; i++) {
          const x = (i / (outputs.length - 1)) * waveWidth;
          const y = getVisualY(outputs[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Draw real-time dB column meters
      const meterX = width - 35;
      const meterW = 12;
      const meterH = height - 12;
      const meterY = 6;

      const dbToY = (db: number) => {
        const clamped = Math.max(-60, Math.min(6, db));
        const percentage = (clamped + 60) / 66; // -60dB to +6dB range
        return meterY + meterH * (1 - percentage);
      };

      const drawMeter = (peakDb: number, label: string, offset: number) => {
        const x = meterX + offset;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(x, meterY, meterW, meterH);

        const activeY = dbToY(peakDb);
        const activeH = (meterY + meterH) - activeY;

        if (activeH > 0) {
          const grad = ctx.createLinearGradient(x, meterY + meterH, x, meterY);
          grad.addColorStop(0, '#10b981'); // Emerald green (quiet/medium)
          grad.addColorStop(0.7, '#f59e0b'); // Amber (normalised target)
          grad.addColorStop(0.92, '#ef4444'); // Red (clipping limit)
          
          ctx.fillStyle = grad;
          ctx.fillRect(x, activeY, meterW, activeH);
        }

        if (peakDb > 0) {
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(x, meterY, meterW, 3); // Clip warning
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '7px sans-serif';
        ctx.fillText(label, x + 1, height - 1);
      };

      // Render IN and OUT columns
      drawMeter(inputPeakDb, 'IN', 0);
      drawMeter(outputPeakDb, 'OUT', 16);

      animFrameRef.current = requestAnimationFrame(updateAndDraw);
    };

    animFrameRef.current = requestAnimationFrame(updateAndDraw);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [dimensions, isAudioNormalized, threshold, gain, analyserRef]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">
          <Activity size={12} className="text-orange-600 dark:text-amber-500 animate-pulse" />
          <span>
            {lang === 'id' ? 'Visualisasi Kompresi & Gain' : 'Compression & Gain Visualizer'}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[9px] text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
            Input
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Output
          </span>
        </div>
      </div>

      <div 
        ref={containerRef}
        className="relative bg-zinc-950 border border-black/20 dark:border-white/5 rounded-xl overflow-hidden p-1.5 h-[115px] flex items-center justify-center shadow-inner"
      >
        <canvas 
          ref={canvasRef} 
          width={dimensions.width} 
          height={dimensions.height}
          className="w-full h-full block"
        />

        {analyserRef?.current ? (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-green-500/10 border border-green-500/20 rounded text-[8px] font-mono text-green-500 uppercase tracking-wider">
            {lang === 'id' ? 'Live Audio' : 'Live Stream'}
          </div>
        ) : (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[8px] font-mono text-amber-500 uppercase tracking-wider animate-pulse">
            {lang === 'id' ? 'Simulasi' : 'Simulated'}
          </div>
        )}

        {!isAudioNormalized && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex flex-col items-center justify-center text-center p-4 transition-all">
            <p className="text-xs text-zinc-300 font-medium">
              {lang === 'id' 
                ? 'Normalisasi Audio Tidak Aktif' 
                : 'Audio Normalisation Disabled'}
            </p>
            <p className="text-[10px] text-zinc-500 mt-1 max-w-[200px]">
              {lang === 'id'
                ? 'Aktifkan normalisasi audio untuk mengompresi puncak suara yang keras dan memperkuat bagian suara yang pelan.'
                : 'Enable audio normalisation to compress loud peaks and lift quiet sections of the track.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
