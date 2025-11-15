
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
  drawDelay?: number; // Delay before starting to draw this item (seconds from step start)
  drawDuration?: number; // How long the drawing animation takes (seconds)
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
  drawDelay?: number; // Delay before starting to draw this item (seconds from step start)
  drawDuration?: number; // How long the drawing animation takes (seconds)
  animate?: AnimationConfig; // Optional GSAP animation
};

// NEW: A command to "cross out" a previously drawn element to show a correction.
export type StrikethroughAnnotation = {
  type: 'strikethrough';
  points: Point[]; // A path for the wavy line.
  color?: string;
  id?: string;
  drawDelay?: number; // Delay before starting to draw this item (seconds from step start)
  drawDuration?: number; // How long the drawing animation takes (seconds)
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
  drawDelay?: number; // Delay before starting to draw this item (seconds from step start)
  drawDuration?: number; // How long the drawing animation takes (seconds)
  animate?: AnimationConfig; // Optional GSAP animation
};

export type CircleCommand = {
  type: 'circle';
  center: Point;
  radius: number;
  color?: string;
  id?: string;
  isFilled?: boolean;
  drawDelay?: number; // Delay before starting to draw this item (seconds from step start)
  drawDuration?: number; // How long the drawing animation takes (seconds)
  animate?: AnimationConfig; // Optional GSAP animation
};

export type PathCommand = {
  type: 'path';
  points: Point[];
  color?: string;
  id?: string;
  drawDelay?: number; // Delay before starting to draw this item (seconds from step start)
  drawDuration?: number; // How long the drawing animation takes (seconds)
  animate?: AnimationConfig; // Optional GSAP animation
};

// Matter.js Physics Configuration
export type PhysicsConfig = {
  gravity?: { x: number; y: number }; // Gravity vector (default: {x: 0, y: 1})
  enableSleeping?: boolean; // Performance optimization
  constraintIterations?: number; // Solver iterations (higher = more accurate, slower)
};

// Soft Body Command (Matter.js Composites.softBody)
export type SoftBodyCommand = {
  type: 'softBody';
  center: Point; // Top-left position of the grid
  columns: number; // Number of particles horizontally
  rows: number; // Number of particles vertically
  columnGap: number; // Spacing between columns
  rowGap: number; // Spacing between rows
  crossBrace: boolean; // Add diagonal constraints for structural integrity
  particleRadius: number; // Size of each particle
  particleOptions?: {
    friction?: number; // Surface friction (0-1)
    frictionStatic?: number; // Static friction (0-1)
    mass?: number; // Mass of each particle
    render?: { fillStyle?: string; strokeStyle?: string }; // Visual styling
  };
  constraintOptions?: {
    stiffness?: number; // Constraint rigidity (0-1, lower = more flexible)
    render?: { visible?: boolean; lineWidth?: number; strokeStyle?: string }; // Visual styling
  };
  id?: string;
  pinTop?: boolean; // Pin top row (for cloth hanging effect)
  pinBottom?: boolean; // Pin bottom row
  pinLeft?: boolean; // Pin left column
  pinRight?: boolean; // Pin right column
};

// Physics Body Command (general Matter.js bodies)
export type PhysicsBodyCommand = {
  type: 'physicsBody';
  shape: 'circle' | 'rectangle'; // Body shape
  center: Point; // Position
  radius?: number; // For circles
  width?: number; // For rectangles
  height?: number; // For rectangles
  options?: {
    isStatic?: boolean; // Fixed in place (doesn't move)
    mass?: number; // Mass (affects gravity)
    friction?: number; // Surface friction
    restitution?: number; // Bounciness (0 = no bounce, 1 = perfect bounce)
    density?: number; // Density (affects mass calculation)
    render?: { fillStyle?: string; strokeStyle?: string }; // Visual styling
  };
  id?: string;
};

export type DrawingCommand = RectangleCommand | CircleCommand | PathCommand | SoftBodyCommand | PhysicsBodyCommand;


export type WhiteboardStep = {
  origin: AbsolutePoint;
  stepName: string; // Short name for this step (displayed above progress bar)
  explanation: string;
  drawingPlan: DrawingCommand[] | null;
  annotations: Annotation[];
  highlightIds?: string[];
  retainedLabelIds?: string[];
  physicsConfig?: PhysicsConfig; // Optional Matter.js physics configuration for this step
}

export interface AIResponse {
  explanation: string;
  whiteboard: WhiteboardStep[] | null;
}