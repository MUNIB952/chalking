

import React, { useState, useRef } from 'react';
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
                        className="px-3 sm:px-4 py-1.5 bg-gray-800/40 border border-gray-700/50 text-gray-300 rounded-lg text-xs sm:text-sm hover:bg-gray-700/50 hover:text-white hover:border-gray-600 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap mx-1.5"
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
      <div className="bg-gray-900/70 backdrop-blur-xl border border-gray-700/60 rounded-2xl shadow-xl p-3 sm:p-4 text-white">

        {/* Top Section: Examples or Progress */}
        <div className="flex items-center justify-between w-full gap-2 sm:gap-3 min-h-[40px] sm:min-h-[44px]">
          <div className="flex-grow min-w-0 h-full relative">
              {/* Examples Marquee */}
              <div className={`absolute inset-0 transition-opacity duration-300 ${showIdleState ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <ExamplePromptsMarquee onExampleClick={handleExampleClick} isDisabled={isInputDisabled} />
              </div>

              {/* Progress Bar and Status */}
              <div className={`absolute inset-0 transition-opacity duration-300 flex flex-col justify-center ${!showIdleState ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                 <span className="text-sm sm:text-base text-gray-200 truncate">{explanation}</span>
                 { (status === 'DRAWING' || status === 'DONE') && steps.length > 0 && (
                   <div className="w-full bg-gray-800/60 rounded-full h-1.5 mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${progressPercentage}%`,
                          backgroundColor: '#1F51FF'
                        }}
                      ></div>
                    </div>
                 )}
              </div>
          </div>

          <div className="flex-shrink-0 flex items-center gap-1">
            {!pauseControlDisabled && (
              <button
                onClick={onTogglePause}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition-all duration-200"
                aria-label={isPaused ? 'Resume explanation' : 'Pause explanation'}
                title={isPaused ? 'Resume explanation' : 'Pause explanation'}
              >
                {isPaused ? <PlayIcon className="w-5 h-5" /> : <PauseIcon className="w-5 h-5" />}
              </button>
            )}
            {!repeatControlDisabled && (
              <button
                onClick={onRepeat}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition-all duration-200"
                aria-label="Repeat explanation"
                title="Repeat explanation"
              >
                <RepeatIcon className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => setIsVisible(!isVisible)}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition-all duration-200"
              aria-label={isVisible ? 'Hide controls' : 'Show controls'}
            >
              {isVisible ? <ChevronDownIcon className="w-5 h-5" /> : <ChevronUpIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* COLLAPSIBLE CONTENT */}
        <div className={`transition-all duration-400 ease-out overflow-hidden ${isVisible ? 'max-h-[500px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}>

          {/* Transcript Area */}
          {(status === 'DRAWING' || status === 'DONE' || status === 'ERROR') && !showIdleState && (
            <div className="min-h-[24px] mb-3 px-1">
                <p className="text-sm text-gray-300 leading-relaxed">{explanation}</p>
                {error && <p className="mt-2 text-red-400 text-sm">{error}</p>}
            </div>
          )}

          {/* Input Area */}
          <div>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me to explain any concept..."
                disabled={isInputDisabled}
                className="w-full bg-gray-800/50 border border-gray-700/60 rounded-xl py-3 pl-4 pr-12 text-sm sm:text-base text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:bg-gray-800/70 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                style={{ fontFamily: 'Arial, sans-serif' }}
                aria-label="Enter your prompt"
              />
              <button
                onClick={() => onSubmit(prompt)}
                disabled={isInputDisabled || !prompt.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all duration-200"
                style={{
                  backgroundColor: (isInputDisabled || !prompt.trim()) ? 'transparent' : '#1F51FF',
                  color: (isInputDisabled || !prompt.trim()) ? '#6b7280' : 'white',
                  cursor: (isInputDisabled || !prompt.trim()) ? 'not-allowed' : 'pointer'
                }}
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
