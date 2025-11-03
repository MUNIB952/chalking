


import React, { useState, useEffect } from 'react';
import { EXAMPLE_PROMPTS } from '../constants';
import { AppStatus, WhiteboardStep } from '../types';
import { SendIcon, ChevronDownIcon, ChevronUpIcon, RepeatIcon, PlayIcon, PauseIcon } from './icons';

interface ControlsProps {
  status: AppStatus;
  explanation: string;
  error: string | null;
  steps: WhiteboardStep[];
  currentStepIndex: number;
  isPaused: boolean;
  onSubmit: (prompt: string) => void;
  onRepeat: () => void;
  onTogglePause: () => void;
}

const ExamplePromptsMarquee: React.FC<{ onExampleClick: (prompt: string) => void, isDisabled: boolean }> = ({ onExampleClick, isDisabled }) => {
    // Duplicate the prompts to create a seamless looping effect
    const duplicatedPrompts = [...EXAMPLE_PROMPTS, ...EXAMPLE_PROMPTS];

    return (
        <div className="w-full overflow-hidden relative h-full flex items-center fade-mask-x-strong">
            <div className="flex animate-marquee hover:[animation-play-state:paused]">
                {duplicatedPrompts.map((ex, index) => (
                    <button
                        key={`${ex.label}-${index}`}
                        onClick={() => onExampleClick(ex.prompt)}
                        disabled={isDisabled}
                        className="px-2.5 sm:px-4 py-1 sm:py-1.5 bg-sky-500/10 border border-sky-500/20 text-sky-200 rounded-full text-xs sm:text-sm hover:bg-sky-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap mx-1.5 sm:mx-2 active:scale-95"
                    >
                        {ex.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

export const Controls: React.FC<ControlsProps> = ({
  status,
  explanation,
  error,
  steps,
  currentStepIndex,
  isPaused,
  onSubmit,
  onRepeat,
  onTogglePause,
}) => {
  const [prompt, setPrompt] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  
  const isInputDisabled = status === 'THINKING' || status === 'PREPARING' || status === 'DRAWING';
  const showIdleState = status === 'IDLE' || status === 'DONE' || status === 'ERROR';
  
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
  
  const progressPercentage = steps.length > 0 ? (status === 'DONE' ? 100 : ((currentStepIndex + 1) / steps.length) * 100) : 0;
  
  const pauseControlDisabled = status !== 'DRAWING';
  const repeatControlDisabled = !(status === 'DONE' || (status === 'DRAWING' && isPaused));


  return (
    <div className="absolute bottom-2 left-2 right-2 sm:bottom-4 sm:left-4 sm:right-4 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:right-auto max-w-2xl w-full md:w-auto md:min-w-[640px]">
      <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-600/50 rounded-xl sm:rounded-2xl shadow-2xl p-2.5 sm:p-4 pt-1.5 sm:pt-2 pb-2 sm:pb-3 text-white">

        {/* --- Top Section: Swaps between Examples and Progress --- */}
        <div className="flex items-center justify-between w-full gap-2 sm:gap-3 h-[36px] sm:h-[44px]">
          <div className="flex-grow min-w-0 h-full relative">
              {/* Examples Marquee */}
              <div className={`absolute inset-0 transition-opacity duration-300 ${showIdleState ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <ExamplePromptsMarquee onExampleClick={handleExampleClick} isDisabled={isInputDisabled} />
              </div>

              {/* Progress Bar and Status */}
              <div className={`absolute inset-0 transition-opacity duration-300 flex flex-col justify-center ${!showIdleState ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                 <span className="text-xs sm:text-sm text-cyan-300 text-glow-cyan truncate">{explanation}</span>
                 { (status === 'DRAWING' || status === 'DONE') && steps.length > 0 && (
                   <>
                    <div className="w-full bg-slate-700 rounded-full h-1 sm:h-1.5 mt-0.5 sm:mt-1">
                      <div
                        className="bg-cyan-400 h-1 sm:h-1.5 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progressPercentage}%` }}
                      ></div>
                    </div>
                   </>
                 )}
              </div>
          </div>

          <div className="flex-shrink-0 flex items-center gap-0.5">
            <button
              onClick={onTogglePause}
              disabled={pauseControlDisabled}
              className="p-1 sm:p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-90"
              aria-label={isPaused ? 'Resume explanation' : 'Pause explanation'}
              title={isPaused ? 'Resume explanation' : 'Pause explanation'}
            >
              {isPaused ? <PlayIcon className="w-4 h-4 sm:w-5 sm:h-5" /> : <PauseIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
            <button
              onClick={onRepeat}
              disabled={repeatControlDisabled}
              className="p-1 sm:p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-90"
              aria-label="Repeat explanation"
              title="Repeat explanation"
            >
              <RepeatIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={() => setIsVisible(!isVisible)}
              className="p-1 sm:p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors active:scale-90"
              aria-label={isVisible ? 'Hide controls' : 'Show controls'}
            >
              {isVisible ? <ChevronDownIcon className="w-4 h-4 sm:w-5 sm:h-5" /> : <ChevronUpIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          </div>
        </div>

        {/* --- COLLAPSIBLE CONTENT --- */}
        <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isVisible ? 'max-h-[500px] opacity-100 pt-2 sm:pt-3' : 'max-h-0 opacity-0'}`}>

          {/* Transcript Area */}
          {(status === 'DRAWING' || status === 'DONE' || status === 'ERROR') && !showIdleState && (
            <div className="min-h-[20px] sm:min-h-[24px] mb-2 sm:mb-3 px-0.5 sm:px-1">
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">{explanation}</p>
                {error && <p className="mt-1 sm:mt-2 text-red-400 text-xs sm:text-sm">{error}</p>}
            </div>
          )}

          {/* Input Area */}
          <div>
            <div className="relative">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g., Explain how a transformer model works"
                disabled={isInputDisabled}
                className="w-full bg-slate-900/80 border border-slate-600 rounded-lg py-2.5 sm:py-3 pl-3 sm:pl-4 pr-10 sm:pr-12 text-sm sm:text-base text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition"
                aria-label="Enter your prompt"
              />
              <button
                onClick={() => onSubmit(prompt)}
                disabled={isInputDisabled || !prompt.trim()}
                className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 disabled:text-slate-600 disabled:bg-transparent disabled:cursor-not-allowed transition-colors active:scale-90"
                aria-label="Submit prompt"
              >
                <SendIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};