
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { WhiteboardStep, Annotation, AppStatus, ArrowAnnotation, DrawingCommand, TextAnnotation, StrikethroughAnnotation, Point, AbsolutePoint, isRelativePoint, CircleCommand } from '../types';
import { LoaderIcon, PauseIcon } from './icons';

interface CanvasProps {
  steps: WhiteboardStep[];
  currentStepIndex: number;
  status: AppStatus;
  animationProgress: number;
  isPaused: boolean;
  key: number; // To force re-mount and reset
  explanation: string;
  onFocusRequest?: () => void;
}

type AllDrawableItem = (DrawingCommand | Annotation) & { stepOrigin: Point };

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;

// --- Point/Curve Calculation Utilities ---
const getPointOnQuadraticCurve = (p0: Point, p1: Point, p2: Point, t: number): Point => {
    const x = (1 - t) * (1 - t) * (p0 as AbsolutePoint).x + 2 * (1 - t) * t * (p1 as AbsolutePoint).x + t * t * (p2 as AbsolutePoint).x;
    const y = (1 - t) * (1 - t) * (p0 as AbsolutePoint).y + 2 * (1 - t) * t * (p1 as AbsolutePoint).y + t * t * (p2 as AbsolutePoint).y;
    return { x, y };
};

// --- Geometric Calculation for Intersections ---
function calculateIntersectionOfTwoCircles(
    c1: { x: number; y: number; r: number },
    c2: { x: number; y: number; r: number }
): [AbsolutePoint, AbsolutePoint] | null {
    const { x: x1, y: y1, r: r1 } = c1;
    const { x: x2, y: y2, r: r2 } = c2;

    const d_sq = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    const d = Math.sqrt(d_sq);

    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) {
      return null;
    }

    const a = (r1 ** 2 - r2 ** 2 + d_sq) / (2 * d);
    const h_sq = r1 ** 2 - a ** 2;
    const h = Math.sqrt(Math.max(0, h_sq));

    const x_mid = x1 + (a * (x2 - x1)) / d;
    const y_mid = y1 + (a * (y2 - y1)) / d;

    const intersection1: AbsolutePoint = {
        x: x_mid + (h * (y2 - y1)) / d,
        y: y_mid - (h * (x2 - x1)) / d,
    };

    const intersection2: AbsolutePoint = {
        x: x_mid - (h * (y2 - y1)) / d,
        y: y_mid + (h * (x2 - x1)) / d,
    };

    return [intersection1, intersection2];
}


// --- Animated Drawing Functions ---

const drawAnimatedArrow = (ctx: CanvasRenderingContext2D, annotation: ArrowAnnotation, origin: Point, progress: number) => {
    const from = { x: (origin as AbsolutePoint).x + (annotation.start as AbsolutePoint).x, y: (origin as AbsolutePoint).y + (annotation.start as AbsolutePoint).y };
    const to = { x: (origin as AbsolutePoint).x + (annotation.end as AbsolutePoint).x, y: (origin as AbsolutePoint).y + (annotation.end as AbsolutePoint).y };
    
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);

    let currentPos: Point;
    if (annotation.controlPoint) {
        const control = { x: (origin as AbsolutePoint).x + (annotation.controlPoint as AbsolutePoint).x, y: (origin as AbsolutePoint).y + (annotation.controlPoint as AbsolutePoint).y };
        const t = progress;
        const qx0 = from.x + (control.x - from.x) * t;
        const qy0 = from.y + (control.y - from.y) * t;
        currentPos = getPointOnQuadraticCurve(from, control, to, progress);
        ctx.quadraticCurveTo(qx0, qy0, (currentPos as AbsolutePoint).x, (currentPos as AbsolutePoint).y);
    } else {
        const currentX = from.x + (to.x - from.x) * progress;
        const currentY = from.y + (to.y - from.y) * progress;
        currentPos = { x: currentX, y: currentY };
        ctx.lineTo(currentX, currentY);
    }
    ctx.stroke();

    if (progress >= 1) {
        let angle;
        if (annotation.controlPoint) {
            const control = { x: (origin as AbsolutePoint).x + (annotation.controlPoint as AbsolutePoint).x, y: (origin as AbsolutePoint).y + (annotation.controlPoint as AbsolutePoint).y };
            angle = Math.atan2(to.y - control.y, to.x - control.x);
        } else {
            angle = Math.atan2(to.y - from.y, to.x - from.x);
        }
        const headlen = 10;
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    }
};

const drawAnimatedText = (ctx: CanvasRenderingContext2D, annotation: TextAnnotation, origin: Point, progress: number) => {
    if (progress <= 0) return;

    const { text, point, fontSize, isContextual } = annotation;
    const x = (origin as AbsolutePoint).x + (point as AbsolutePoint).x;
    const y = (origin as AbsolutePoint).y + (point as AbsolutePoint).y;

    ctx.font = `400 ${fontSize}px Caveat, cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.save();

    if (isContextual) {
        // For contextual labels, draw immediately but faded
        ctx.globalAlpha *= 0.6;
        ctx.fillText(text, x, y);
    } else {
        // Simple fade-in animation
        const fadeProgress = Math.min(progress * 3, 1); // Fade in quickly (first 33% of progress)
        ctx.globalAlpha *= fadeProgress;
        ctx.fillText(text, x, y);
    }

    ctx.restore();
};

const drawAnimatedRectangle = (ctx: CanvasRenderingContext2D, command: Extract<DrawingCommand, {type: 'rectangle'}>, origin: Point, progress: number) => {
    const w = command.width;
    const h = command.height;
    const x = (origin as AbsolutePoint).x + (command.center as AbsolutePoint).x - w / 2;
    const y = (origin as AbsolutePoint).y + (command.center as AbsolutePoint).y - h / 2;
    const perimeter = 2 * (w + h);
    const lengthToDraw = perimeter * progress;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    let drawn = 0;
    if (drawn < lengthToDraw) {
        const d = Math.min(w, lengthToDraw - drawn);
        ctx.lineTo(x + d, y);
        drawn += d;
    }
    if (drawn < lengthToDraw) {
        const d = Math.min(h, lengthToDraw - drawn);
        ctx.lineTo(x + w, y + d);
        drawn += d;
    }
    if (drawn < lengthToDraw) {
        const d = Math.min(w, lengthToDraw - drawn);
        ctx.lineTo(x + w - d, y + h);
        drawn += d;
    }
    if (drawn < lengthToDraw) {
        const d = Math.min(h, lengthToDraw - drawn);
        ctx.lineTo(x, y + h - d);
    }
    ctx.stroke();

    if (command.isFilled && progress >= 1) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = command.color || '#FFFFFF';
        ctx.fillRect(x, y, w, h);
        ctx.restore();
    }
};

const drawAnimatedCircle = (ctx: CanvasRenderingContext2D, command: Extract<DrawingCommand, {type: 'circle'}>, origin: Point, progress: number) => {
    const centerX = (origin as AbsolutePoint).x + (command.center as AbsolutePoint).x;
    const centerY = (origin as AbsolutePoint).y + (command.center as AbsolutePoint).y;
    
    if (command.radius <= 5) {
        if (progress <= 0) return;
        ctx.beginPath();
        const scale = progress * progress;
        ctx.arc(centerX, centerY, command.radius * scale, 0, 2 * Math.PI);
        ctx.fill();
    } else { 
        if (progress > 0) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, command.radius, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * progress);
            ctx.stroke();
        }

        if (command.isFilled && progress >= 1) {
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = command.color || '#FFFFFF';
            ctx.beginPath();
            ctx.arc(centerX, centerY, command.radius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();
        }
    }
};

const drawAnimatedPath = (ctx: CanvasRenderingContext2D, points: Point[], origin: Point, progress: number) => {
    if (points.length < 2) return;

    const totalSegments = points.length - 1;
    const segmentsToDraw = totalSegments * progress;
    const lastFullSegmentIndex = Math.floor(segmentsToDraw);

    ctx.beginPath();
    ctx.moveTo((origin as AbsolutePoint).x + (points[0] as AbsolutePoint).x, (origin as AbsolutePoint).y + (points[0] as AbsolutePoint).y);

    for (let i = 0; i < lastFullSegmentIndex; i++) {
        const p_next = points[i + 1] as AbsolutePoint;
        if (p_next.cx != null && p_next.cy != null) {
            ctx.quadraticCurveTo((origin as AbsolutePoint).x + p_next.cx, (origin as AbsolutePoint).y + p_next.cy, (origin as AbsolutePoint).x + p_next.x, (origin as AbsolutePoint).y + p_next.y);
        } else {
            ctx.lineTo((origin as AbsolutePoint).x + p_next.x, (origin as AbsolutePoint).y + p_next.y);
        }
    }

    if (progress < 1 && lastFullSegmentIndex < totalSegments) {
        const p_start = points[lastFullSegmentIndex] as AbsolutePoint;
        const p_end = points[lastFullSegmentIndex + 1] as AbsolutePoint;
        const segmentProgress = segmentsToDraw - lastFullSegmentIndex;

        const startPt = { x: (origin as AbsolutePoint).x + p_start.x, y: (origin as AbsolutePoint).y + p_start.y };
        const endPt = { x: (origin as AbsolutePoint).x + p_end.x, y: (origin as AbsolutePoint).y + p_end.y };

        if (p_end.cx != null && p_end.cy != null) {
            const controlPt = { x: (origin as AbsolutePoint).x + p_end.cx, y: (origin as AbsolutePoint).y + p_end.cy };
            const currentPos = getPointOnQuadraticCurve(startPt, controlPt, endPt, segmentProgress);
            ctx.quadraticCurveTo(
                startPt.x + (controlPt.x - startPt.x) * segmentProgress,
                startPt.y + (controlPt.y - startPt.y) * segmentProgress,
                (currentPos as AbsolutePoint).x, (currentPos as AbsolutePoint).y
            );
        } else {
            ctx.lineTo(startPt.x + (endPt.x - startPt.x) * segmentProgress, startPt.y + (endPt.y - startPt.y) * segmentProgress);
        }
    }
    ctx.stroke();
};

const drawAnimatedStrikethrough = (ctx: CanvasRenderingContext2D, annotation: StrikethroughAnnotation, origin: Point, progress: number) => {
    const originalStroke = ctx.strokeStyle;
    const originalWidth = ctx.lineWidth;
    ctx.strokeStyle = annotation.color || '#ef4444';
    ctx.lineWidth = 2;
    const wavyPoints = annotation.points.map((p, i) => ({
        ...p,
        y: (p as AbsolutePoint).y + Math.sin(i * 0.8) * 5,
    }));
    drawAnimatedPath(ctx, wavyPoints, origin, progress);
    ctx.strokeStyle = originalStroke;
    ctx.lineWidth = originalWidth;
};


const drawStepContent = (ctx: CanvasRenderingContext2D, step: WhiteboardStep, animationProgress: number, idsToExclude?: Set<string>) => {
  if (!step.origin) return;

  const defaultColor = '#FFFFFF';
  ctx.strokeStyle = defaultColor;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = defaultColor;

  const allItems = [...(step.drawingPlan || []), ...step.annotations];
  const itemsToDraw = idsToExclude 
      ? allItems.filter(item => !item.id || !idsToExclude.has(item.id))
      : allItems;

  const totalItems = itemsToDraw.length;
  if (totalItems === 0) return;

  const currentItemIndexFloat = animationProgress * totalItems;
  const currentItemIndex = Math.floor(currentItemIndexFloat);

  const drawItem = (item: DrawingCommand | Annotation, progress: number) => {
      let itemColor = item.color || defaultColor;

      // Expanded forbidden colors list - all black and very dark colors are prohibited
      const forbiddenColors = [
        '#000000', '#0a0a0a', '#18181b', '#333333', '#000',
        '#111111', '#222222', '#1a1a1a', '#0d0d0d', '#050505',
        'black', 'rgb(0,0,0)', 'rgb(0, 0, 0)'
      ];
      if (forbiddenColors.includes(itemColor.toLowerCase())) {
          console.warn(`Forbidden color detected: ${itemColor}. Replacing with white.`);
          itemColor = defaultColor;
      }

      ctx.strokeStyle = itemColor;
      ctx.fillStyle = itemColor;

      if (item.type === 'rectangle') drawAnimatedRectangle(ctx, item, step.origin, progress);
      if (item.type === 'circle') drawAnimatedCircle(ctx, item, step.origin, progress);
      if (item.type === 'path') drawAnimatedPath(ctx, item.points, step.origin, progress);
      if (item.type === 'arrow') drawAnimatedArrow(ctx, item, step.origin, progress);
      if (item.type === 'text') drawAnimatedText(ctx, item, step.origin, progress);
      if (item.type === 'strikethrough') drawAnimatedStrikethrough(ctx, item, step.origin, progress);
  };

  for (let i = 0; i < currentItemIndex; i++) {
      drawItem(itemsToDraw[i], 1);
  }

  if (currentItemIndex < totalItems) {
      const item = itemsToDraw[currentItemIndex];
      const itemProgress = currentItemIndexFloat - currentItemIndex;
      drawItem(item, itemProgress);
  }
};

const getPenTipPosition = (item: DrawingCommand | Annotation, origin: Point, progress: number): Point => {
    let pos: Point = { x: 0, y: 0 };
    switch(item.type) {
        case 'arrow':
            const from = { x: (origin as AbsolutePoint).x + (item.start as AbsolutePoint).x, y: (origin as AbsolutePoint).y + (item.start as AbsolutePoint).y };
            const to = { x: (origin as AbsolutePoint).x + (item.end as AbsolutePoint).x, y: (origin as AbsolutePoint).y + (item.end as AbsolutePoint).y };
            if (item.controlPoint) {
                const control = { x: (origin as AbsolutePoint).x + (item.controlPoint as AbsolutePoint).x, y: (origin as AbsolutePoint).y + (item.controlPoint as AbsolutePoint).y };
                pos = getPointOnQuadraticCurve(from, control, to, progress);
            } else {
                pos = { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
            }
            break;
        case 'text':
            pos = { x: (origin as AbsolutePoint).x + (item.point as AbsolutePoint).x, y: (origin as AbsolutePoint).y + (item.point as AbsolutePoint).y };
            break;
        case 'circle':
            const angle = -Math.PI / 2 + 2 * Math.PI * progress;
            pos = {
                x: (origin as AbsolutePoint).x + (item.center as AbsolutePoint).x + item.radius * Math.cos(angle),
                y: (origin as AbsolutePoint).y + (item.center as AbsolutePoint).y + item.radius * Math.sin(angle),
            };
            break;
        case 'rectangle':
             const w = item.width;
             const h = item.height;
             const x = (origin as AbsolutePoint).x + (item.center as AbsolutePoint).x - w / 2;
             const y = (origin as AbsolutePoint).y + (item.center as AbsolutePoint).y - h / 2;
             const perimeter = 2 * (w + h);
             const lengthToDraw = perimeter * progress;
             if (lengthToDraw <= w) pos = { x: x + lengthToDraw, y: y };
             else if (lengthToDraw <= w + h) pos = { x: x + w, y: y + (lengthToDraw - w) };
             else if (lengthToDraw <= w * 2 + h) pos = { x: x + w - (lengthToDraw - w - h), y: y + h };
             else pos = { x: x, y: y + h - (lengthToDraw - w * 2 - h) };
             break;
        case 'path':
        case 'strikethrough':
            if (item.points.length < 2) break;
            const totalSegments = item.points.length - 1;
            const segmentsToDraw = totalSegments * progress;
            const lastFullSegmentIndex = Math.min(Math.floor(segmentsToDraw), totalSegments - 1);
            const segmentProgress = segmentsToDraw - lastFullSegmentIndex;
            const p_start = item.points[lastFullSegmentIndex];
            const p_end = item.points[lastFullSegmentIndex + 1];

            const startPt = { x: (origin as AbsolutePoint).x + (p_start as AbsolutePoint).x, y: (origin as AbsolutePoint).y + (p_start as AbsolutePoint).y };
            const endPt = { x: (origin as AbsolutePoint).x + (p_end as AbsolutePoint).x, y: (origin as AbsolutePoint).y + (p_end as AbsolutePoint).y };
            
            if ((p_end as AbsolutePoint).cx != null && (p_end as AbsolutePoint).cy != null) {
                const controlPt = { x: (origin as AbsolutePoint).x + (p_end as AbsolutePoint).cx!, y: (origin as AbsolutePoint).y + (p_end as AbsolutePoint).cy! };
                pos = getPointOnQuadraticCurve(startPt, controlPt, endPt, segmentProgress);
            } else {
                pos = { x: startPt.x + (endPt.x - startPt.x) * segmentProgress, y: startPt.y + (endPt.y - startPt.y) * segmentProgress };
            }
            break;
    }
    return pos;
};


export const Canvas: React.FC<CanvasProps> = ({
  steps,
  currentStepIndex,
  status,
  animationProgress,
  isPaused,
  explanation,
  onFocusRequest
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPoint = useRef({ x: 0, y: 0 });
  const penTipPosition = useRef<Point | null>(null);

  // Always allow interaction during DRAWING and DONE, disable only during THINKING/PREPARING
  const isInteractive = useMemo(() => status !== 'THINKING' && status !== 'PREPARING', [status]);
  const cursorClass = isPanning ? 'grabbing-cursor' : (isInteractive ? 'grab-cursor' : 'wait-cursor');
  
  const showLoader = useMemo(() => status === 'THINKING' || status === 'PREPARING', [status]);

  const resolvedSteps = useMemo(() => {
    if (!steps || steps.length === 0) return [];

    const newSteps = JSON.parse(JSON.stringify(steps)); 

    const circleMetaCache = new Map<string, { command: CircleCommand; origin: AbsolutePoint }>();
    newSteps.forEach((step: WhiteboardStep) => {
        (step.drawingPlan || []).forEach(item => {
            if (item.type === 'circle' && item.id) {
                circleMetaCache.set(item.id, { command: item, origin: step.origin });
            }
        });
    });

    const resolvePoint = (point: Point, currentStepOrigin: AbsolutePoint): AbsolutePoint => {
        if (!isRelativePoint(point)) {
            return point as AbsolutePoint;
        }

        const meta1 = circleMetaCache.get(point.referenceCircleId1);
        const meta2 = circleMetaCache.get(point.referenceCircleId2);

        if (!meta1 || !meta2) {
            console.error("Unresolved reference circles for relative point", point);
            return { x: 0, y: 0 };
        }
        
        const c1_world_center = { 
            x: meta1.origin.x + (meta1.command.center as AbsolutePoint).x, 
            y: meta1.origin.y + (meta1.command.center as AbsolutePoint).y 
        };
        const c2_world_center = { 
            x: meta2.origin.x + (meta2.command.center as AbsolutePoint).x, 
            y: meta2.origin.y + (meta2.command.center as AbsolutePoint).y 
        };
        
        const intersections = calculateIntersectionOfTwoCircles(
            { ...c1_world_center, r: meta1.command.radius },
            { ...c2_world_center, r: meta2.command.radius }
        );
        
        if (!intersections) {
            console.warn("Could not resolve relative point; circles do not intersect.", point);
            const dx = c2_world_center.x - c1_world_center.x;
            const dy = c2_world_center.y - c1_world_center.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const fallback_x = c1_world_center.x + (dx / d) * meta1.command.radius;
            const fallback_y = c1_world_center.y + (dy / d) * meta1.command.radius;
            return { x: fallback_x - currentStepOrigin.x, y: fallback_y - currentStepOrigin.y };
        }

        const worldPoint = intersections[point.intersectionIndex];
        return {
            x: worldPoint.x - currentStepOrigin.x,
            y: worldPoint.y - currentStepOrigin.y,
        };
    };

    for (const step of newSteps) {
        const origin = step.origin as AbsolutePoint;
        const allItems: (DrawingCommand | Annotation)[] = [...(step.drawingPlan || []), ...step.annotations];
        
        for (const item of allItems) {
            if ('center' in item && item.center) item.center = resolvePoint(item.center, origin);
            if ('point' in item && item.point) item.point = resolvePoint(item.point, origin);
            if ('start' in item && item.start) item.start = resolvePoint(item.start, origin);
            if ('end' in item && item.end) item.end = resolvePoint(item.end, origin);
            if ('controlPoint' in item && item.controlPoint) item.controlPoint = resolvePoint(item.controlPoint, origin);
            if ('points' in item && item.points) item.points = item.points.map((p: Point) => resolvePoint(p, origin));
        }
    }
    return newSteps;
  }, [steps]);

  const currentStep = useMemo(() => resolvedSteps?.[currentStepIndex], [resolvedSteps, currentStepIndex]);
  
  const currentStepItemIds = useMemo(() => {
    const itemSet = new Set<string>();
    if (!currentStep) return itemSet;
    const allItems = [...(currentStep.drawingPlan || []), ...currentStep.annotations];
    for (const item of allItems) {
        if (item.id) {
            itemSet.add(item.id);
        }
    }
    return itemSet;
  }, [currentStep]);
  
  const itemsById = useMemo(() => {
    const map = new Map<string, AllDrawableItem>();
    if (!resolvedSteps) return map;
    for (let i = 0; i < resolvedSteps.length; i++) {
        const step = resolvedSteps[i];
        if (!step) continue;
        const allItems = [...(step.drawingPlan || []), ...step.annotations];
        for (const item of allItems) {
            if (item.id) {
                map.set(item.id, { ...item, stepOrigin: step.origin });
            }
        }
    }
    return map;
  }, [resolvedSteps]);
  
  const drawCanvas = useCallback((timestamp: number) => {
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

    const retainedLabelIds = currentStep?.retainedLabelIds;
    if ((status === 'DRAWING' || status === 'DONE') && retainedLabelIds && retainedLabelIds.length > 0) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        for (const id of retainedLabelIds) {
            const itemWithOrigin = itemsById.get(id);
            if (itemWithOrigin && itemWithOrigin.type === 'text') {
                const { stepOrigin, ...item } = itemWithOrigin;
                ctx.fillStyle = item.color || '#FFFFFF';
                drawAnimatedText(ctx, item as TextAnnotation, stepOrigin, 1);
            }
        }
        ctx.restore();
    }

    const highlightIds = currentStep?.highlightIds;
    if (status === 'DRAWING' && highlightIds && highlightIds.length > 0) {
        ctx.save();
        const pulse = (Math.sin(timestamp / 200) + 1) / 2;
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 15 + pulse * 10;
        
        for (const id of highlightIds) {
            const itemWithOrigin = itemsById.get(id);
            if (itemWithOrigin) {
                const { stepOrigin, ...item } = itemWithOrigin;
                ctx.strokeStyle = item.color || '#06b6d4';
                ctx.fillStyle = item.color || '#06b6d4';
                ctx.lineWidth = 4;

                if (item.type === 'rectangle') drawAnimatedRectangle(ctx, item, stepOrigin, 1);
                else if (item.type === 'circle') drawAnimatedCircle(ctx, item, stepOrigin, 1);
                else if (item.type === 'path') drawAnimatedPath(ctx, item.points, stepOrigin, 1);
                else if (item.type === 'arrow') drawAnimatedArrow(ctx, item, stepOrigin, 1);
                else if (item.type === 'text') drawAnimatedText(ctx, item, stepOrigin, 1);
                else if (item.type === 'strikethrough') drawAnimatedStrikethrough(ctx, item, stepOrigin, 1);
            }
        }
        ctx.restore();
    }

    // Render completed steps and current step
    if (status === 'DONE') {
      // When explanation is complete, render ALL steps at full progress
      for (let i = 0; i < resolvedSteps.length; i++) {
        const step = resolvedSteps[i];
        if (step) {
          drawStepContent(ctx, step, 1);
        }
      }
    } else {
      // During drawing, render previous steps + current animated step
      for (let i = 0; i < currentStepIndex; i++) {
        const step = resolvedSteps[i];
        if (step) {
          // Only exclude items if this step shares the same origin as current step
          // This prevents re-drawing items during Conceptual Pivot but allows Addition steps to show fully
          const sharesOrigin = currentStep &&
            step.origin.x === currentStep.origin.x &&
            step.origin.y === currentStep.origin.y;
          drawStepContent(ctx, step, 1, sharesOrigin ? currentStepItemIds : undefined);
        }
      }

      if (currentStep) {
        drawStepContent(ctx, currentStep, animationProgress);
      }
    }
    
    if (status === 'DRAWING' && !isPaused && penTipPosition.current) {
        const penWorld = penTipPosition.current as AbsolutePoint;
        
        ctx.save();
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.arc(penWorld.x, penWorld.y, 4 / viewTransform.zoom, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
    }
    
    ctx.restore();
  }, [viewTransform, resolvedSteps, currentStepIndex, currentStep, animationProgress, status, itemsById, isPaused, currentStepItemIds]);

  useEffect(() => {
    let frameId: number;
    const renderLoop = (timestamp: number) => {
        drawCanvas(timestamp);
        frameId = requestAnimationFrame(renderLoop);
    };
    frameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(frameId);
  }, [drawCanvas]);

  // Focus handler - centers view on current drawing area
  const handleFocus = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentStep) return;

    setIsPanning(false); // Stop any ongoing pan

    const rect = canvas.getBoundingClientRect();
    const focalPoint = penTipPosition.current || currentStep.origin;

    if (focalPoint) {
      const targetX = rect.width / 2 - (focalPoint as AbsolutePoint).x * viewTransform.zoom;
      const targetY = rect.height / 2 - (focalPoint as AbsolutePoint).y * viewTransform.zoom;
      setViewTransform(prev => ({ ...prev, x: targetX, y: targetY }));
    }
  }, [currentStep, viewTransform.zoom]);

  // Expose focus handler to parent
  useEffect(() => {
    if (onFocusRequest) {
      (window as any).__canvasFocus = handleFocus;
    }
  }, [handleFocus, onFocusRequest]);

  useEffect(() => {
    if (!currentStep || status !== 'DRAWING' || isPaused) {
      penTipPosition.current = null;
      return;
    }
    
    const drawableItems = [...(currentStep.drawingPlan || []), ...currentStep.annotations];
    if (drawableItems.length > 0) {
        const totalItems = drawableItems.length;
        const currentItemIndexFloat = animationProgress * totalItems;
        const currentItemIndex = Math.min(Math.floor(currentItemIndexFloat), totalItems - 1);
        const itemProgress = currentItemIndexFloat - currentItemIndex;
        const currentItem = drawableItems[currentItemIndex];

        if (currentItem) {
            if (currentItem.type === 'text') {
                penTipPosition.current = null;
            } else {
                penTipPosition.current = getPenTipPosition(currentItem, currentStep.origin, itemProgress);
            }
        }
    } else {
        penTipPosition.current = null;
    }

    const canvas = canvasRef.current;
    if (canvas && !isPanning) {
      const rect = canvas.getBoundingClientRect();
      const focalPoint = penTipPosition.current || currentStep.origin;

      if (focalPoint) {
          setViewTransform(prev => {
              // Responsive smoothing: faster on mobile for snappier tracking
              const isMobile = rect.width < 640; // sm breakpoint
              const smoothingFactor = isMobile ? 0.12 : 0.08;

              const targetX = rect.width / 2 - (focalPoint as AbsolutePoint).x * prev.zoom;
              const targetY = rect.height / 2 - (focalPoint as AbsolutePoint).y * prev.zoom;

              const dx = targetX - prev.x;
              const dy = targetY - prev.y;

              const newX = (Math.abs(dx) < 1) ? targetX : prev.x + dx * smoothingFactor;
              const newY = (Math.abs(dy) < 1) ? targetY : prev.y + dy * smoothingFactor;

              return { ...prev, x: newX, y: newY };
          });
      }
    }
    
  }, [currentStep, animationProgress, status, isPanning, isPaused]);

  // Handle wheel events with passive: false to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheelNative = (e: WheelEvent) => {
      if (!isInteractive) return;
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = 1.1;
      const newZoom = e.deltaY < 0 ? viewTransform.zoom * zoomFactor : viewTransform.zoom / zoomFactor;
      const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

      if (clampedZoom === viewTransform.zoom) return;

      const worldX = (mouseX - viewTransform.x) / viewTransform.zoom;
      const worldY = (mouseY - viewTransform.y) / viewTransform.zoom;

      const newX = mouseX - worldX * clampedZoom;
      const newY = mouseY - worldY * clampedZoom;

      setViewTransform({ x: newX, y: newY, zoom: clampedZoom });
    };

    canvas.addEventListener('wheel', handleWheelNative, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheelNative);
    };
  }, [isInteractive, viewTransform]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isInteractive) return;
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

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  return (
    <div className="w-full h-full relative pointer-events-none" onMouseLeave={handleMouseUp} onMouseUp={handleMouseUp} >
        <canvas
            ref={canvasRef}
            className={`w-full h-full pointer-events-auto ${cursorClass}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            role="img"
            aria-label={explanation}
        />
        {showLoader && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
                <LoaderIcon className="w-12 h-12 text-cyan-400 animate-spin" />
            </div>
        )}
        {isPaused && status === 'DRAWING' && (
             <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
                <div className="bg-white/10 backdrop-blur-md p-4 rounded-full">
                    <PauseIcon className="w-8 h-8 text-white" />
                </div>
            </div>
        )}
    </div>
  );
};