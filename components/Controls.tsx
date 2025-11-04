

import React, { useState, useRef } from 'react';
import { AppStatus, WhiteboardStep } from '../types';
import {
  ExpandIcon, CollapseIcon, RepeatIcon, MuteIcon, UnmuteIcon, SendIcon
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
      className="p-1.5 w-8 h-8 flex items-center justify-center rounded-lg bg-black text-neutral-400 hover:text-white transition-all duration-200 transform hover:scale-110 active:scale-95"
    >
      {children}
    </button>
  );

  return (
    <div className="absolute bottom-4 left-4 right-4 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:right-auto w-full max-w-3xl md:w-auto md:min-w-[700px]">
      <div className="bg-neutral-900 rounded-2xl p-2 transition-all duration-300 hover:shadow-[0_0_20px_0px_rgba(255,255,255,0.05)]">

        {/* Row 1: Buttons + Progress Bar (Always Visible) */}
        <div className="flex items-center gap-2">
          {/* Control Buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <ControlButton onClick={onRepeat}>
              <RepeatIcon />
            </ControlButton>
            <ControlButton onClick={() => setIsMuted(!isMuted)}>
              {isMuted ? <MuteIcon /> : <UnmuteIcon />}
            </ControlButton>
            <ControlButton onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
            </ControlButton>
          </div>

          {/* Progress Bar */}
          <div className="flex-1 min-w-0">
            <div className="w-full bg-neutral-800 rounded-full h-1 overflow-hidden">
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

        {/* Row 2 & 3: Collapsible Content */}
        <div className={`transition-all duration-500 ease-in-out grid ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">

            {/* Row 2: Transcript */}
            {explanation && (
              <div className="mt-2 px-1">
                <p className="text-sm text-neutral-400 leading-relaxed">{explanation}</p>
                {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
              </div>
            )}

            {/* Row 3: Input Field */}
            <div className="mt-2 relative flex items-center bg-black rounded-lg p-1">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question or enter a command..."
                disabled={isInputDisabled}
                className="w-full bg-transparent text-white placeholder-neutral-500 text-base py-2 pl-3 pr-12 focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={() => onSubmit(inputValue)}
                disabled={isInputDisabled || !inputValue.trim()}
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full transition-all duration-300 transform hover:scale-105 active:scale-95 ${inputValue.trim() && !isInputDisabled ? 'bg-[#1F51FF] text-white' : 'bg-neutral-800 text-neutral-400'}`}
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
