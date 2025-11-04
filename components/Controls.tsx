

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PROMPTS } from '../constants';
import { AppStatus, WhiteboardStep } from '../types';
import {
  ExpandIcon, CollapseIcon, RepeatIcon, MuteIcon, UnmuteIcon, SendIcon, PlayIcon, PauseIcon
} from './icons';

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

// --- AnimatedPrompts component ---
interface AnimatedPromptsProps {
  onPromptClick: (prompt: string) => void;
  isPlaying: boolean;
}

const AnimatedPrompts: React.FC<AnimatedPromptsProps> = ({ onPromptClick, isPlaying }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isTransitionEnabled, setIsTransitionEnabled] = useState(true);

  const promptsWithLoop = useMemo(() => [...PROMPTS, PROMPTS[0]], []);
  const itemHeight = 32; // h-8

  useEffect(() => {
    if (isPlaying && !isHovered) {
      const interval = setInterval(() => {
        setCurrentIndex(prev => prev + 1);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [isPlaying, isHovered]);

  useEffect(() => {
    if (currentIndex === 0 && !isTransitionEnabled) {
      const timeout = setTimeout(() => {
        setIsTransitionEnabled(true);
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [currentIndex, isTransitionEnabled]);

  const onTransitionEnd = () => {
    if (currentIndex >= PROMPTS.length) {
      setIsTransitionEnabled(false);
      setCurrentIndex(0);
    }
  };

  return (
    <div
      className="relative h-8 overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className="absolute w-full"
        style={{
          transform: `translateY(-${currentIndex * itemHeight}px)`,
          transition: isTransitionEnabled ? 'transform 0.5s ease-in-out' : 'none',
        }}
        onTransitionEnd={onTransitionEnd}
      >
        {promptsWithLoop.map((prompt, index) => (
          <div key={`${prompt}-${index}`} className="h-8 flex items-center">
            <button
              onClick={() => onPromptClick(prompt)}
              className="text-left text-xl transition-colors text-neutral-500 hover:text-white whitespace-nowrap"
            >
              {prompt}
            </button>
          </div>
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
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isInputDisabled = status === 'THINKING' || status === 'PREPARING' || status === 'DRAWING';
  const showIdleState = status === 'IDLE' || status === 'DONE' || status === 'ERROR';
  const showProgress = status === 'DRAWING' || status === 'DONE';
  const showTranscript = status === 'DRAWING';

  const handlePromptClick = (prompt: string) => {
    setInputValue(prompt);
    if (!isExpanded) setIsExpanded(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isInputDisabled && inputValue.trim()) {
        onSubmit(inputValue);
      }
    }
  };

  const progressPercentage = steps.length > 0 ? (status === 'DONE' ? 100 : ((currentStepIndex + 1) / steps.length) * 100) : 0;

  const ControlButton: React.FC<{onClick: () => void, children: React.ReactNode}> = ({ onClick, children }) => (
    <button
      onClick={onClick}
      className="p-2 w-10 h-10 flex items-center justify-center rounded-lg bg-black text-neutral-400 hover:text-white transition-all duration-200 transform hover:scale-110 active:scale-95"
    >
      {children}
    </button>
  );

  return (
    <div className="absolute bottom-4 left-4 right-4 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:right-auto w-full max-w-3xl md:w-auto md:min-w-[700px]">
      <div className="bg-neutral-900 rounded-2xl p-2 transition-all duration-300 hover:shadow-[0_0_20px_0px_rgba(255,255,255,0.05)]">

        {/* Row 1: Progress Bar (LEFT) or Prompts (LEFT) + Buttons (RIGHT) */}
        <div className="flex items-center justify-between h-12">
          <div className="flex-1 mr-2 pl-1 min-w-0">
            {showIdleState ? (
              <AnimatedPrompts onPromptClick={handlePromptClick} isPlaying={true} />
            ) : showProgress ? (
              <div className="flex items-center h-8">
                <div className="w-full max-w-md">
                  <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${progressPercentage}%`,
                        backgroundColor: '#1F51FF'
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Control Buttons - RIGHT */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <ControlButton onClick={onRepeat}>
              <RepeatIcon />
            </ControlButton>
            <ControlButton onClick={onTogglePause}>
              {isPaused ? <PlayIcon /> : <PauseIcon />}
            </ControlButton>
            <ControlButton onClick={() => setIsMuted(!isMuted)}>
              {isMuted ? <MuteIcon /> : <UnmuteIcon />}
            </ControlButton>
            <ControlButton onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
            </ControlButton>
          </div>
        </div>

        {/* Collapsible Content */}
        <div className={`transition-all duration-500 ease-in-out grid ${isExpanded ? 'grid-rows-[1fr] opacity-100 pt-1.5' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden min-h-0">

            {/* Row 2: Transcript - Only during DRAWING */}
            {showTranscript && explanation && (
              <div className="mb-2 px-1">
                <p className="text-sm text-neutral-400 leading-relaxed">{explanation}</p>
                {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
              </div>
            )}

            {/* Row 3: Input Field */}
            <div className="relative flex items-center bg-black rounded-lg p-1">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question or enter a command..."
                disabled={isInputDisabled}
                className="w-full bg-transparent text-white placeholder-neutral-500 text-lg py-2 pl-3 pr-14 focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={() => onSubmit(inputValue)}
                disabled={isInputDisabled || !inputValue.trim()}
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full transition-all duration-300 transform hover:scale-105 active:scale-95 ${inputValue.trim() && !isInputDisabled ? 'bg-[#1F51FF] text-white' : 'bg-neutral-800 text-neutral-400'}`}
                aria-label="Submit prompt"
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
