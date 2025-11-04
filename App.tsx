

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Canvas } from './components/Canvas';
import { Controls } from './components/Controls';
import { getInitialPlan, generateSpeech } from './services/aiService';
import { AIResponse, AppStatus, WhiteboardStep } from './types';
import { FocusIcon } from './components/icons';
import { RateLimiter } from './utils/rateLimiter';

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
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // --- Audio & Animation Engine Refs ---
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkerRef = useRef<Worker | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBuffersRef = useRef<(AudioBuffer | null)[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);

  const stepTimeoutRef = useRef<number | null>(null);
  const statusMessageIntervalRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const overallExplanationRef = useRef<string>('');
  const playbackOffsetRef = useRef<number>(0);
  const pausedProgressRef = useRef<number>(0); // Tracks visual animation progress when paused
  const pausedAtRef = useRef<number>(0); // Timestamp when paused
  const rateLimiterRef = useRef<RateLimiter>(new RateLimiter(10)); // 10 calls per minute
  const audioGenerationInProgressRef = useRef<Set<number>>(new Set()); // Track which steps are being generated

  const [animationProgress, setAnimationProgress] = useState(0);
  const [audioReadySteps, setAudioReadySteps] = useState<Set<number>>(new Set()); // Track which steps have audio ready

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
    setAudioReadySteps(new Set()); // Clear audio ready tracking
    audioGenerationInProgressRef.current.clear(); // Clear generation tracking
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Create gain node for volume control (mute functionality)
      if (audioContextRef.current) {
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
      }
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

      // PROGRESSIVE EXECUTION: Start showing content immediately
      // Initialize state for progressive playback
      audioBuffersRef.current = new Array(response.whiteboard.length).fill(null);
      setAudioReadySteps(new Set());
      audioGenerationInProgressRef.current.clear();
      (window as any).stepDurations = new Array(response.whiteboard.length).fill(3.0);

      // Set steps immediately so UI can prepare
      overallExplanationRef.current = response.explanation;
      setWhiteboardSteps(response.whiteboard);

      // Start generating audio PROGRESSIVELY with rate limiting
      console.log(`Starting progressive audio generation for ${response.whiteboard.length} steps...`);
      console.log(`Rate limit: ${rateLimiterRef.current.getRemainingCalls()} calls available this minute`);

      // Helper function to generate and process audio for a single step
      const generateStepAudio = async (step: WhiteboardStep, index: number) => {
        if (audioGenerationInProgressRef.current.has(index)) {
          return; // Already generating
        }

        audioGenerationInProgressRef.current.add(index);
        console.log(`[Step ${index}] Starting audio generation...`);

        try {
          // Use rate limiter to respect API quota (10 calls/minute)
          const audio = await rateLimiterRef.current.execute(() =>
            generateSpeech(step.explanation)
          );

          if (audio && audioWorkerRef.current) {
            // Send to worker for processing
            audioWorkerRef.current.postMessage({
              base64Audio: audio,
              sampleRate: 24000,
              numChannels: 1,
              index
            });

            // Wait for worker to decode
            let waitCount = 0;
            while (waitCount < 100) {
              if (audioBuffersRef.current[index]) {
                const buffer = audioBuffersRef.current[index];
                (window as any).stepDurations[index] = buffer!.duration;
                console.log(`[Step ${index}] Audio ready: ${buffer!.duration.toFixed(2)}s`);

                // Mark this step as ready
                setAudioReadySteps(prev => new Set(prev).add(index));
                break;
              }
              await new Promise(r => setTimeout(r, 50));
              waitCount++;
            }
          }
        } catch (error) {
          console.error(`[Step ${index}] Audio generation failed:`, error);
        } finally {
          audioGenerationInProgressRef.current.delete(index);
        }
      };

      // Generate audio for first step IMMEDIATELY (high priority)
      await generateStepAudio(response.whiteboard[0], 0);

      // Clear preparing messages
      if (statusMessageIntervalRef.current) clearInterval(statusMessageIntervalRef.current);

      // Start playing! First step audio is ready
      setExplanation(response.explanation);
      setStatus('DRAWING');

      // Generate remaining steps in background with smart batching
      // Batch 1: Queue up to 9 more requests immediately (total 10 in first minute)
      // Batch 2+: Queue remaining requests after 60 seconds
      (async () => {
        const totalSteps = response.whiteboard.length;
        const firstBatchSize = Math.min(10, totalSteps); // Up to 10 in first batch (including step 0)

        // Queue next 9 steps immediately (step 0 already done)
        console.log(`Queueing steps 1-${firstBatchSize - 1} for immediate generation...`);
        for (let i = 1; i < firstBatchSize; i++) {
          generateStepAudio(response.whiteboard[i], i);
        }

        // If there are more steps, queue them after 60 seconds
        if (totalSteps > firstBatchSize) {
          console.log(`Will queue steps ${firstBatchSize}-${totalSteps - 1} after 60 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60 seconds

          console.log(`Queueing remaining ${totalSteps - firstBatchSize} steps...`);
          for (let i = firstBatchSize; i < totalSteps; i++) {
            generateStepAudio(response.whiteboard[i], i);
          }
        }
      })();

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
    // Check if we've completed all steps
    if (status === 'DRAWING' && whiteboardSteps.length > 0 && currentStepIndex >= whiteboardSteps.length) {
      setStatus('DONE');
      setAnimationProgress(1); // Ensure final frame is fully drawn
      if (overallExplanationRef.current) {
        setExplanation(overallExplanationRef.current);
      }
      return;
    }

    const currentStep = whiteboardSteps[currentStepIndex];
    if (status !== 'DRAWING' || !currentStep || isPaused) {
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
      // Check if audio is ready for THIS step
      let buffer: AudioBuffer | null = audioBuffersRef.current[currentStepIndex] || null;

      // If audio not ready, show loading message and wait
      if (!buffer) {
        console.log(`[Step ${currentStepIndex}] Waiting for audio... (rate-limited queue)`);
        setExplanation('Preparing audio for this step...');

        let waitCount = 0;
        // Wait up to 60 seconds for the buffer (rate limiting may cause delays)
        while (!buffer && waitCount < 600 && !isCancelled) {
          await new Promise(r => setTimeout(r, 100));
          buffer = audioBuffersRef.current[currentStepIndex] || null;

          // Update loading message every few seconds
          if (waitCount % 30 === 0 && !buffer) {
            const queueLength = rateLimiterRef.current.getQueueLength();
            const remaining = rateLimiterRef.current.getRemainingCalls();
            console.log(`[Step ${currentStepIndex}] Still waiting... Queue: ${queueLength}, Remaining calls: ${remaining}`);
          }

          waitCount++;
        }

        // Restore step explanation once audio arrives
        if (buffer && currentStep) {
          setExplanation(currentStep.explanation);
        }
      }

      if (isCancelled) return;

      if (!buffer) {
        console.error(`[Step ${currentStepIndex}] Audio failed to load after waiting`);
        // Play without audio (visual only)
      }

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
      if (buffer && audioContextRef.current && gainNodeRef.current && !audioSourceRef.current) {
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(gainNodeRef.current); // Connect to gain node for mute control

        // If resuming from pause, start from where we paused within THIS audio file
        const startOffset = startProgress * buffer.duration;
        source.start(0, startOffset);
        audioSourceRef.current = source;

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

  // Handle mute/unmute
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : 1;
    }
  }, [isMuted]);

  const handleToggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  return (
    <div className="w-screen h-screen bg-black text-white font-sans flex items-center justify-center relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 p-2 sm:p-4 flex justify-between items-center z-10 pointer-events-none">
            <div className="pointer-events-auto">
                <img
                  src="/icons.png"
                  alt="AI Drawing Assistant Logo"
                  className="h-8 sm:h-10 w-auto object-contain"
                  style={{
                    imageRendering: 'crisp-edges',
                    maxWidth: '150px',
                    filter: 'brightness(1.3) contrast(1.2) drop-shadow(0 0 4px rgba(255,255,255,0.4))'
                  }}
                />
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
                {/* Research Preview Badge */}
                <div className="flex items-center gap-2 bg-black/50 backdrop-blur-xl border border-neutral-800 rounded-lg px-3 py-1.5" style={{ fontFamily: 'Arial, sans-serif' }}>
                    <span className="text-xs text-neutral-500">Research Preview</span>
                </div>

                {/* Focus Button */}
                {(status === 'DRAWING' || status === 'DONE') && (
                    <button
                        onClick={() => (window as any).__canvasFocus?.()}
                        className="p-2 w-10 h-10 flex items-center justify-center rounded-lg bg-black/50 backdrop-blur-xl border border-neutral-800 text-neutral-400 hover:text-white transition-all duration-200 transform hover:scale-110 active:scale-95"
                        title="Focus on current drawing"
                        aria-label="Focus on current drawing"
                    >
                        <FocusIcon className="w-5 h-5" style={{ color: '#1F51FF' }} />
                    </button>
                )}
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
            onFocusRequest
        />
        <Controls
            status={status}
            explanation={explanation}
            error={error}
            steps={whiteboardSteps}
            currentStepIndex={currentStepIndex}
            isPaused={isPaused}
            isMuted={isMuted}
            onSubmit={handleSubmit}
            onRepeat={handleRepeat}
            onTogglePause={handleTogglePause}
            onToggleMute={handleToggleMute}
        />
    </div>
  );
};

export default App;
