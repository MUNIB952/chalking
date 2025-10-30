import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Canvas } from './components/Canvas';
import { Controls } from './components/Controls';
import { getInitialPlan, generateSpeech } from './services/geminiService';
import { AIResponse, AppStatus, WhiteboardStep, DrawingCommand, Annotation, Point, RectangleCommand, CircleCommand, TextAnnotation, ArrowAnnotation, PathCommand, StrikethroughAnnotation } from './types';
import { MailIcon, GithubIcon, LogoIcon } from './components/icons';

// This is the code that will run in the background thread to avoid blocking the UI.
const audioWorkerCode = `
  // This decode function now lives inside the worker, off the main thread.
  function decode(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  self.onmessage = (e) => {
    const { base64Audio, sampleRate, numChannels, index } = e.data;
    
    // 1. Decode the base64 string to a Uint8Array (the blocking part)
    const audioData = decode(base64Audio);
    
    // 2. Process the raw audio data into float channels
    const dataInt16 = new Int16Array(audioData.buffer);
    const frameCount = dataInt16.length / numChannels;
    
    const channels = [];
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = new Float32Array(frameCount);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
      channels.push(channelData);
    }

    // 3. Send the processed data back to the main thread for fast buffer creation.
    self.postMessage({ channels, frameCount, sampleRate, index }, channels.map(c => c.buffer));
  };
`;


const THINKING_MESSAGES = [
  'Conceptualizing the visual story...',
  'Consulting my internal knowledge base...',
  'Breaking the topic into digestible steps...',
  'This is a creative one! Brainstorming might take a moment...',
  'Sketching out the narrative arc...',
  'Planning the optimal visual flow...',
];

const PREPARING_MESSAGES = [
  'Warming up my virtual drawing hand...',
  'Choreographing the animation sequence...',
  'Preparing the canvas...',
  'Finalizing the lesson plan...',
];

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>('IDLE');
  const [explanation, setExplanation] = useState<string>('Enter a prompt and I\'ll create a voice-led visual explanation for you.');
  const [error, setError] = useState<string | null>(null);
  const [whiteboardSteps, setWhiteboardSteps] = useState<WhiteboardStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [canvasKey, setCanvasKey] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // --- Audio & Animation Engine Refs ---
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkerRef = useRef<Worker | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBuffersRef = useRef<(AudioBuffer | null)[]>([]);

  const stepTimeoutRef = useRef<number | null>(null);
  const statusMessageIntervalRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const overallExplanationRef = useRef<string>('');
  const playbackOffsetRef = useRef<number>(0); 
  const startedAtRef = useRef<number>(0); 
  
  const [animationProgress, setAnimationProgress] = useState(0);

  const stopEverything = useCallback(() => {
    if (stepTimeoutRef.current) clearTimeout(stepTimeoutRef.current);
    if (statusMessageIntervalRef.current) clearInterval(statusMessageIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    
    if (audioSourceRef.current) {
        try { audioSourceRef.current.stop(); } catch (e) { /* ignore */ }
        audioSourceRef.current = null;
    }
    
    setIsPaused(false);
    playbackOffsetRef.current = 0;
    setAnimationProgress(0);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const blob = new Blob([audioWorkerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    audioWorkerRef.current = worker;

    worker.onmessage = (e) => {
      const { channels, frameCount, sampleRate, index } = e.data;
      if (!audioContextRef.current) return;

      const audioBuffer = audioContextRef.current.createBuffer(channels.length, frameCount, sampleRate);
      channels.forEach((channelData: Float32Array, i: number) => {
        audioBuffer.getChannelData(i).set(channelData);
      });

      audioBuffersRef.current[index] = audioBuffer;
    };

    return () => {
      worker.terminate();
      stopEverything();
      audioContextRef.current?.close();
    };
  }, [stopEverything]);

  const handleSubmit = useCallback(async (prompt: string) => {
    if (!prompt.trim() || status === 'THINKING' || status === 'PREPARING') {
      return;
    }

    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }

    stopEverything();
    setStatus('THINKING');
    setError(null);
    setWhiteboardSteps([]);
    setCurrentStepIndex(0);
    audioBuffersRef.current = [];
    setCanvasKey(prev => prev + 1);

    let msgIndex = 0;
    setExplanation(THINKING_MESSAGES[msgIndex]);
    statusMessageIntervalRef.current = window.setInterval(() => {
      msgIndex = (msgIndex + 1) % THINKING_MESSAGES.length;
      setExplanation(THINKING_MESSAGES[msgIndex]);
    }, 2500);

    try {
      const response: AIResponse = await getInitialPlan(prompt);
      
      // --- PRE-VALIDATION SANITIZATION ---
      // This makes the app resilient to minor data errors from the AI, preventing crashes.
      if (response && Array.isArray(response.whiteboard)) {
        for (const step of response.whiteboard) {
          // Sanitize drawingPlan
          if (Array.isArray(step.drawingPlan)) {
            step.drawingPlan = step.drawingPlan.filter(cmd => {
              if (cmd.type === 'path') {
                if (!Array.isArray(cmd.points)) return false;
                cmd.points = cmd.points.filter(p => p && typeof p === 'object');
                return cmd.points.length >= 2;
              }
              return true;
            });
          }
          // Sanitize annotations
          if (Array.isArray(step.annotations)) {
            step.annotations = step.annotations.filter(ann => {
              if (ann.type === 'strikethrough') {
                if (!Array.isArray(ann.points)) return false;
                ann.points = ann.points.filter(p => p && typeof p === 'object');
                return ann.points.length >= 2;
              }
              return true;
            });
          }
        }
      }
      // --- END PRE-VALIDATION SANITIZATION ---

      if (statusMessageIntervalRef.current) clearInterval(statusMessageIntervalRef.current);

      // --- DEEP VALIDATION LOGIC ---
      const isPointObject = (p: any): p is Point => {
          if (!p) return false;
          // Absolute point check
          if (typeof p.x === 'number' && typeof p.y === 'number') {
              return true;
          }
          // Relative point check
          if (typeof p.referenceCircleId1 === 'string' && typeof p.referenceCircleId2 === 'string' && typeof p.intersectionIndex === 'number') {
              return true;
          }
          return false;
      };

      if (!response || typeof response.explanation !== 'string' || !Array.isArray(response.whiteboard)) {
        throw new Error("The AI returned an invalid plan structure. Please try rephrasing your prompt.");
      }
      
      if (response.whiteboard.length === 0 && !response.explanation) {
          throw new Error("The AI returned an empty plan. Please try a different prompt.");
      }

      for (const [i, step] of response.whiteboard.entries()) {
          if (!step || typeof step.origin?.x !== 'number' || typeof step.origin?.y !== 'number' || typeof step.explanation !== 'string') {
            throw new Error(`Step ${i + 1} is malformed (missing origin or explanation).`);
          }

          const allItems: (DrawingCommand | Annotation)[] = [...(step.drawingPlan || []), ...(step.annotations || [])];

          for (const [j, item] of allItems.entries()) {
            if (!item || !item.type) {
              throw new Error(`Item ${j + 1} in Step ${i + 1} is missing a 'type'.`);
            }

            switch (item.type) {
              case 'rectangle': {
                const cmd = item as RectangleCommand;
                if (!isPointObject(cmd.center)) throw new Error(`Invalid or missing 'center' in 'rectangle' Item ${j + 1}, Step ${i + 1}`);
                break;
              }
              case 'circle': {
                const cmd = item as CircleCommand;
                if (!isPointObject(cmd.center)) throw new Error(`Invalid or missing 'center' in 'circle' Item ${j + 1}, Step ${i + 1}`);
                break;
              }
              case 'text': {
                const cmd = item as TextAnnotation;
                if (!isPointObject(cmd.point)) throw new Error(`Invalid or missing 'point' in 'text' Item ${j + 1}, Step ${i + 1}`);
                break;
              }
              case 'arrow': {
                const cmd = item as ArrowAnnotation;
                if (!isPointObject(cmd.start)) throw new Error(`Invalid or missing 'start' in 'arrow' Item ${j + 1}, Step ${i + 1}`);
                if (!isPointObject(cmd.end)) throw new Error(`Invalid or missing 'end' in 'arrow' Item ${j + 1}, Step ${i + 1}`);
                if (cmd.controlPoint && !isPointObject(cmd.controlPoint)) throw new Error(`Invalid 'controlPoint' in 'arrow' Item ${j + 1}, Step ${i + 1}`);
                break;
              }
              case 'path': {
                const cmd = item as PathCommand;
                if (!Array.isArray(cmd.points) || cmd.points.length < 2) throw new Error(`'path' at Item ${j + 1} in Step ${i + 1} must have a 'points' array with at least two points.`);
                for (const p of cmd.points) { if (!isPointObject(p)) throw new Error(`Invalid point in 'points' array for Item ${j + 1}, Step ${i + 1}`); }
                break;
              }
              case 'strikethrough': {
                const cmd = item as StrikethroughAnnotation;
                if (!Array.isArray(cmd.points) || cmd.points.length < 2) throw new Error(`'strikethrough' at Item ${j + 1} in Step ${i + 1} must have a 'points' array with at least two points.`);
                for (const p of cmd.points) { if (!isPointObject(p)) throw new Error(`Invalid point in 'points' array for Item ${j + 1}, Step ${i + 1}`); }
                break;
              }
              default:
                break;
            }
          }
      }
      // --- END DEEP VALIDATION LOGIC ---

      if (response.whiteboard.length === 0) {
        setExplanation(response.explanation);
        setStatus('DONE');
        return;
      }
      
      setStatus('PREPARING');
      msgIndex = 0;
      setExplanation(PREPARING_MESSAGES[msgIndex]);
      statusMessageIntervalRef.current = window.setInterval(() => {
          msgIndex = (msgIndex + 1) % PREPARING_MESSAGES.length;
          setExplanation(PREPARING_MESSAGES[msgIndex]);
      }, 2500);

      await new Promise(r => setTimeout(r, 1000));
      
      if (statusMessageIntervalRef.current) clearInterval(statusMessageIntervalRef.current);

      audioBuffersRef.current = new Array(response.whiteboard.length).fill(null);
      overallExplanationRef.current = response.explanation;
      setExplanation(response.explanation);
      setWhiteboardSteps(response.whiteboard);
      setStatus('DRAWING');

    } catch (err) {
      console.error(err);
      if (statusMessageIntervalRef.current) clearInterval(statusMessageIntervalRef.current);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Sorry, I couldn't process that. ${errorMessage}`);
      setExplanation('Oops! Something went wrong. The drawing assistant encountered an unexpected error.');
      setStatus('ERROR');
    }
  }, [status, stopEverything]);

  const handleRepeat = useCallback(() => {
    if (whiteboardSteps.length === 0) return;
    stopEverything();
    setCurrentStepIndex(0);
    setCanvasKey(prev => prev + 1);
    setStatus('DRAWING');
  }, [whiteboardSteps, stopEverything]);

  const handleTogglePause = useCallback(() => {
    if (status === 'DRAWING') {
      setIsPaused(p => !p);
    }
  }, [status]);
  
  useEffect(() => {
    playbackOffsetRef.current = 0;
    setAnimationProgress(0);
  }, [currentStepIndex]);

  useEffect(() => {
    const currentStep = whiteboardSteps[currentStepIndex];

    if (status !== 'DRAWING' || !currentStep || isPaused) {
      if (audioSourceRef.current) {
        try { audioSourceRef.current.stop(); } catch(e) {}
        audioSourceRef.current = null;
        if (audioContextRef.current && startedAtRef.current > 0) {
            const elapsed = audioContextRef.current.currentTime - startedAtRef.current;
            playbackOffsetRef.current += elapsed;
        }
      }
      return;
    }

    let isCancelled = false;
    setExplanation(currentStep.explanation);
    
    if (playbackOffsetRef.current === 0) {
        setAnimationProgress(0);
    }

    const completeAndAdvance = () => {
        if (isCancelled) return;
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        setAnimationProgress(1);

        stepTimeoutRef.current = window.setTimeout(() => {
            if (!isCancelled) {
              if (currentStepIndex < whiteboardSteps.length - 1) {
                setCurrentStepIndex(i => i + 1);
              } else {
                setStatus('DONE');
                setExplanation(overallExplanationRef.current);
              }
            }
        }, 375);
    };

    const runStep = async () => {
        if (!audioBuffersRef.current[currentStepIndex]) {
            const base64Audio = await generateSpeech(currentStep.explanation);
            if (base64Audio && audioWorkerRef.current && !isCancelled) {
                audioWorkerRef.current.postMessage({
                    base64Audio, sampleRate: 24000, numChannels: 1, index: currentStepIndex
                });
            }
        }
        
        let buffer = audioBuffersRef.current[currentStepIndex] || null;
        let waitCount = 0;
        while (!buffer && waitCount < 100 && !isCancelled) {
            await new Promise(r => setTimeout(r, 100));
            buffer = audioBuffersRef.current[currentStepIndex] || null;
            waitCount++;
        }

        if (isCancelled) return;

        const offsetSec = playbackOffsetRef.current;
        const durationMs = buffer ? (buffer.duration - offsetSec) * 1000 : 4000;

        const stepStartTime = performance.now();

        const animate = () => {
            if (isCancelled) return;
            let currentProgress = 0;
            if (audioContextRef.current && audioSourceRef.current?.buffer && startedAtRef.current > 0) {
                const elapsedSec = audioContextRef.current.currentTime - startedAtRef.current;
                const totalPlayedSec = offsetSec + elapsedSec;
                currentProgress = Math.min(totalPlayedSec / audioSourceRef.current.buffer.duration, 1);
            } else {
                const elapsedMs = performance.now() - stepStartTime;
                currentProgress = Math.min(elapsedMs / durationMs, 1);
            }
            setAnimationProgress(currentProgress);
            if (currentProgress < 1) {
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        };

        animationFrameRef.current = requestAnimationFrame(animate);
        stepTimeoutRef.current = window.setTimeout(completeAndAdvance, durationMs + 100);

        if (buffer && audioContextRef.current && offsetSec < buffer.duration) {
            const source = audioContextRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContextRef.current.destination);
            source.start(0, offsetSec);
            audioSourceRef.current = source;
            startedAtRef.current = audioContextRef.current.currentTime;
        }
    };

    runStep();

    return () => {
        isCancelled = true;
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (stepTimeoutRef.current) clearTimeout(stepTimeoutRef.current);
    };
  }, [status, currentStepIndex, whiteboardSteps, isPaused]);

  return (
    <div className="w-screen h-screen bg-black text-white font-sans flex items-center justify-center relative">
       <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 pointer-events-none">
            <div className="pointer-events-auto">
                <LogoIcon className="h-8 w-auto" />
            </div>
            <div className="pointer-events-auto">
                <div className="flex items-center gap-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full px-4 py-1.5 text-sm text-gray-500 shadow-lg">
                    <span>Research Preview</span>
                    <div className="w-px h-4 bg-white/20"></div>
                    <a href="mailto:ai-drawing-assistant-feedback@google.com" target="_blank" rel="noopener noreferrer" title="Email Us" className="text-gray-400 hover:text-cyan-400 transition-all duration-300 hover:drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]">
                        <MailIcon className="w-5 h-5" />
                    </a>
                    <a href="https://github.com/google/aistudio-web" target="_blank" rel="noopener noreferrer" title="View on GitHub" className="text-gray-400 hover:text-white transition-all duration-300 hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]">
                        <GithubIcon className="w-5 h-5" />
                    </a>
                </div>
            </div>
        </div>
      <Canvas 
        steps={whiteboardSteps}
        currentStepIndex={currentStepIndex}
        status={status}
        animationProgress={animationProgress}
        isPaused={isPaused}
        explanation={explanation}
        key={canvasKey}
      />
      <Controls 
        status={status}
        explanation={explanation}
        error={error}
        steps={whiteboardSteps}
        currentStepIndex={currentStepIndex}
        isPaused={isPaused}
        onSubmit={handleSubmit}
        onRepeat={handleRepeat}
        onTogglePause={handleTogglePause}
      />
    </div>
  );
};

export default App;