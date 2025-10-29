import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Canvas } from './components/Canvas';
import { Controls } from './components/Controls';
import { getInitialPlan, generateSpeech } from './services/geminiService';
import { AIResponse, AppStatus, WhiteboardStep } from './types';
import { MailIcon, GithubIcon } from './components/icons';

console.log('AI Drawing Assistant Deployed: ' + new Date().toISOString());

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
  'Sketching out the narrative arc...',
  'Planning the optimal visual flow...',
];

const PREPARING_MESSAGES = [
  'Warming up my virtual drawing hand...',
  'Choreographing the animation sequence...',
  'Generating audio narration for each step...',
  'Synthesizing the voice of your teacher...',
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

      if (statusMessageIntervalRef.current) clearInterval(statusMessageIntervalRef.current);

      if (!response.whiteboard || response.whiteboard.length === 0) {
        setExplanation(response.explanation || "I couldn't create a visual for that, but here's an explanation.");
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

      const base64AudioClips: (string | null)[] = [];
      const stepsToProcess = response.whiteboard;

      for (let i = 0; i < stepsToProcess.length; i++) {
        const step = stepsToProcess[i];
        setExplanation(`Generating audio narration... (${i + 1} of ${stepsToProcess.length})`);
        
        let success = false;
        let attempts = 0;
        while (!success && attempts < 3) {
          try {
            console.log(`[Speech Gen] Requesting clip ${i + 1} (Attempt ${attempts + 1})...`);
            const audioClip = await generateSpeech(step.explanation);
            base64AudioClips.push(audioClip);
            console.log(`[Speech Gen] Received clip ${i + 1}. Success: ${!!audioClip}`);
            success = true;
          } catch (err: any) {
            console.warn(`[Speech Gen] Attempt ${attempts} failed for clip ${i + 1}.`, err);
            const errString = err.toString();

            if (errString.includes('429')) {
              const retryMatch = errString.match(/Please retry in ([\d.]+)s/);
              if (retryMatch && retryMatch[1]) {
                const delaySeconds = parseFloat(retryMatch[1]);
                const delayMs = Math.ceil(delaySeconds * 1000) + 500; // Add a buffer
                console.log(`[Speech Gen] Rate limit hit. Retrying in ${delayMs}ms.`);
                setExplanation(`Rate limit reached. Waiting for ${Math.ceil(delaySeconds)}s...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue; // Retry without incrementing attempts for recoverable 429 errors
              }
            }
            
            // For other errors, increment attempts and wait before retrying.
            attempts++;
            if (attempts < 3) {
              await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
            } else {
              console.error(`[Speech Gen] Failed to generate audio for step ${i + 1} after 3 attempts.`);
              base64AudioClips.push(null); // Push null and move on
            }
          }
        }
      }

      if (statusMessageIntervalRef.current) clearInterval(statusMessageIntervalRef.current);

      audioBuffersRef.current = new Array(base64AudioClips.length).fill(null);
      base64AudioClips.forEach((base64Audio, index) => {
        if (base64Audio && audioWorkerRef.current) {
          audioWorkerRef.current.postMessage({
            base64Audio,
            sampleRate: 24000,
            numChannels: 1,
            index
          });
        }
      });

      overallExplanationRef.current = response.explanation;
      setExplanation(response.explanation);
      setWhiteboardSteps(response.whiteboard);
      setStatus('DRAWING');

    } catch (err) {
      console.error(err);
      if (statusMessageIntervalRef.current) clearInterval(statusMessageIntervalRef.current);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Sorry, I couldn't process that. ${errorMessage}`);
      setExplanation('Oops! Something went wrong. Please try again.');
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
      if (status === 'DRAWING' && whiteboardSteps.length > 0 && currentStepIndex >= whiteboardSteps.length) {
        setStatus('DONE');
        if (overallExplanationRef.current) {
          setExplanation(overallExplanationRef.current);
        }
      }
      return;
    }

    let isCancelled = false;
    setExplanation(currentStep.explanation);

    const offsetSec = playbackOffsetRef.current;
    
    const completeAndAdvance = () => {
      if (isCancelled) return;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      setAnimationProgress(1);
      stepTimeoutRef.current = window.setTimeout(() => {
        if (!isCancelled) {
          setCurrentStepIndex(i => i + 1);
        }
      }, 375);
    };
    
    const runStep = async () => {
      let buffer: AudioBuffer | null = audioBuffersRef.current[currentStepIndex] || null;
      let waitCount = 0;
      // Wait up to 10 seconds for the buffer to be ready
      while (!buffer && waitCount < 100 && !isCancelled) {
        await new Promise(r => setTimeout(r, 100));
        buffer = audioBuffersRef.current[currentStepIndex] || null;
        waitCount++;
      }

      if (isCancelled) return;

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
      
      if (audioSourceRef.current && audioContextRef.current) {
          const elapsed = audioContextRef.current.currentTime - startedAtRef.current;
          playbackOffsetRef.current += elapsed;
          try { audioSourceRef.current.stop(); } catch(e) {}
          audioSourceRef.current = null;
      }
    };
  }, [status, currentStepIndex, whiteboardSteps, isPaused]);

  return (
    <div className="w-screen h-screen bg-black text-white font-sans flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 pointer-events-none">
            <div className="pointer-events-auto">
                <img src="icons.png" alt="AI Drawing Assistant Logo" className="h-8 w-auto" />
            </div>
            <div className="pointer-events-auto">
                <div className="flex items-center gap-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full px-4 py-1.5 text-sm text-gray-500 shadow-lg">
                    <span>Research Preview</span>
                    <div className="w-px h-4 bg-white/20"></div>
                    <a href="mailto:team@dodgysoft.dev" target="_blank" rel="noopener noreferrer" title="Email Us" className="text-gray-500 hover:text-cyan-400 transition-all duration-300 hover:drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]">
                        <MailIcon className="w-5 h-5" />
                    </a>
                    <a href="https://github.com" target="_blank" rel="noopener noreferrer" title="View on GitHub" className="text-gray-500 hover:text-white transition-all duration-300 hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]">
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
            key={canvasKey}
            explanation={explanation}
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