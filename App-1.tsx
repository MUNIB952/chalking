import React, { useState, useCallback } from 'react';
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

  const handleSubmit = useCallback(async (currentPrompt: string) => {
    if (!currentPrompt.trim() || status === 'THINKING' || status === 'DRAWING') {
      return;
    }

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
        setCurrentStepIndex(0); // Start drawing from the first step
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
  }, [status]);
  
  const onStepComplete = useCallback(() => {
    if (whiteboardSteps && currentStepIndex < whiteboardSteps.length - 1) {
      setCurrentStepIndex(prevIndex => prevIndex + 1);
    } else {
      setStatus('DONE');
    }
  }, [whiteboardSteps, currentStepIndex]);

  // Effect to update explanation for the current step is now inside Controls

  return (
    <div className="w-screen h-screen bg-black text-white font-sans flex items-center justify-center relative">
      <Canvas 
        steps={whiteboardSteps}
        currentStepIndex={currentStepIndex}
        onStepBegin={() => setStatus('DRAWING')}
        onStepComplete={onStepComplete}
        onDrawingFinished={() => setStatus('DONE')}
        key={canvasKey}
      />
      <Controls 
        status={status}
        explanation={explanation}
        error={error}
        steps={whiteboardSteps}
        currentStepIndex={currentStepIndex}
        onSubmit={handleSubmit}
      />
    </div>
  );
};

export default App;
