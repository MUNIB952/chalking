

import React, { useState, useEffect, useRef } from 'react';
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
    const duplicatedPrompts = [...EXAMPLE_PROMPTS, ...EXAMPLE_PROMPTS];

    return (
        <div className="w-full overflow-hidden relative h-full flex items-center fade-mask-x-strong">
            <div className="flex animate-marquee hover:[animation-play-state:paused]">
                {duplicatedPrompts.map((ex, index) => (
                    <button
                        key={`${ex.label}-${index}`}
                        onClick={() => onExampleClick(ex.prompt)}
                        disabled={isDisabled}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-gray-700/40 to-gray-600/40 border border-gray-500/30 text-gray-200 rounded-2xl text-xs sm:text-sm font-medium hover:from-[#1F51FF]/20 hover:to-[#1F51FF]/10 hover:border-[#1F51FF]/40 hover:text-white transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap mx-1.5 sm:mx-2 active:scale-95 shadow-lg hover:shadow-[#1F51FF]/20 backdrop-blur-sm"
                        style={{ fontFamily: 'Arial, sans-serif' }}
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
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div className="absolute bottom-2 left-2 right-2 sm:bottom-4 sm:left-4 sm:right-4 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:right-auto max-w-2xl w-full md:w-auto md:min-w-[680px]" style={{ fontFamily: 'Arial, sans-serif' }}>
      <div className="bg-gradient-to-b from-gray-800/60 to-gray-900/60 backdrop-blur-2xl border border-gray-600/40 rounded-3xl shadow-2xl p-3 sm:p-5 text-white animate-[slideUp_0.4s_ease-out]">

        {/* Top Section: Swaps between Examples and Progress */}
        <div className="flex items-center justify-between w-full gap-3 sm:gap-4 min-h-[44px] sm:min-h-[52px]">
          <div className="flex-grow min-w-0 h-full relative">
              {/* Examples Marquee */}
              <div className={`absolute inset-0 transition-all duration-500 ${showIdleState ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
                <ExamplePromptsMarquee onExampleClick={handleExampleClick} isDisabled={isInputDisabled} />
              </div>

              {/* Progress Bar and Status */}
              <div className={`absolute inset-0 transition-all duration-500 flex flex-col justify-center ${!showIdleState ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
                 <span className="text-sm sm:text-base text-gray-100 font-medium truncate tracking-wide" style={{ fontFamily: 'Arial, sans-serif' }}>{explanation}</span>
                 { (status === 'DRAWING' || status === 'DONE') && steps.length > 0 && (
                   <div className="w-full bg-gray-700/50 rounded-full h-1.5 sm:h-2 mt-1.5 sm:mt-2 overflow-hidden shadow-inner">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
                        style={{
                          width: `${progressPercentage}%`,
                          background: 'linear-gradient(90deg, #1F51FF 0%, #4D7FFF 100%)',
                          boxShadow: '0 0 12px rgba(31, 81, 255, 0.6)'
                        }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"></div>
                      </div>
                    </div>
                 )}
              </div>
          </div>

          <div className="flex-shrink-0 flex items-center gap-1 sm:gap-1.5">
            {!pauseControlDisabled && (
              <button
                onClick={onTogglePause}
                className="group relative p-2 sm:p-2.5 rounded-2xl text-gray-300 bg-gray-700/40 hover:bg-[#1F51FF]/20 border border-gray-600/40 hover:border-[#1F51FF]/50 transition-all duration-300 active:scale-95 hover:shadow-lg hover:shadow-[#1F51FF]/30 backdrop-blur-sm"
                aria-label={isPaused ? 'Resume explanation' : 'Pause explanation'}
                title={isPaused ? 'Resume explanation' : 'Pause explanation'}
              >
                {isPaused ? <PlayIcon className="w-5 h-5 sm:w-6 sm:h-6 text-gray-200 group-hover:text-white transition-colors" /> : <PauseIcon className="w-5 h-5 sm:w-6 sm:h-6 text-gray-200 group-hover:text-white transition-colors" />}
              </button>
            )}
            {!repeatControlDisabled && (
              <button
                onClick={onRepeat}
                className="group relative p-2 sm:p-2.5 rounded-2xl text-gray-300 bg-gray-700/40 hover:bg-[#1F51FF]/20 border border-gray-600/40 hover:border-[#1F51FF]/50 transition-all duration-300 active:scale-95 hover:shadow-lg hover:shadow-[#1F51FF]/30 backdrop-blur-sm"
                aria-label="Repeat explanation"
                title="Repeat explanation"
              >
                <RepeatIcon className="w-5 h-5 sm:w-6 sm:h-6 text-gray-200 group-hover:text-white transition-colors" />
              </button>
            )}
            <button
              onClick={() => setIsVisible(!isVisible)}
              className="group relative p-2 sm:p-2.5 rounded-2xl text-gray-300 bg-gray-700/40 hover:bg-gray-600/40 border border-gray-600/40 hover:border-gray-500/50 transition-all duration-300 active:scale-95 backdrop-blur-sm"
              aria-label={isVisible ? 'Hide controls' : 'Show controls'}
            >
              {isVisible ? <ChevronDownIcon className="w-5 h-5 sm:w-6 sm:h-6 text-gray-300 group-hover:text-white transition-colors" /> : <ChevronUpIcon className="w-5 h-5 sm:w-6 sm:h-6 text-gray-300 group-hover:text-white transition-colors" />}
            </button>
          </div>
        </div>

        {/* COLLAPSIBLE CONTENT */}
        <div className={`transition-all duration-500 ease-out overflow-hidden ${isVisible ? 'max-h-[500px] opacity-100 mt-3 sm:mt-4' : 'max-h-0 opacity-0 mt-0'}`}>

          {/* Transcript Area */}
          {(status === 'DRAWING' || status === 'DONE' || status === 'ERROR') && !showIdleState && (
            <div className="min-h-[24px] sm:min-h-[28px] mb-3 sm:mb-4 px-1 animate-[fadeIn_0.3s_ease-out]">
                <p className="text-sm sm:text-base text-gray-200 leading-relaxed font-normal" style={{ fontFamily: 'Arial, sans-serif' }}>{explanation}</p>
                {error && <p className="mt-2 sm:mt-3 text-red-400 text-sm sm:text-base font-medium">{error}</p>}
            </div>
          )}

          {/* Input Area */}
          <div>
            <div className="relative group">
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me to explain any concept..."
                disabled={isInputDisabled}
                className="w-full bg-gradient-to-br from-gray-800/60 to-gray-900/60 border border-gray-600/50 rounded-2xl py-3 sm:py-4 pl-4 sm:pl-5 pr-12 sm:pr-14 text-sm sm:text-base text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1F51FF]/50 focus:border-[#1F51FF]/60 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg focus:shadow-[#1F51FF]/20 backdrop-blur-sm"
                style={{ fontFamily: 'Arial, sans-serif' }}
                aria-label="Enter your prompt"
              />
              <button
                onClick={() => onSubmit(prompt)}
                disabled={isInputDisabled || !prompt.trim()}
                className="absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 p-2 sm:p-2.5 rounded-xl bg-gradient-to-r from-[#1F51FF] to-[#4D7FFF] text-white hover:from-[#1740CC] hover:to-[#3D6FEF] disabled:from-gray-700/50 disabled:to-gray-700/50 disabled:text-gray-500 disabled:cursor-not-allowed transition-all duration-300 active:scale-90 shadow-lg hover:shadow-[#1F51FF]/50 disabled:shadow-none"
                aria-label="Submit prompt"
              >
                <SendIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
