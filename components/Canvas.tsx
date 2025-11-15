
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { WhiteboardStep, Annotation, AppStatus, ArrowAnnotation, DrawingCommand, TextAnnotation, StrikethroughAnnotation, Point, AbsolutePoint, isRelativePoint, CircleCommand, SoftBodyCommand, PhysicsBodyCommand } from '../types';
import { LoaderIcon, PauseIcon } from './icons';
import gsap from 'gsap';
import Matter from 'matter-js';

interface CanvasProps {
  steps: WhiteboardStep[];
  currentStepIndex: number;
  status: AppStatus;
  animationProgress: number;
  isPaused: boolean;
  key: number; // To force re-mount and reset
  explanation: string;
  onFocusRequest?: () => void;
  stepDurations?: number[]; // Audio duration for each step (seconds)
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


// This needs to be defined outside the component to avoid recreating it
// We'll need to pass the necessary dependencies as parameters
const createDrawStepContent = (
  getGSAPState: (id: string | undefined) => GSAPAnimationState,
  startGSAPAnimation: (item: DrawingCommand | Annotation) => void,
  stepDuration: number // Total step audio duration in seconds
) => {
  return (ctx: CanvasRenderingContext2D, step: WhiteboardStep, elapsedSeconds: number, idsToExclude?: Set<string>) => {
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

    // Calculate default timing: All items draw sequentially in first 40% of step duration
    const DEFAULT_DRAWING_WINDOW = stepDuration * 0.4;
    const defaultItemDuration = DEFAULT_DRAWING_WINDOW / totalItems;

    const drawItem = (item: DrawingCommand | Annotation, index: number) => {
        // Determine timing for this item
        const drawDelay = ('drawDelay' in item && item.drawDelay !== undefined)
          ? item.drawDelay
          : (index * defaultItemDuration); // Default: sequential

        const drawDuration = ('drawDuration' in item && item.drawDuration !== undefined)
          ? item.drawDuration
          : defaultItemDuration; // Default: evenly split

        // Calculate progress for this item based on elapsed time
        const itemStartTime = drawDelay;
        const itemEndTime = drawDelay + drawDuration;

        let progress = 0;
        if (elapsedSeconds >= itemEndTime) {
          progress = 1; // Fully drawn
        } else if (elapsedSeconds > itemStartTime) {
          progress = (elapsedSeconds - itemStartTime) / drawDuration; // Currently drawing
        } else {
          return; // Not started yet
        }

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

        // Get GSAP animation state for this item
        const gsapState = getGSAPState(item.id);

        // Apply GSAP transformations
        ctx.save();

        // Calculate center point for transformation
        let centerX = (step.origin as AbsolutePoint).x;
        let centerY = (step.origin as AbsolutePoint).y;

        if ('center' in item && item.center) {
          centerX += (item.center as AbsolutePoint).x;
          centerY += (item.center as AbsolutePoint).y;
        } else if ('point' in item && item.point) {
          centerX += (item.point as AbsolutePoint).x;
          centerY += (item.point as AbsolutePoint).y;
        }

        // Apply GSAP transformations (translate, rotate, scale)
        ctx.translate(centerX + gsapState.x, centerY + gsapState.y);
        ctx.rotate(gsapState.rotation * Math.PI / 180); // Convert degrees to radians
        ctx.scale(gsapState.scale, gsapState.scale);
        ctx.translate(-centerX, -centerY);
        ctx.globalAlpha *= gsapState.opacity;

        // Draw the item
        if (item.type === 'rectangle') drawAnimatedRectangle(ctx, item, step.origin, progress);
        if (item.type === 'circle') drawAnimatedCircle(ctx, item, step.origin, progress);
        if (item.type === 'path') drawAnimatedPath(ctx, item.points, step.origin, progress);
        if (item.type === 'arrow') drawAnimatedArrow(ctx, item, step.origin, progress);
        if (item.type === 'text') drawAnimatedText(ctx, item, step.origin, progress);
        if (item.type === 'strikethrough') drawAnimatedStrikethrough(ctx, item, step.origin, progress);

        ctx.restore();

        // If this item just finished drawing (progress === 1), start GSAP animation
        if (progress === 1 && item.animate && item.id) {
          startGSAPAnimation(item);
        }
    };

    // Draw all items (they will self-determine if they should render based on time)
    itemsToDraw.forEach((item, index) => {
      drawItem(item, index);
    });
  };
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


// GSAP animation state type
type GSAPAnimationState = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
};

export const Canvas: React.FC<CanvasProps> = ({
  steps,
  currentStepIndex,
  status,
  animationProgress,
  isPaused,
  explanation,
  onFocusRequest,
  stepDurations = []
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, zoom: 1 });
  const penTipPosition = useRef<Point | null>(null);

  // GSAP animation states: Map of element ID to animated properties
  const gsapStates = useRef<Map<string, GSAPAnimationState>>(new Map());
  const gsapTweens = useRef<Map<string, gsap.core.Tween>>(new Map());
  const completedItems = useRef<Set<string>>(new Set());

  // Matter.js Physics Engine: Map of step index to physics world
  const physicsEngines = useRef<Map<number, Matter.Engine>>(new Map());
  const physicsRunners = useRef<Map<number, Matter.Runner>>(new Map());
  const physicsBodiesMap = useRef<Map<string, Matter.Body | Matter.Composite>>(new Map());

  // Helper: Get GSAP animation state for an element (returns identity if no animation)
  const getGSAPState = useCallback((id: string | undefined): GSAPAnimationState => {
    if (!id || !gsapStates.current.has(id)) {
      return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
    }
    return gsapStates.current.get(id)!;
  }, []);

  // Helper: Start GSAP animation for an element when it finishes drawing
  const startGSAPAnimation = useCallback((item: DrawingCommand | Annotation) => {
    if (!item.id || !item.animate || completedItems.current.has(item.id)) return;

    completedItems.current.add(item.id);

    const config = item.animate;
    const initialState: GSAPAnimationState = {
      x: config.from?.x ?? 0,
      y: config.from?.y ?? 0,
      scale: config.from?.scale ?? 1,
      rotation: config.from?.rotation ?? 0,
      opacity: config.from?.opacity ?? 1,
    };

    const targetState: GSAPAnimationState = {
      x: config.to?.x ?? initialState.x,
      y: config.to?.y ?? initialState.y,
      scale: config.to?.scale ?? initialState.scale,
      rotation: config.to?.rotation ?? initialState.rotation,
      opacity: config.to?.opacity ?? initialState.opacity,
    };

    // Set initial state
    gsapStates.current.set(item.id, initialState);

    // Kill any existing tween for this element
    const existingTween = gsapTweens.current.get(item.id);
    if (existingTween) {
      existingTween.kill();
    }

    // Create GSAP tween
    const tween = gsap.to(initialState, {
      ...targetState,
      duration: config.duration ?? 1,
      ease: config.ease ?? 'power2.out',
      delay: config.delay ?? 0,
      repeat: config.repeat ?? 0,
      onUpdate: () => {
        // Update the state map so render loop picks up changes
        gsapStates.current.set(item.id!, { ...initialState });
      },
    });

    gsapTweens.current.set(item.id, tween);
  }, []);

  // Helper: Create Matter.js soft body from JSON command
  const createSoftBody = useCallback((cmd: SoftBodyCommand, origin: AbsolutePoint) => {
    const { Engine, World, Bodies, Composites, Composite, Constraint } = Matter;

    const centerX = (origin.x + (cmd.center as AbsolutePoint).x);
    const centerY = (origin.y + (cmd.center as AbsolutePoint).y);

    // Create particle grid
    const particleOptions = {
      friction: cmd.particleOptions?.friction ?? 0.05,
      frictionStatic: cmd.particleOptions?.frictionStatic ?? 0.1,
      mass: cmd.particleOptions?.mass ?? 1,
      render: {
        fillStyle: cmd.particleOptions?.render?.fillStyle ?? '#06b6d4',
        strokeStyle: cmd.particleOptions?.render?.strokeStyle ?? '#06b6d4'
      }
    };

    const constraintOptions = {
      stiffness: cmd.constraintOptions?.stiffness ?? 0.9,
      render: {
        visible: cmd.constraintOptions?.render?.visible ?? true,
        lineWidth: cmd.constraintOptions?.render?.lineWidth ?? 1,
        strokeStyle: cmd.constraintOptions?.render?.strokeStyle ?? '#06b6d4'
      }
    };

    // Create soft body using Matter.js Composites
    const softBody = Composites.stack(
      centerX,
      centerY,
      cmd.columns,
      cmd.rows,
      cmd.columnGap,
      cmd.rowGap,
      (x: number, y: number) => {
        return Bodies.circle(x, y, cmd.particleRadius, particleOptions);
      }
    );

    // Add constraints to connect particles
    Composites.mesh(softBody, cmd.columns, cmd.rows, cmd.crossBrace, constraintOptions);

    // Pin edges if specified
    const bodies = Composite.allBodies(softBody);
    if (cmd.pinTop) {
      for (let i = 0; i < cmd.columns; i++) {
        bodies[i].isStatic = true;
      }
    }
    if (cmd.pinBottom) {
      const startIdx = (cmd.rows - 1) * cmd.columns;
      for (let i = startIdx; i < startIdx + cmd.columns; i++) {
        bodies[i].isStatic = true;
      }
    }
    if (cmd.pinLeft) {
      for (let i = 0; i < cmd.rows; i++) {
        bodies[i * cmd.columns].isStatic = true;
      }
    }
    if (cmd.pinRight) {
      for (let i = 0; i < cmd.rows; i++) {
        bodies[(i + 1) * cmd.columns - 1].isStatic = true;
      }
    }

    return softBody;
  }, []);

  // Helper: Create Matter.js physics body from JSON command
  const createPhysicsBody = useCallback((cmd: PhysicsBodyCommand, origin: AbsolutePoint) => {
    const { Bodies } = Matter;

    const centerX = origin.x + (cmd.center as AbsolutePoint).x;
    const centerY = origin.y + (cmd.center as AbsolutePoint).y;

    const options = {
      isStatic: cmd.options?.isStatic ?? false,
      mass: cmd.options?.mass ?? 1,
      friction: cmd.options?.friction ?? 0.1,
      restitution: cmd.options?.restitution ?? 0.5,
      density: cmd.options?.density ?? 0.001,
      render: {
        fillStyle: cmd.options?.render?.fillStyle ?? '#facc15',
        strokeStyle: cmd.options?.render?.strokeStyle ?? '#facc15'
      }
    };

    if (cmd.shape === 'circle') {
      return Bodies.circle(centerX, centerY, cmd.radius || 30, options);
    } else {
      return Bodies.rectangle(centerX, centerY, cmd.width || 60, cmd.height || 60, options);
    }
  }, []);

  // Helper: Initialize physics for current step
  const initializePhysics = useCallback((stepIndex: number, step: WhiteboardStep) => {
    const { Engine, World, Runner } = Matter;

    // Clean up existing physics for this step
    const existingEngine = physicsEngines.current.get(stepIndex);
    if (existingEngine) {
      const existingRunner = physicsRunners.current.get(stepIndex);
      if (existingRunner) {
        Runner.stop(existingRunner);
      }
      Engine.clear(existingEngine);
    }

    // Check if step has physics bodies
    const physicsItems = (step.drawingPlan || []).filter(
      item => item.type === 'softBody' || item.type === 'physicsBody'
    );

    if (physicsItems.length === 0) return; // No physics needed

    // Create physics engine
    const engine = Engine.create({
      gravity: step.physicsConfig?.gravity || { x: 0, y: 1 },
      enableSleeping: step.physicsConfig?.enableSleeping ?? false,
      constraintIterations: step.physicsConfig?.constraintIterations ?? 2
    });

    // Create physics bodies
    physicsItems.forEach(item => {
      let body: Matter.Body | Matter.Composite;

      if (item.type === 'softBody') {
        body = createSoftBody(item as SoftBodyCommand, step.origin);
      } else {
        body = createPhysicsBody(item as PhysicsBodyCommand, step.origin);
      }

      World.add(engine.world, body);

      if (item.id) {
        physicsBodiesMap.current.set(item.id, body);
      }
    });

    // Create runner
    const runner = Runner.create();
    Runner.run(runner, engine);

    // Store for cleanup
    physicsEngines.current.set(stepIndex, engine);
    physicsRunners.current.set(stepIndex, runner);
  }, [createSoftBody, createPhysicsBody]);

  // Expose setViewTransform for InteractionLayer
  useEffect(() => {
    (window as any).__setCanvasViewTransform = setViewTransform;
  }, []);

  const showLoader = useMemo(() => status === 'THINKING' || status === 'PREPARING', [status]);

  // Create the drawStepContent function with access to GSAP state
  const drawStepContent = useMemo(() => {
    const currentStepDuration = stepDurations[currentStepIndex] || 4; // Default 4s
    return createDrawStepContent(getGSAPState, startGSAPAnimation, currentStepDuration);
  }, [getGSAPState, startGSAPAnimation, currentStepIndex, stepDurations]);

  // Cleanup GSAP animations on unmount or when steps change
  useEffect(() => {
    return () => {
      // Kill all active tweens
      gsapTweens.current.forEach(tween => tween.kill());
      gsapTweens.current.clear();
      gsapStates.current.clear();
      completedItems.current.clear();
    };
  }, [steps]);

  // Initialize physics for current step
  useEffect(() => {
    if (!currentStep) return;
    initializePhysics(currentStepIndex, currentStep);
  }, [currentStepIndex, currentStep, initializePhysics]);

  // Cleanup physics on unmount
  useEffect(() => {
    return () => {
      // Stop all runners
      physicsRunners.current.forEach(runner => Matter.Runner.stop(runner));
      // Clear all engines
      physicsEngines.current.forEach(engine => Matter.Engine.clear(engine));
      // Clear maps
      physicsRunners.current.clear();
      physicsEngines.current.clear();
      physicsBodiesMap.current.clear();
    };
  }, [steps]);

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

    // FIX 4: Lower device pixel ratio to 1x to reduce CPU usage (saves 10-15%)
    const dpr = 1; // Changed from 1.5x to 1x for better performance
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
        // FIX 3: Removed expensive shadow/glow effects (saves 15-20% CPU)
        // const pulse = (Math.sin(timestamp / 200) + 1) / 2;
        // ctx.shadowColor = '#06b6d4';
        // ctx.shadowBlur = 15 + pulse * 10;

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
        const stepDur = stepDurations[i] || 4;
        if (step) {
          // Pass max elapsed time to show everything
          const fullElapsed = stepDur * 2; // Well past all possible timings
          const stepDrawFn = createDrawStepContent(getGSAPState, startGSAPAnimation, stepDur);
          stepDrawFn(ctx, step, fullElapsed);
        }
      }
    } else {
      // During drawing, render previous steps + current animated step
      for (let i = 0; i < currentStepIndex; i++) {
        const step = resolvedSteps[i];
        const stepDur = stepDurations[i] || 4;
        if (step) {
          // Only exclude items if this step shares the same origin as current step
          // This prevents re-drawing items during Conceptual Pivot but allows Addition steps to show fully
          const sharesOrigin = currentStep &&
            step.origin.x === currentStep.origin.x &&
            step.origin.y === currentStep.origin.y;
          const fullElapsed = stepDur * 2; // Well past all possible timings
          const stepDrawFn = createDrawStepContent(getGSAPState, startGSAPAnimation, stepDur);
          stepDrawFn(ctx, step, fullElapsed, sharesOrigin ? currentStepItemIds : undefined);
        }
      }

      if (currentStep) {
        // Convert animationProgress (0-1) to elapsed seconds
        const currentStepDur = stepDurations[currentStepIndex] || 4;
        const elapsedSeconds = animationProgress * currentStepDur;
        drawStepContent(ctx, currentStep, elapsedSeconds);
      }
    }

    // Render Matter.js physics bodies
    const renderPhysicsBodies = (stepIndex: number) => {
      const engine = physicsEngines.current.get(stepIndex);
      if (!engine) return;

      const { Composite } = Matter;
      const allBodies = Composite.allBodies(engine.world);
      const allConstraints = Composite.allConstraints(engine.world);

      // Render constraints (connections between particles)
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1;
      allConstraints.forEach(constraint => {
        if (!constraint.render?.visible) return;
        if (!constraint.bodyA || !constraint.bodyB) return;

        const pointA = constraint.bodyA.position;
        const pointB = constraint.bodyB.position;

        ctx.strokeStyle = constraint.render.strokeStyle || '#06b6d4';
        ctx.lineWidth = constraint.render.lineWidth || 1;
        ctx.beginPath();
        ctx.moveTo(pointA.x, pointA.y);
        ctx.lineTo(pointB.x, pointB.y);
        ctx.stroke();
      });

      // Render bodies (particles)
      allBodies.forEach(body => {
        const { position, vertices, circleRadius } = body;

        if (circleRadius) {
          // Circle body
          ctx.fillStyle = body.render?.fillStyle || '#06b6d4';
          ctx.strokeStyle = body.render?.strokeStyle || '#06b6d4';
          ctx.beginPath();
          ctx.arc(position.x, position.y, circleRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (vertices) {
          // Polygon body
          ctx.fillStyle = body.render?.fillStyle || '#facc15';
          ctx.strokeStyle = body.render?.strokeStyle || '#facc15';
          ctx.beginPath();
          ctx.moveTo(vertices[0].x, vertices[0].y);
          for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      });
    };

    // Render physics for all visible steps
    if (status === 'DONE') {
      for (let i = 0; i < resolvedSteps.length; i++) {
        renderPhysicsBodies(i);
      }
    } else {
      // Render previous steps physics
      for (let i = 0; i < currentStepIndex; i++) {
        renderPhysicsBodies(i);
      }
      // Render current step physics
      renderPhysicsBodies(currentStepIndex);
    }

    if (status === 'DRAWING' && !isPaused && penTipPosition.current) {
        const penWorld = penTipPosition.current as AbsolutePoint;

        ctx.save();
        // FIX 3: Removed shadow effect from pen tip (saves CPU)
        // ctx.shadowColor = '#06b6d4';
        // ctx.shadowBlur = 10;
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
    let lastFrameTime = 0;
    let isTabVisible = true;

    // FIX 2: Dynamic framerate based on animation state (saves 60-70% when not animating)
    const getTargetFPS = () => {
      if (status === 'DRAWING' && !isPaused) return 30; // Changed from 60 to 30 FPS (still smooth, saves 15-20% CPU)
      if (isPaused) return 0; // STOP completely when paused (saves 100% CPU)
      if (status === 'DONE') return 5; // Very low framerate when done (in case of interactions)
      return 30; // Default
    };

    // FIX 1: Pause rendering when tab is hidden (saves 90% when hidden)
    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible && !isPaused) {
        // Resume rendering when tab becomes visible (only if not paused)
        frameId = requestAnimationFrame(renderLoop);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const renderLoop = (timestamp: number) => {
      if (!isTabVisible) {
        // Don't schedule next frame if tab is hidden
        return;
      }

      const targetFPS = getTargetFPS();

      // If FPS is 0 (paused state), draw once and stop
      if (targetFPS === 0) {
        drawCanvas(timestamp);
        return; // Stop the loop - will restart when isPaused changes (useEffect dependency)
      }

      const frameInterval = 1000 / targetFPS;
      const elapsed = timestamp - lastFrameTime;

      if (elapsed >= frameInterval) {
        drawCanvas(timestamp);
        lastFrameTime = timestamp - (elapsed % frameInterval);
      }

      frameId = requestAnimationFrame(renderLoop);
    };

    // Start the render loop (will stop immediately if paused, restart when resumed)
    frameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [drawCanvas, status, isPaused]);

  // Focus handler - centers view on current drawing area
  const handleFocus = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentStep) return;

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
    if (canvas) {
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
    
  }, [currentStep, animationProgress, status, isPaused]);

  return (
    <div
      className="absolute inset-0 z-0"
      style={{ pointerEvents: 'none' }}
    >
        <canvas
            ref={canvasRef}
            className="w-full h-full"
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