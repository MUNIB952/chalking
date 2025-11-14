
export type AppStatus = 'IDLE' | 'THINKING' | 'PREPARING' | 'DRAWING' | 'DONE' | 'ERROR';

// Animation configuration for GSAP
export type AnimationConfig = {
  from?: {
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    opacity?: number;
  };
  to?: {
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    opacity?: number;
  };
  duration?: number; // in seconds
  ease?: string; // GSAP easing function (e.g., "bounce.out", "elastic.inOut")
  delay?: number; // delay before animation starts
  repeat?: number; // -1 for infinite
};

export type AbsolutePoint = {
  x: number;
  y: number;
  // Optional quadratic Bézier control point for the curve segment ending at this point.
  cx?: number;
  cy?: number;
};

export type RelativePoint = {
  referenceCircleId1: string;
  referenceCircleId2: string;
  intersectionIndex: 0 | 1;
};

export type Point = AbsolutePoint | RelativePoint;

// Helper type guard
export const isRelativePoint = (point: Point): point is RelativePoint => {
  return (point as RelativePoint).referenceCircleId1 !== undefined;
};


export type ArrowAnnotation = {
  type: 'arrow';
  start: Point;
  end: Point;
  controlPoint?: Point; // Optional control point for curved arrows
  color?: string;
  id?: string;
  animate?: AnimationConfig; // Optional GSAP animation
};

export type TextAnnotation = {
  type: 'text';
  text: string;
  point: Point;
  fontSize: number;
  color?: string;
  id?: string;
  isContextual?: boolean; // If true, render this text with less emphasis as it's for context.
  animate?: AnimationConfig; // Optional GSAP animation
};

// NEW: A command to "cross out" a previously drawn element to show a correction.
export type StrikethroughAnnotation = {
  type: 'strikethrough';
  points: Point[]; // A path for the wavy line.
  color?: string;
  id?: string;
  animate?: AnimationConfig; // Optional GSAP animation
};

export type Annotation = ArrowAnnotation | TextAnnotation | StrikethroughAnnotation;

// Drawing commands for primitive geometric shapes.
export type RectangleCommand = {
  type: 'rectangle';
  center: Point;
  width: number;
  height: number;
  color?: string;
  id?: string;
  isFilled?: boolean;
  animate?: AnimationConfig; // Optional GSAP animation
};

export type CircleCommand = {
  type: 'circle';
  center: Point;
  radius: number;
  color?: string;
  id?: string;
  isFilled?: boolean;
  animate?: AnimationConfig; // Optional GSAP animation
};

export type PathCommand = {
  type: 'path';
  points: Point[];
  color?: string;
  id?: string;
  animate?: AnimationConfig; // Optional GSAP animation
};

export type DrawingCommand = RectangleCommand | CircleCommand | PathCommand;


export type WhiteboardStep = {
  origin: AbsolutePoint;
  stepName: string; // Short name for this step (displayed above progress bar)
  explanation: string;
  drawingPlan: DrawingCommand[] | null;
  annotations: Annotation[];
  highlightIds?: string[];
  retainedLabelIds?: string[];
}

export interface AIResponse {
  explanation: string;
  whiteboard: WhiteboardStep[] | null;
}