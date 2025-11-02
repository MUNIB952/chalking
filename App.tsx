

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Canvas } from './components/Canvas';
import { Controls } from './components/Controls';
import { getInitialPlan, generateSpeech } from './services/aiService';
import { AIResponse, AppStatus, WhiteboardStep } from './types';
import { MailIcon, GithubIcon } from './components/icons';

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
  const pausedProgressRef = useRef<number>(0); // Tracks visual animation progress when paused 
  
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
    pausedProgressRef.current = 0; // Reset paused progress for fresh start
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

      // PROFESSIONAL SOLUTION: Generate separate audio for EACH step
      // This ensures perfect synchronization between audio and visuals
      console.log(`Generating individual audio for ${response.whiteboard.length} steps...`);

      const stepAudioPromises = response.whiteboard.map((step, index) =>
        generateSpeech(step.explanation).then(audio => ({
          index,
          audio
        }))
      );

      const stepAudioResults = await Promise.all(stepAudioPromises);

      if (statusMessageIntervalRef.current) clearInterval(statusMessageIntervalRef.current);

      // Initialize audio buffers array - one per step
      audioBuffersRef.current = new Array(response.whiteboard.length).fill(null);

      // Process each audio file and measure its ACTUAL duration
      const stepDurations: number[] = [];

      for (const { index, audio } of stepAudioResults) {
        if (audio && audioWorkerRef.current) {
          // Send to worker for processing
          audioWorkerRef.current.postMessage({
            base64Audio: audio,
            sampleRate: 24000,
            numChannels: 1,
            index
          });
        } else {
          // No audio for this step - use a default duration
          stepDurations[index] = 3.0; // 3 seconds default
        }
      }

      // Wait for all audio buffers to be decoded
      // The worker will populate audioBuffersRef.current[index] for each
      let waitCount = 0;
      while (waitCount < 100) {
        const allLoaded = audioBuffersRef.current.every(buf => buf !== null || buf === undefined);
        if (allLoaded) break;
        await new Promise(r => setTimeout(r, 100));
        waitCount++;
      }

      // Calculate actual durations from decoded audio buffers
      for (let i = 0; i < audioBuffersRef.current.length; i++) {
        const buffer = audioBuffersRef.current[i];
        if (buffer) {
          // Use ACTUAL audio duration from the buffer
          stepDurations[i] = buffer.duration;
          console.log(`Step ${i}: ${buffer.duration.toFixed(2)}s (measured from audio)`);
        } else {
          stepDurations[i] = 3.0; // Fallback
          console.log(`Step ${i}: 3.00s (no audio, using default)`);
        }
      }

      console.log('All audio generated. Step durations:', stepDurations.map(d => d.toFixed(2)));

      // Store step timings for playback
      (window as any).stepDurations = stepDurations;

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
      const willBePaused = !isPaused;

      if (willBePaused) {
        // Pausing: Save current animation progress and stop this step's audio
        pausedProgressRef.current = animationProgress;
        pausedAtRef.current = performance.now();

        if (audioSourceRef.current) {
          console.log(`Pausing at progress: ${(pausedProgressRef.current * 100).toFixed(1)}%`);

          try {
            audioSourceRef.current.stop();
          } catch (e) {
            console.log('Audio source already stopped');
          }
          audioSourceRef.current = null;
        }
      } else {
        // Resuming: Log that we're resuming from saved progress
        console.log(`Resuming from progress: ${(pausedProgressRef.current * 100).toFixed(1)}%`);
      }

      setIsPaused(willBePaused);
    }
  }, [status, isPaused, animationProgress]);
  
  useEffect(() => {
    playbackOffsetRef.current = 0;
    setAnimationProgress(0);
    pausedProgressRef.current = 0; // Reset paused progress for new step
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
      // Get the audio buffer for THIS specific step
      let buffer: AudioBuffer | null = audioBuffersRef.current[currentStepIndex] || null;
      let waitCount = 0;
      // Wait up to 10 seconds for the buffer to be ready
      while (!buffer && waitCount < 100 && !isCancelled) {
        await new Promise(r => setTimeout(r, 100));
        buffer = audioBuffersRef.current[currentStepIndex] || null;
        waitCount++;
      }

      if (isCancelled) return;

      // Get ACTUAL duration from the audio buffer (measured, not estimated)
      const stepDurations = (window as any).stepDurations || [];
      const stepDuration = buffer ? buffer.duration : (stepDurations[currentStepIndex] || 4);
      const durationMs = stepDuration * 1000;

      // Account for paused progress - if we're resuming, start from where we left off
      const startProgress = pausedProgressRef.current;
      const remainingProgress = 1 - startProgress;
      const remainingDurationMs = durationMs * remainingProgress;

      console.log(`Step ${currentStepIndex}: ${stepDuration.toFixed(2)}s (actual audio duration), starting from ${(startProgress * 100).toFixed(1)}% progress`);

      const stepStartTime = performance.now();
      const animate = () => {
        if (isCancelled) return;

        const elapsedMs = performance.now() - stepStartTime;
        // Calculate progress from paused point
        const progressDelta = Math.min(elapsedMs / durationMs, remainingProgress);
        const currentProgress = Math.min(startProgress + progressDelta, 1);

        setAnimationProgress(currentProgress);

        if (currentProgress < 1) {
            animationFrameRef.current = requestAnimationFrame(animate);
        }
      };
      animationFrameRef.current = requestAnimationFrame(animate);

      stepTimeoutRef.current = window.setTimeout(completeAndAdvance, remainingDurationMs + 100);

      // Play THIS step's audio (each step has its own audio file)
      if (buffer && audioContextRef.current && !audioSourceRef.current) {
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);

        // If resuming from pause, start from where we paused within THIS audio file
        const startOffset = startProgress * buffer.duration;
        source.start(0, startOffset);
        audioSourceRef.current = source;
        startedAtRef.current = audioContextRef.current.currentTime;

        console.log(`Playing step ${currentStepIndex} audio${startOffset > 0 ? ` from ${startOffset.toFixed(2)}s` : ''}`);
      }
    };
    
    runStep();

    return () => {
      isCancelled = true;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (stepTimeoutRef.current) clearTimeout(stepTimeoutRef.current);

      // Stop current step's audio when moving to next step
      // Each step has its own audio file, so we stop the current one
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.stop();
        } catch (e) {
          // Audio already stopped
        }
        audioSourceRef.current = null;
      }
    };
  }, [status, currentStepIndex, whiteboardSteps, isPaused]);

  return (
    <div className="w-screen h-screen bg-black text-white font-sans flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 pointer-events-none">
            <div className="pointer-events-auto">
                <img src="/icons.png" alt="AI Drawing Assistant Logo" className="h-8 w-auto" />
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
