
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PROMPTS } from '../constants';
import { AppStatus, WhiteboardStep } from '../types';
import {
  ExpandIcon, CollapseIcon, RepeatIcon, MuteIcon, UnmuteIcon, SendIcon, PlayIcon, PauseIcon
} from './icons';

interface ComposerProps {
  status: AppStatus;
  explanation: string;
  error: string | null;
  steps: WhiteboardStep[];
  currentStepIndex: number;
  isPaused: boolean;
  isMuted: boolean;
  onSubmit: (prompt: string) => void;
  onRepeat: () => void;
  onTogglePause: () => void;
  onToggleMute: () => void;
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
  const itemHeight = 32; // Corresponds to h-8 in Tailwind CSS

  // Effect for the main animation interval
  useEffect(() => {
    if (!isPlaying || isHovered) return;
    const intervalId = setInterval(() => {
      setCurrentIndex(prev => prev + 1);
    }, 2500); // 2.5s per prompt
    return () => clearInterval(intervalId);
  }, [isPlaying, isHovered]);

  const onTransitionEnd = () => {
    if (currentIndex >= PROMPTS.length) {
      setIsTransitionEnabled(false);
      setCurrentIndex(0);
      // Use requestAnimationFrame to ensure the non-transitioned state is rendered
      requestAnimationFrame(() => {
        setIsTransitionEnabled(true);
      });
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
              className="text-left text-lg transition-colors text-neutral-400 hover:text-neutral-200 whitespace-nowrap"
            >
              {prompt}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export const Composer: React.FC<ComposerProps> = ({
  status,
  explanation,
  error,
  steps,
  currentStepIndex,
  isPaused,
  isMuted,
  onSubmit,
  onRepeat,
  onTogglePause,
  onToggleMute,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isInputDisabled = status === 'THINKING' || status === 'PREPARING' || status === 'DRAWING';
  const showIdleState = status === 'IDLE' || status === 'DONE' || status === 'ERROR';
  const showProgress = status === 'DRAWING' || status === 'DONE';
  const showTranscript = status === 'DRAWING';

  const currentStepName = steps[currentStepIndex]?.stepName || '';

  const handlePromptClick = (prompt: string) => {
    setInputValue(prompt);
    if (!isExpanded) setIsExpanded(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isInputDisabled && inputValue.trim()) {
        onSubmit(inputValue);
        setInputValue(''); // Clear input after submission
      }
    }
  };

  const handleSubmit = () => {
    if (!isInputDisabled && inputValue.trim()) {
      onSubmit(inputValue);
      setInputValue(''); // Clear input after submission
    }
  };

  const progressPercentage = steps.length > 0 ? (status === 'DONE' ? 100 : ((currentStepIndex + 1) / steps.length) * 100) : 0;

  const ControlButton: React.FC<{onClick: () => void, children: React.ReactNode, className?: string}> = ({ onClick, children, className }) => {
    return (
      <button
        onClick={onClick}
        className={`p-3 w-12 h-12 flex items-center justify-center rounded-full bg-black text-neutral-400 border border-neutral-800 cursor-pointer ${className || ''}`}
        style={{ pointerEvents: 'auto' }}
      >
        {children}
      </button>
    );
  };

  return (
    <div
      className="absolute bottom-4 left-4 right-4 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:right-auto w-full max-w-4xl md:w-auto md:min-w-[700px] z-50"
      style={{ pointerEvents: 'none' }}
    >
      <div className="bg-[#101010] border border-[#1F51FF]/50 rounded-2xl p-1" style={{ pointerEvents: 'auto' }}>

        {/* Row 1: Progress Bar / Step Name (LEFT) or Animated Prompts (LEFT) + Control Buttons (RIGHT) */}
        <div className="flex items-center justify-between h-12">
          <div className="flex-1 mr-2 pl-1 min-w-0" style={{ pointerEvents: 'auto' }}>
            {showIdleState ? (
              <AnimatedPrompts onPromptClick={handlePromptClick} isPlaying={true} />
            ) : showProgress ? (
              <div className="flex flex-col justify-center h-10 space-y-1">
                {/* Step Name */}
                {currentStepName && (
                  <div className="text-xs text-neutral-400 truncate">
                    {currentStepName}
                  </div>
                )}
                {/* Progress Bar */}
                <div className="w-full max-w-md">
                  <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${progressPercentage}%`,
                        backgroundColor: '#1F51FF',
                        transition: 'width 0.3s linear'
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Control Buttons - RIGHT */}
          <div className="flex items-center gap-1 mr-1" style={{ pointerEvents: 'auto' }}>
            {/* Mute - Always visible during DRAWING, desktop-only otherwise */}
            <ControlButton onClick={onToggleMute} className={showProgress ? '' : 'hidden sm:flex'}>
              {isMuted ? <MuteIcon /> : <UnmuteIcon />}
            </ControlButton>
            {/* Repeat - Desktop only */}
            <ControlButton onClick={onRepeat} className="hidden sm:flex">
              <RepeatIcon />
            </ControlButton>
            {/* Pause - Always visible during DRAWING, desktop-only otherwise */}
            <ControlButton onClick={onTogglePause} className={showProgress ? '' : 'hidden sm:flex'}>
              {isPaused ? <PlayIcon /> : <PauseIcon />}
            </ControlButton>
            {/* Expand/Collapse - Always visible */}
            <ControlButton onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
            </ControlButton>
          </div>
        </div>

        {/* Collapsible Content - Transcript and Input Field */}
        {isExpanded && (
          <div className="mt-1.5">
            {/* Row 2: Transcript - Only during DRAWING */}
            {showTranscript && explanation && (
              <div className="mb-1.5 px-2">
                <p className="text-sm text-neutral-400 leading-relaxed">{explanation}</p>
                {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
              </div>
            )}

            {/* Row 3: Input Field */}
            <div className="relative flex items-center bg-black rounded-full p-1" style={{ pointerEvents: 'auto' }}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Or type your own idea..."
                disabled={isInputDisabled}
                className="flex-grow bg-transparent text-white placeholder-neutral-500 text-lg px-4 py-2 border-none focus:outline-none focus:ring-0 disabled:opacity-50 custom-caret"
                style={{ pointerEvents: 'auto' }}
              />
              <button
                onClick={handleSubmit}
                disabled={isInputDisabled || !inputValue.trim()}
                className="w-12 h-12 flex items-center justify-center bg-[#1F51FF] text-white rounded-full transition-all duration-200 transform hover:scale-105 active:scale-95 disabled:bg-blue-800 disabled:cursor-not-allowed"
                style={{ pointerEvents: 'auto' }}
                aria-label="Send prompt"
              >
                <SendIcon />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
