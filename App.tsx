
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Canvas } from './components/Canvas';
import { Controls } from './components/Controls';
import { getInitialPlan, generateSpeech } from './services/geminiService';
import { AIResponse, AppStatus, WhiteboardStep } from './types';

// --- Audio Decoding Utilities ---
// Decodes a base64 string into a Uint8Array.
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Decodes raw PCM audio data into an AudioBuffer for playback.
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>('IDLE');
  const [explanation, setExplanation] = useState<string>("Welcome! I'm Visu, your AI teacher. Ask me to explain something!");
  const [error, setError] = useState<string | null>(null);
  const [whiteboardSteps, setWhiteboardSteps] = useState<WhiteboardStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [generatedAudio, setGeneratedAudio] = useState<(AudioBuffer | null)[]>([]);
  const [canvasKey, setCanvasKey] = useState<number>(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioPlaylistSources = useRef<AudioBufferSourceNode[]>([]);
  const stepAdvanceTimers = useRef<number[]>([]);

  // Initialize AudioContext on first user interaction
  const initializeAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
        try {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        } catch (e) {
            console.error("Web Audio API is not supported in this browser.", e);
            setError("Your browser doesn't support audio playback, so I can't speak. You can still follow along visually!");
        }
    }
    return audioContextRef.current;
  }, []);

  const stopEverything = useCallback(() => {
    audioPlaylistSources.current.forEach(source => {
        try { source.stop(); } catch (e) { /* ignore errors on already stopped sources */ }
    });
    audioPlaylistSources.current = [];

    stepAdvanceTimers.current.forEach(timer => clearTimeout(timer));
    stepAdvanceTimers.current = [];
  }, []);

  const handleSubmit = useCallback(async (currentPrompt: string) => {
    if (status !== 'IDLE' && status !== 'DONE' && status !== 'ERROR') {
      return;
    }

    initializeAudioContext();
    stopEverything();

    setStatus('THINKING');
    setError(null);
    setExplanation('Thinking about the best way to explain that...');
    setWhiteboardSteps([]);
    setCurrentStepIndex(0);
    setGeneratedAudio([]);
    setCanvasKey(prevKey => prevKey + 1);

    try {
      const response: AIResponse = await getInitialPlan(currentPrompt);
      setExplanation(response.explanation);
      
      if (response.whiteboard && response.whiteboard.length > 0) {
        setWhiteboardSteps(response.whiteboard);
        setStatus('PREPARING'); // Move to the new audio preparation stage
      } else {
        setExplanation(response.explanation || "I'm ready, but I didn't get any steps to show.");
        setStatus('DONE');
      }
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Sorry, I couldn't process that. ${errorMessage}`);
      setExplanation('Oops! Something went wrong. Please try again.');
      setStatus('ERROR');
    }
  }, [status, initializeAudioContext, stopEverything]);

  const handleRepeat = useCallback(() => {
    if (status !== 'DONE' || whiteboardSteps.length === 0) {
      return;
    }
    stopEverything();
    setCurrentStepIndex(0);
    setCanvasKey(prevKey => prevKey + 1); // This clears the canvas by re-mounting it
    setStatus('DRAWING');
  }, [status, whiteboardSteps.length, stopEverything]);
  
  // This effect handles the 'PREPARING' state to generate all audio upfront.
  useEffect(() => {
    if (status !== 'PREPARING' || whiteboardSteps.length === 0) {
        return;
    }

    const prepareAudio = async () => {
        const audioCtx = initializeAudioContext();
        if (!audioCtx) {
            // No audio support, just start the drawing sequence without sound
            setGeneratedAudio(new Array(whiteboardSteps.length).fill(null));
            setStatus('DRAWING');
            return;
        }

        setExplanation(`Preparing your full lesson... (0/${whiteboardSteps.length})`);

        // Generate audio SEQUENTIALLY with delays to respect rate limits
        // Free tier allows 3 requests per minute, so we wait 21 seconds between requests
        const results: (AudioBuffer | null)[] = [];
        const DELAY_BETWEEN_REQUESTS = 21000; // 21 seconds to be safe with 3/minute limit

        for (let index = 0; index < whiteboardSteps.length; index++) {
            const step = whiteboardSteps[index];

            try {
                // Add delay before each request (except the first one)
                if (index > 0 && index % 3 === 0) {
                    setExplanation(`Preparing your full lesson... (${index}/${whiteboardSteps.length}) - Waiting for rate limit...`);
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
                }

                setExplanation(`Preparing your full lesson... (${index}/${whiteboardSteps.length})`);

                const base64Audio = await generateSpeech(step.explanation);
                if (base64Audio) {
                    const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
                    results.push(audioBuffer);
                } else {
                    results.push(null);
                }
            } catch (e) {
                console.error(`Failed to generate audio for step ${index}:`, e);
                results.push(null);
            }
        }

        setExplanation(`Preparing your full lesson... (${whiteboardSteps.length}/${whiteboardSteps.length}) - Ready!`);
        setGeneratedAudio(results);
        setStatus('DRAWING'); // All audio is ready, start the presentation
    };

    prepareAudio();
  }, [status, whiteboardSteps, initializeAudioContext]);


  // This effect orchestrates the seamless playback of audio and visuals.
  useEffect(() => {
    if (status !== 'DRAWING' || generatedAudio.length === 0) {
      return;
    }

    const audioCtx = audioContextRef.current;
    if (!audioCtx) { // Handle case with no audio support
        // Fallback to sequential display with timers
        let cumulativeDelay = 0;
        whiteboardSteps.forEach((step, index) => {
            const stepDuration = 4000; // 4s fallback per step
            const timer = setTimeout(() => {
                setCurrentStepIndex(index);
                setExplanation(step.explanation);
            }, cumulativeDelay);
            stepAdvanceTimers.current.push(timer);
            cumulativeDelay += stepDuration;
        });

        const finalTimer = setTimeout(() => {
            setStatus('DONE');
            setExplanation(prev => prev + " And that's how it works! Feel free to ask another question.");
        }, cumulativeDelay);
        stepAdvanceTimers.current.push(finalTimer);
        return;
    }
    
    // --- Seamless Audio/Visual Playback Logic ---
    let cumulativeTime = audioCtx.currentTime;
    let cumulativeTimeout = 0;

    generatedAudio.forEach((buffer, index) => {
        const step = whiteboardSteps[index];
        const stepDuration = buffer ? buffer.duration : 4.0; // 4s fallback

        // Schedule visual step change
        const timer = setTimeout(() => {
            setCurrentStepIndex(index);
            setExplanation(step.explanation);
        }, cumulativeTimeout * 1000);
        stepAdvanceTimers.current.push(timer);
        
        // Schedule audio playback
        if (buffer) {
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            source.start(cumulativeTime);
            audioPlaylistSources.current.push(source);
        }

        cumulativeTime += stepDuration;
        cumulativeTimeout += stepDuration;
    });

    // Schedule the final 'DONE' state, preserving the last explanation.
    const finalTimer = setTimeout(() => {
        setStatus('DONE');
        setExplanation(prev => `${prev} And that's how it works! Feel free to ask another question.`);
    }, cumulativeTimeout * 1000);
    stepAdvanceTimers.current.push(finalTimer);

    return () => {
        // Cleanup happens in stopEverything(), called on new submission
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, generatedAudio]); // Only run when status becomes 'DRAWING'


  return (
    <div className="w-screen h-screen bg-black text-white font-sans flex items-center justify-center relative">
      <Canvas 
        steps={whiteboardSteps}
        currentStepIndex={currentStepIndex}
        status={status}
        audioBuffer={generatedAudio[currentStepIndex] ?? null}
        key={canvasKey}
      />
      <Controls 
        status={status}
        explanation={explanation}
        error={error}
        steps={whiteboardSteps}
        currentStepIndex={currentStepIndex}
        onSubmit={handleSubmit}
        onRepeat={handleRepeat}
      />
    </div>
  );
};

export default App;
