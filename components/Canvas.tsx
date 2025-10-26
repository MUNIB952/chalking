
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { WhiteboardStep, Annotation, AppStatus, ArrowAnnotation, DrawingCommand, TextAnnotation } from '../types';
import { PenIcon, LoaderIcon } from './icons';

interface CanvasProps {
  steps: WhiteboardStep[];
  currentStepIndex: number;
  status: AppStatus;
  audioBuffer: AudioBuffer | null;
  key: number; // To force re-mount and reset
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;

// Draws an arrow with animated progress
const drawAnimatedArrow = (ctx: CanvasRenderingContext2D, annotation: ArrowAnnotation, origin: {x: number, y: number}, progress: number) => {
    const fromX = origin.x + annotation.start.x;
    const fromY = origin.y + annotation.start.y;
    const toX = origin.x + annotation.end.x;
    const toY = origin.y + annotation.end.y;

    const currentX = fromX + (toX - fromX) * progress;
    const currentY = fromY + (toY - fromY) * progress;
    
    const headlen = 10;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(currentX, currentY);

    if (progress >= 1) {
        ctx.lineTo(currentX - headlen * Math.cos(angle - Math.PI / 6), currentY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(currentX, currentY);
        ctx.lineTo(currentX - headlen * Math.cos(angle + Math.PI / 6), currentY - headlen * Math.sin(angle - Math.PI / 6));
    }
    ctx.stroke();
};

// NEW: Draws text with an animated "typing" effect
const drawAnimatedText = (ctx: CanvasRenderingContext2D, annotation: TextAnnotation, origin: {x: number, y: number}, progress: number) => {
    const x = origin.x + annotation.point.x;
    const y = origin.y + annotation.point.y;
    const charsToShow = Math.floor(annotation.text.length * progress);
    const textToDraw = annotation.text.substring(0, charsToShow);

    ctx.font = `400 ${annotation.fontSize}px Caveat, cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(textToDraw, x, y);
};


// Drawing functions for primitive shapes
const drawAnimatedRectangle = (ctx: CanvasRenderingContext2D, command: Extract<DrawingCommand, {type: 'rectangle'}>, origin: {x: number, y: number}, progress: number) => {
    const w = command.width * progress;
    const h = command.height * progress;
    const x = origin.x + command.center.x - w / 2;
    const y = origin.y + command.center.y - h / 2;
    ctx.strokeRect(x, y, w, h);
}

const drawAnimatedCircle = (ctx: CanvasRenderingContext2D, command: Extract<DrawingCommand, {type: 'circle'}>, origin: {x: number, y: number}, progress: number) => {
    ctx.beginPath();
    ctx.arc(origin.x + command.center.x, origin.y + command.center.y, command.radius * progress, 0, 2 * Math.PI);
    ctx.stroke();
}

const drawAnimatedPath = (ctx: CanvasRenderingContext2D, command: Extract<DrawingCommand, {type: 'path'}>, origin: {x: number, y: number}, progress: number) => {
    if (command.points.length < 2) return;
    const totalPoints = command.points.length - 1;
    const pointsToDraw = totalPoints * progress;
    const lastFullPointIndex = Math.floor(pointsToDraw);
    
    ctx.beginPath();
    ctx.moveTo(origin.x + command.points[0].x, origin.y + command.points[0].y);

    for (let i = 0; i < lastFullPointIndex; i++) {
        ctx.lineTo(origin.x + command.points[i+1].x, origin.y + command.points[i+1].y);
    }
    
    if (progress < 1 && lastFullPointIndex < totalPoints) {
        const lastPoint = command.points[lastFullPointIndex];
        const nextPoint = command.points[lastFullPointIndex + 1];
        const segmentProgress = pointsToDraw - lastFullPointIndex;
        const currentX = lastPoint.x + (nextPoint.x - lastPoint.x) * segmentProgress;
        const currentY = lastPoint.y + (nextPoint.y - lastPoint.y) * segmentProgress;
        ctx.lineTo(origin.x + currentX, origin.y + currentY);
    }

    ctx.stroke();
}


const drawStepContent = (ctx: CanvasRenderingContext2D, step: WhiteboardStep, animationProgress: number) => {
  if (!step.origin) return;

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#FFFFFF';

  const drawableItems = [...(step.drawingPlan || []), ...step.annotations];
  const totalItems = drawableItems.length;
  if (totalItems === 0) return;

  const currentItemIndexFloat = animationProgress * totalItems;
  const currentItemIndex = Math.floor(currentItemIndexFloat);

  // Draw all completed items for this step
  for (let i = 0; i < currentItemIndex; i++) {
      const item = drawableItems[i];
      if ('type' in item && (item.type === 'rectangle' || item.type === 'circle' || item.type === 'path')) {
          if (item.type === 'rectangle') drawAnimatedRectangle(ctx, item, step.origin, 1);
          if (item.type === 'circle') drawAnimatedCircle(ctx, item, step.origin, 1);
          if (item.type === 'path') drawAnimatedPath(ctx, item, step.origin, 1);
      } else if ('type' in item && (item.type === 'arrow' || item.type === 'text')) {
          if (item.type === 'arrow') drawAnimatedArrow(ctx, item, step.origin, 1);
          if (item.type === 'text') drawAnimatedText(ctx, item, step.origin, 1);
      }
  }

  // Draw the currently animating item
  if (currentItemIndex < totalItems) {
      const item = drawableItems[currentItemIndex];
      const itemProgress = currentItemIndexFloat - currentItemIndex;
      
      if ('type' in item && (item.type === 'rectangle' || item.type === 'circle' || item.type === 'path')) {
          if (item.type === 'rectangle') drawAnimatedRectangle(ctx, item, step.origin, itemProgress);
          if (item.type === 'circle') drawAnimatedCircle(ctx, item, step.origin, itemProgress);
          if (item.type === 'path') drawAnimatedPath(ctx, item, step.origin, itemProgress);
      } else if ('type' in item && (item.type === 'arrow' || item.type === 'text')) {
          if (item.type === 'arrow') drawAnimatedArrow(ctx, item, step.origin, itemProgress);
          if (item.type === 'text') drawAnimatedText(ctx, item, step.origin, itemProgress);
      }
  }
};


export const Canvas: React.FC<CanvasProps> = ({
  steps,
  currentStepIndex,
  status,
  audioBuffer,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPoint = useRef({ x: 0, y: 0 });
  const animationFrameId = useRef<number | null>(null);
  
  const [animationProgress, setAnimationProgress] = useState(0);
  const animationStartTimeRef = useRef<number | null>(null);

  const isInteractive = useMemo(() => status !== 'THINKING' && status !== 'DRAWING' && status !== 'PREPARING', [status]);
  const currentStep = useMemo(() => steps?.[currentStepIndex], [steps, currentStepIndex]);
  const cursorClass = isPanning ? 'grabbing-cursor' : (isInteractive ? 'grab-cursor' : 'wait-cursor');
  
  const showLoader = useMemo(() => status === 'THINKING' || status === 'PREPARING', [status]);
  
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    
    ctx.translate(viewTransform.x, viewTransform.y);
    ctx.scale(viewTransform.zoom, viewTransform.zoom);

    // Draw all completed steps up to the current one
    for (let i = 0; i <= currentStepIndex; i++) {
        const step = steps[i];
        if (!step) continue;

        const progress = (i === currentStepIndex) ? animationProgress : 1;
        drawStepContent(ctx, step, progress);
    }
    ctx.restore();
  }, [viewTransform, steps, currentStepIndex, animationProgress]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  useEffect(() => {
    setAnimationProgress(0);
    animationStartTimeRef.current = null;
  }, [currentStepIndex]);
  
  useEffect(() => {
    if (!currentStep || status !== 'DRAWING') {
      if (animationProgress !== 0) setAnimationProgress(0);
      animationStartTimeRef.current = null;
      return;
    }

    const duration = audioBuffer ? audioBuffer.duration * 1000 : 3000; // fallback duration 3s
    let frameId: number;
    
    const animate = (timestamp: number) => {
      if (!animationStartTimeRef.current) {
        animationStartTimeRef.current = timestamp;
      }
      const elapsed = timestamp - animationStartTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      setAnimationProgress(progress);
      
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };
    
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      animationStartTimeRef.current = null;
    };
  }, [currentStep, audioBuffer, status]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentStep || !currentStep.origin || isPanning) return;

    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }

    const rect = canvas.getBoundingClientRect();
    const targetX = rect.width / 2 - currentStep.origin.x * viewTransform.zoom;
    const targetY = rect.height / 2 - currentStep.origin.y * viewTransform.zoom;

    const animate = () => {
      animationFrameId.current = requestAnimationFrame(() => {
        setViewTransform(prev => {
          const dx = targetX - prev.x;
          const dy = targetY - prev.y;
          
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
            animationFrameId.current = null;
            return { ...prev, x: targetX, y: targetY };
          }
          const newX = prev.x + dx * 0.15;
          const newY = prev.y + dy * 0.15;
          animate();
          return { ...prev, x: newX, y: newY };
        });
      });
    };
    animate();
    
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isInteractive) return;
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    setIsPanning(true);
    lastPanPoint.current = { x: e.clientX, y: e.clientY };
  }, [isInteractive]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - lastPanPoint.current.x;
    const dy = e.clientY - lastPanPoint.current.y;
    lastPanPoint.current = { x: e.clientX, y: e.clientY };
    setViewTransform(prev => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy,
    }));
  }, [isPanning]);

  const handleMouseUpOrLeave = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isInteractive) return;
    e.preventDefault();
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setViewTransform(prev => {
      const zoomFactor = 1 - e.deltaY * 0.001;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * zoomFactor));
      const worldX = (mouseX - prev.x) / prev.zoom;
      const worldY = (mouseY - prev.y) / prev.zoom;
      const newX = mouseX - worldX * newZoom;
      const newY = mouseY - worldY * newZoom;
      return { x: newX, y: newY, zoom: newZoom };
    });
  }, [isInteractive]);
  
  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      setViewTransform({ x: rect.width / 2, y: rect.height / 2, zoom: 1 });
  }, []);

  return (
    <div className={`w-full h-full relative overflow-hidden ${cursorClass}`}>
      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onWheel={handleWheel}
      />
      
      {status === 'IDLE' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-slate-500 pointer-events-none">
          <PenIcon className="w-24 h-24 mx-auto text-slate-700" />
          <h3 className="mt-4 text-2xl font-semibold">AI Teacher</h3>
          <p className="text-lg">Enter a prompt and I'll create a voice-led visual explanation for you.</p>
        </div>
      )}

      {showLoader && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 pointer-events-none">
          <LoaderIcon className="w-16 h-16 text-cyan-400" />
        </div>
      )}
    </div>
  );
};
