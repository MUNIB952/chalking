
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

// --- AnimatedStatusMessages component ---
const STATUS_MESSAGES = [
  'Thinking...',
  'Drawing...',
  'Generating audio...',
  'Finding the best way...',
  'Planning the visualization...',
  'Crafting the explanation...',
];

const AnimatedStatusMessages: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitionEnabled, setIsTransitionEnabled] = useState(true);

  const messagesWithLoop = useMemo(() => [...STATUS_MESSAGES, STATUS_MESSAGES[0]], []);
  const itemHeight = 32;

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentIndex(prev => prev + 1);
    }, 2500);
    return () => clearInterval(intervalId);
  }, []);

  const onTransitionEnd = () => {
    if (currentIndex >= STATUS_MESSAGES.length) {
      setIsTransitionEnabled(false);
      setCurrentIndex(0);
      requestAnimationFrame(() => {
        setIsTransitionEnabled(true);
      });
    }
  };

  return (
    <div className="relative h-8 overflow-hidden" aria-live="polite" aria-atomic="true">
      <div
        className="absolute w-full"
        style={{
          transform: `translateY(-${currentIndex * itemHeight}px)`,
          transition: isTransitionEnabled ? 'transform 0.5s ease-in-out' : 'none',
        }}
        onTransitionEnd={onTransitionEnd}
      >
        {messagesWithLoop.map((message, index) => (
          <div key={`${message}-${index}`} className="h-8 flex items-center">
            <span className="text-left text-lg text-neutral-400 whitespace-nowrap">
              {message}
            </span>
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
  const [submittedValue, setSubmittedValue] = useState(''); // Track the last submitted value
  const inputRef = useRef<HTMLInputElement>(null);

  const isInputDisabled = status === 'THINKING' || status === 'PREPARING';
  const showIdleState = status === 'IDLE' || status === 'DONE' || status === 'ERROR';
  const showProgress = status === 'DRAWING' || status === 'DONE';
  const showTranscript = status === 'DRAWING';
  const showStatusMessages = status === 'THINKING' || status === 'PREPARING';

  const currentStepName = steps[currentStepIndex]?.stepName || '';

  const handlePromptClick = (prompt: string) => {
    setInputValue(prompt);
    if (!isExpanded) setIsExpanded(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isInputDisabled && inputValue.trim()) {
        setSubmittedValue(inputValue); // Save submitted value
        onSubmit(inputValue);
        // DON'T clear input - keep it visible
      }
    }
  };

  const handleSubmit = () => {
    if (!isInputDisabled && inputValue.trim()) {
      setSubmittedValue(inputValue); // Save submitted value
      onSubmit(inputValue);
      // DON'T clear input - keep it visible
    }
  };

  // Clear input when status changes back to IDLE/DONE/ERROR (after generation completes)
  useEffect(() => {
    if (status === 'DONE' || status === 'ERROR') {
      setInputValue('');
      setSubmittedValue('');
    }
  }, [status]);

  const progressPercentage = steps.length > 0 ? (status === 'DONE' ? 100 : ((currentStepIndex + 1) / steps.length) * 100) : 0;

  return (
    <div
      className="absolute bottom-4 left-4 right-4 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:right-auto w-full max-w-4xl md:w-auto md:min-w-[700px] z-50"
    >
      <div className="bg-[#101010] border border-[#1F51FF]/50 rounded-2xl p-1">

        {/* Row 1: Progress Bar / Step Name (LEFT) or Animated Prompts/Status (LEFT) + Control Buttons (RIGHT) */}
        <div className="flex items-center justify-between h-12">
          <div className="flex-1 mr-2 pl-1 min-w-0">
            {showIdleState ? (
              <AnimatedPrompts onPromptClick={handlePromptClick} isPlaying={true} />
            ) : showStatusMessages ? (
              <AnimatedStatusMessages />
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
          <div className="flex-shrink-0 flex items-center gap-1 mr-1">
            <button
              onClick={onToggleMute}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-black text-neutral-400 border border-neutral-800 hover:text-white hover:border-neutral-600 transition-all"
            >
              {isMuted ? <MuteIcon className="w-5 h-5" /> : <UnmuteIcon className="w-5 h-5" />}
            </button>
            <button
              onClick={onRepeat}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-black text-neutral-400 border border-neutral-800 hover:text-white hover:border-neutral-600 transition-all"
            >
              <RepeatIcon className="w-5 h-5" />
            </button>
            <button
              onClick={onTogglePause}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-black text-neutral-400 border border-neutral-800 hover:text-white hover:border-neutral-600 transition-all"
            >
              {isPaused ? <PlayIcon className="w-5 h-5" /> : <PauseIcon className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-black text-neutral-400 border border-neutral-800 hover:text-white hover:border-neutral-600 transition-all"
            >
              {isExpanded ? <CollapseIcon className="w-5 h-5" /> : <ExpandIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Collapsible Content - Transcript and Input Field */}
        <div
          className="overflow-hidden transition-all duration-500 ease-in-out"
          style={{
            maxHeight: isExpanded ? '500px' : '0',
            opacity: isExpanded ? 1 : 0,
            marginTop: isExpanded ? '6px' : '0'
          }}
        >
          <div>
            {/* Row 2: Transcript - Only during DRAWING */}
            {showTranscript && explanation && (
              <div className="mb-1.5 px-2">
                <p className="text-sm text-neutral-400 leading-relaxed">{explanation}</p>
                {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
              </div>
            )}

            {/* Row 3: Input Field */}
            <div className="relative flex items-center bg-black rounded-full p-1">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Or type your own idea..."
                disabled={isInputDisabled}
                className={`flex-grow bg-transparent text-white placeholder-neutral-500 text-lg px-4 py-2 border-none focus:outline-none focus:ring-0 custom-caret ${
                  isInputDisabled && inputValue ? 'disabled:opacity-100 animate-shiver' : 'disabled:opacity-50'
                }`}
              />
              <button
                onClick={handleSubmit}
                disabled={isInputDisabled || !inputValue.trim()}
                className="w-12 h-12 flex items-center justify-center bg-[#1F51FF] text-white rounded-full transition-all duration-200 transform hover:scale-105 active:scale-95 disabled:bg-blue-800 disabled:cursor-not-allowed"
                aria-label="Send prompt"
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
