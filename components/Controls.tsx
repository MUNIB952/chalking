

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
                        className="px-3 py-1.5 bg-gray-700/60 border border-gray-600/50 text-gray-400 rounded-lg text-sm hover:bg-gray-600/60 hover:text-gray-300 hover:border-gray-500/50 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap mx-1.5"
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
    <div className="absolute bottom-4 left-4 right-4 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:right-auto max-w-3xl w-full md:w-auto md:min-w-[700px]" style={{ fontFamily: 'Arial, sans-serif' }}>
      <div className="bg-gray-800/90 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden">

        {/* Collapsible Content Area */}
        <div className={`transition-all duration-300 ease-out overflow-hidden ${isVisible ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
          {/* Progress Bar and Status */}
          {!showIdleState && (
            <div className="px-4 pt-4 pb-3">
              <span className="text-sm text-gray-300 block mb-2">{explanation}</span>
              {(status === 'DRAWING' || status === 'DONE') && steps.length > 0 && (
                <div className="w-full bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
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
          )}

          {/* Error Message */}
          {error && (
            <div className="px-4 pb-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Example Options - Above Text Field */}
          {showIdleState && (
            <div className="px-4 pt-4 pb-3 h-[52px]">
              <ExamplePromptsMarquee onExampleClick={handleExampleClick} isDisabled={isInputDisabled} />
            </div>
          )}
        </div>

        {/* Bottom Section: Text Field + Buttons */}
        <div className="p-3">
          <div className="flex items-center gap-2">
            {/* Text Field */}
            <div className="flex-grow relative">
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me to explain any concept..."
                disabled={isInputDisabled}
                className="w-full bg-black border border-gray-700/50 rounded-xl py-3 pl-4 pr-12 text-base text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                style={{ fontFamily: 'Arial, sans-serif' }}
                aria-label="Enter your prompt"
              />
              {/* Submit Arrow */}
              <button
                onClick={() => onSubmit(prompt)}
                disabled={isInputDisabled || !prompt.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors duration-200"
                aria-label="Submit prompt"
              >
                <SendIcon
                  className="w-5 h-5"
                  style={{ color: (prompt.trim() && !isInputDisabled) ? '#1F51FF' : '#9ca3af' }}
                />
              </button>
            </div>

            {/* Three Control Buttons */}
            {!pauseControlDisabled && (
              <button
                onClick={onTogglePause}
                className="p-3 rounded-xl text-gray-400 bg-gray-700/40 hover:text-white hover:bg-gray-700/60 transition-all duration-200"
                aria-label={isPaused ? 'Resume explanation' : 'Pause explanation'}
                title={isPaused ? 'Resume explanation' : 'Pause explanation'}
              >
                {isPaused ? <PlayIcon className="w-5 h-5" /> : <PauseIcon className="w-5 h-5" />}
              </button>
            )}

            {!repeatControlDisabled && (
              <button
                onClick={onRepeat}
                className="p-3 rounded-xl text-gray-400 bg-gray-700/40 hover:text-white hover:bg-gray-700/60 transition-all duration-200"
                aria-label="Repeat explanation"
                title="Repeat explanation"
              >
                <RepeatIcon className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={() => setIsVisible(!isVisible)}
              className="p-3 rounded-xl text-gray-400 bg-gray-700/40 hover:text-white hover:bg-gray-700/60 transition-all duration-200"
              aria-label={isVisible ? 'Collapse' : 'Expand'}
            >
              {isVisible ? <ChevronDownIcon className="w-5 h-5" /> : <ChevronUpIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
