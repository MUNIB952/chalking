
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Canvas } from './components/Canvas';
import { Controls } from './components/Controls';
// Fix: The function `getDrawingSuggestion` is not exported from geminiService. It was likely renamed to `getInitialPlan`.
import { getInitialPlan } from './services/geminiService';
import { AIResponse, AppStatus, WhiteboardStep } from './types';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>('IDLE');
  const [explanation, setExplanation] = useState<string>("Welcome! Ask me to draw or explain something.");
  const [error, setError] = useState<string | null>(null);
  const [whiteboardSteps, setWhiteboardSteps] = useState<WhiteboardStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [canvasKey, setCanvasKey] = useState<number>(0);
  const stepAdvanceTimers = useRef<number[]>([]);

  // FIX: To fix outdated component logic, we introduce timer management
  // functions. This allows for proper cleanup of drawing sequence timers.
  const stopEverything = useCallback(() => {
    stepAdvanceTimers.current.forEach(timer => clearTimeout(timer));
    stepAdvanceTimers.current = [];
  }, []);


  const handleSubmit = useCallback(async (currentPrompt: string) => {
    if (!currentPrompt.trim() || status === 'THINKING' || status === 'DRAWING') {
      return;
    }

    stopEverything();
    setStatus('THINKING');
    setError(null);
    setExplanation('Thinking...');
    setWhiteboardSteps([]);
    setCurrentStepIndex(0);
    setCanvasKey(prevKey => prevKey + 1); // Force canvas reset

    try {
      // Fix: The function `getDrawingSuggestion` is not exported from geminiService. It was likely renamed to `getInitialPlan`.
      const response: AIResponse = await getInitialPlan(currentPrompt);
      
      setExplanation(response.explanation);
      
      if (response.whiteboard && response.whiteboard.length > 0) {
        setWhiteboardSteps(response.whiteboard);
        setStatus('DRAWING');
      } else {
        setStatus('DONE');
        setWhiteboardSteps([]);
      }
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Sorry, I couldn't process that. ${errorMessage}`);
      setExplanation('Oops! Something went wrong. Please try again.');
      setStatus('ERROR');
    }
  }, [status, stopEverything]);
  
  // FIX: Add the `handleRepeat` function required by the `Controls` component's `onRepeat` prop.
  const handleRepeat = useCallback(() => {
    if (status !== 'DONE' || whiteboardSteps.length === 0) {
      return;
    }
    stopEverything();
    setCurrentStepIndex(0);
    setCanvasKey(prevKey => prevKey + 1); // This clears the canvas by re-mounting it
    setStatus('DRAWING');
  }, [status, whiteboardSteps.length, stopEverything]);

  // FIX: The `onStepComplete` callback is removed as it's part of an obsolete API for the Canvas component.
  // The drawing sequence is now orchestrated by this useEffect hook, which advances steps using timers.
  useEffect(() => {
    if (status !== 'DRAWING' || whiteboardSteps.length === 0) {
      return;
    }

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
    
    return () => {
      stopEverything();
    };
  }, [status, whiteboardSteps, stopEverything]);

  // Effect to update explanation for the current step is now inside Controls

  return (
    <div className="w-screen h-screen bg-black text-white font-sans flex items-center justify-center relative">
      {/* FIX: The `Canvas` component props are updated to match its current definition.
          Obsolete props like `onStepComplete` are removed, and required props `status` and `audioBuffer` are added. */}
      <Canvas 
        steps={whiteboardSteps}
        currentStepIndex={currentStepIndex}
        status={status}
        audioBuffer={null}
        key={canvasKey}
      />
      {/* FIX: The `onRepeat` prop is added to `Controls` to satisfy its required props interface. */}
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
