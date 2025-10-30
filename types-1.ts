export type AppStatus = 'IDLE' | 'THINKING' | 'DRAWING' | 'DONE' | 'ERROR';

export type Point = {
  x: number;
  y: number;
  cx?: number; // Control point X for quadratic curve
  cy?: number; // Control point Y for quadratic curve
};

export type DrawingPath = {
  path: Point[];
  isClosed: boolean;
};

export type DrawingPlan = DrawingPath[];

export type DrawingText = {
  text: string;
  point: Point;
  fontSize: number;
};

export type WhiteboardStep = {
  origin: Point; // The center point for this step on the infinite canvas
  explanation: string;
  plan: DrawingPlan;
  texts: DrawingText[] | null;
}

export interface AIResponse {
  explanation: string; // Overall explanation
  checkpoints: string[]; // No longer used in UI, but kept for potential future use
  whiteboard: WhiteboardStep[] | null;
}