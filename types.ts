
export type AppStatus = 'IDLE' | 'THINKING' | 'PREPARING' | 'DRAWING' | 'DONE' | 'ERROR';

export type Point = {
  x: number;
  y: number;
};

export type ArrowAnnotation = {
  type: 'arrow';
  start: Point;
  end: Point;
};

// NEW: A dedicated type for rendering text to ensure it's always legible.
export type TextAnnotation = {
  type: 'text';
  text: string;
  point: Point;
  fontSize: number;
};

// UPDATED: Annotation is now a union of a clean arrow or text type.
export type Annotation = ArrowAnnotation | TextAnnotation;

// Drawing commands for primitive geometric shapes.
export type RectangleCommand = {
  type: 'rectangle';
  center: Point;
  width: number;
  height: number;
};

export type CircleCommand = {
  type: 'circle';
  center: Point;
  radius: number;
};

export type PathCommand = {
  type: 'path';
  points: Point[];
};

export type DrawingCommand = RectangleCommand | CircleCommand | PathCommand;


export type WhiteboardStep = {
  origin: Point;
  explanation: string;
  drawingPlan: DrawingCommand[] | null;
  annotations: Annotation[];
}

export interface AIResponse {
  explanation: string;
  whiteboard: WhiteboardStep[] | null;
}
