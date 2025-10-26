
import React, { useState } from 'react';
import { EXAMPLE_PROMPTS } from '../constants';
import { AppStatus, WhiteboardStep } from '../types';
import { SendIcon, LoaderIcon, ChevronDownIcon, ChevronUpIcon, RepeatIcon } from './icons';

interface ControlsProps {
  status: AppStatus;
  explanation: string;
  error: string | null;
  steps: WhiteboardStep[];
  currentStepIndex: number;
  onSubmit: (prompt: string) => void;
  onRepeat: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  status,
  explanation,
  error,
  steps,
  currentStepIndex,
  onSubmit,
  onRepeat,
}) => {
  const [prompt, setPrompt] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  
  const isInputDisabled = status === 'THINKING' || status === 'PREPARING' || status === 'DRAWING';
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isInputDisabled && prompt.trim()) {
        onSubmit(prompt);
      }
    }
  };

  const handleExampleClick = (examplePrompt: string) => {
    setPrompt(examplePrompt);
    onSubmit(examplePrompt);
  };
  
  const showProgress = steps.length > 1 && ['DRAWING', 'DONE'].includes(status);
  const progressPercentage = status === 'DONE' ? 100 : ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-auto md:mx-auto max-w-2xl w-full">
      <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-600/50 rounded-2xl shadow-2xl p-4 text-white relative">
        <div className="absolute top-3 right-3 flex items-center gap-1">
            {status === 'DONE' && (
              <button
                onClick={onRepeat}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                aria-label="Repeat explanation"
                title="Repeat explanation"
              >
                <RepeatIcon className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={() => setIsVisible(!isVisible)}
              className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              aria-label={isVisible ? 'Hide controls' : 'Show controls'}
            >
              {isVisible ? <ChevronDownIcon className="w-5 h-5" /> : <ChevronUpIcon className="w-5 h-5" />}
            </button>
        </div>

        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isVisible ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
          {showProgress && (
            <div className="px-2 mb-3 pt-1">
              <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                <span>Progress</span>
                <span>Step {Math.min(currentStepIndex + 1, steps.length)} / {steps.length}</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-1.5">
                <div 
                  className="bg-cyan-400 h-1.5 rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
            </div>
          )}

          <div className="min-h-[48px] mb-3 px-2 pt-2">
              <div className="flex items-start gap-3">
                  {(status === 'THINKING' || status === 'PREPARING') && <LoaderIcon className="w-5 h-5 text-cyan-400 mt-1 flex-shrink-0" />}
                  <p className="text-slate-100">{explanation}</p>
              </div>
              {error && <p className="mt-2 text-red-400 text-sm px-1">{error}</p>}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => handleExampleClick(ex.prompt)}
                  disabled={isInputDisabled}
                  className="px-3 py-1 bg-sky-500/20 text-sky-200 rounded-full text-sm hover:bg-sky-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ex.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g., Explain how a transformer model works"
                disabled={isInputDisabled}
                className="w-full bg-slate-900/80 border border-slate-600 rounded-lg py-3 pl-4 pr-12 text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition"
                aria-label="Enter your prompt"
              />
              <button
                onClick={() => onSubmit(prompt)}
                disabled={isInputDisabled || !prompt.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 disabled:text-slate-600 disabled:bg-transparent disabled:cursor-not-allowed transition-colors"
                aria-label="Submit prompt"
              >
                <SendIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};