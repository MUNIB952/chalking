import { GoogleGenAI, Type, Modality } from "@google/genai";
import OpenAI from 'openai';
import { AIResponse } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
// Tegther AI client configured for Qwen model
const tegther = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: 'https://api.together.xyz/v1',
  dangerouslyAllowBrowser: true
});

// A robust utility to find and parse a JSON object from a string that might contain markdown fences or other text.
function robustJsonParse(str: string): any {
    // First, try to find a JSON block wrapped in ```json ... ```
    let jsonString = str;
    const match = str.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (match && match[1]) {
        jsonString = match[1];
    }

    // Find the first opening brace or bracket to start searching from.
    const startIndex = jsonString.search(/[[{]/);
    if (startIndex === -1) {
        throw new Error('No JSON object or array found in the response.');
    }

    // Work backwards from the end of the string to find the last valid, parsable JSON structure.
    for (let i = jsonString.length; i > startIndex; i--) {
        const potentialJson = jsonString.substring(startIndex, i);
        if (potentialJson.endsWith('}') || potentialJson.endsWith(']')) {
            try {
                const result = JSON.parse(potentialJson);
                return result;
            } catch (e) {
                // Continue trimming.
            }
        }
    }
    
    throw new Error('Failed to parse any valid JSON from the AI response.');
}

const idProperty = {
  id: { type: Type.STRING, description: 'Optional unique identifier for this element (e.g., "input_layer").' }
};

const colorProperty = {
  color: { type: Type.STRING, description: 'Optional hex color code for this element. Use vibrant, high-contrast colors (e.g., "#06b6d4", "#facc15") that are visible on a black background. DO NOT use black or dark grey.' }
};

const filledProperty = {
  isFilled: { type: Type.BOOLEAN, description: 'Optional. If true, fill this shape with a semi-transparent, pastel-like version of its stroke color. Use this sparingly for key elements that need emphasis.' }
};


const absolutePointSchema = {
  type: Type.OBJECT,
  properties: {
    x: { type: Type.NUMBER, description: 'X-coordinate relative to the step origin. Ranges from -1000 to 1000.' },
    y: { type: Type.NUMBER, description: 'Y-coordinate relative to the step origin. Ranges from -1000 to 1000.' },
    cx: { type: Type.NUMBER, description: 'Optional: X-coordinate of the quadratic Bézier control point for the curve segment ending at this point.' },
    cy: { type: Type.NUMBER, description: 'Optional: Y-coordinate of the quadratic Bézier control point for the curve segment ending at this point.' }
  },
  required: ['x', 'y']
};

const relativePointSchema = {
  type: Type.OBJECT,
  description: "Defines a point based on the exact intersection of two previously drawn circles. You MUST use this for precision when concepts like trilateration are involved.",
  properties: {
    referenceCircleId1: { type: Type.STRING, description: "The `id` of the first circle." },
    referenceCircleId2: { type: Type.STRING, description: "The `id` of the second circle." },
    intersectionIndex: { type: Type.INTEGER, description: "Which intersection point to use. There are always two potential points; use 0 for one and 1 for the other." }
  },
  required: ['referenceCircleId1', 'referenceCircleId2', 'intersectionIndex']
};

const pointSchema = {
  oneOf: [
    absolutePointSchema,
    relativePointSchema
  ]
};


const annotationsSchema = {
    type: Type.ARRAY,
    description: "An array of annotations (arrows or text) to overlay on the drawing.",
    items: {
      oneOf: [
        {
            type: Type.OBJECT,
            properties: {
                type: { type: Type.STRING, enum: ['arrow'] },
                start: pointSchema,
                end: pointSchema,
                controlPoint: pointSchema,
                ...colorProperty,
                ...idProperty
            },
            required: ['type', 'start', 'end']
        },
        {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ['text']},
            text: { type: Type.STRING },
            point: pointSchema,
            fontSize: { type: Type.NUMBER, description: 'Font size, e.g., 18' },
            isContextual: { type: Type.BOOLEAN, description: "Set to true if this label is for a concept that has been introduced in a previous step and is being re-drawn for context. This will render it with less emphasis." },
            ...colorProperty,
            ...idProperty
          },
          required: ['type', 'text', 'point', 'fontSize']
        },
        {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ['strikethrough']},
            points: { type: Type.ARRAY, items: pointSchema },
            ...colorProperty,
            ...idProperty
          },
          required: ['type', 'points']
        }
      ]
    }
};

const drawingPlanSchema = {
    type: Type.ARRAY,
    description: "An array of drawing commands for simple geometric shapes.",
    items: {
        oneOf: [
            {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, enum: ['rectangle'] },
                    center: pointSchema,
                    width: { type: Type.NUMBER },
                    height: { type: Type.NUMBER },
                    ...colorProperty,
                    ...idProperty,
                    ...filledProperty,
                },
                required: ['type', 'center', 'width', 'height']
            },
            {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, enum: ['circle'] },
                    center: pointSchema,
                    radius: { type: Type.NUMBER },
                    ...colorProperty,
                    ...idProperty,
                    ...filledProperty,
                },
                required: ['type', 'center', 'radius']
            },
            {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, enum: ['path'] },
                    points: { type: Type.ARRAY, items: pointSchema },
                    ...colorProperty,
                    ...idProperty
                },
                required: ['type', 'points']
            }
        ]
    }
};

const planSchema = {
  type: Type.OBJECT,
  properties: {
    explanation: {
      type: Type.STRING,
      description: 'A high-level, friendly summary of the entire visual explanation you are about to begin.'
    },
    whiteboard: {
      type: Type.ARRAY,
      description: 'An array of sequential steps for the visual explanation.',
      items: {
        type: Type.OBJECT,
        properties: {
          origin: {
            type: Type.OBJECT,
            description: 'The center point {x, y} for this step on a conceptual infinite canvas. All coordinates in this step are relative to this origin.',
            properties: absolutePointSchema.properties,
            required: absolutePointSchema.required,
          },
          explanation: {
            type: Type.STRING,
            description: 'The script for what the AI teacher will say during this step. This will be converted to speech.'
          },
          drawingPlan: drawingPlanSchema,
          annotations: annotationsSchema,
          highlightIds: {
            type: Type.ARRAY,
            description: "An array of element IDs to highlight with a 'glow' effect during this step, used to draw attention to previously drawn elements.",
            items: { type: Type.STRING }
          },
          retainedLabelIds: {
            type: Type.ARRAY,
            description: "An array of 'text' annotation IDs from previous steps that should be re-displayed in a faded style for context. Use this when building on a diagram to remind the user what existing elements are.",
            items: { type: Type.STRING }
          }
        },
        required: ['origin', 'explanation', 'drawingPlan', 'annotations']
      }
    }
  },
  required: ['explanation', 'whiteboard']
};

const QUOTA_ERROR_MESSAGE = "You've exceeded your API quota. To continue using the app, please check your plan and billing details. You can monitor your usage at https://ai.dev/usage and learn more about rate limits at https://ai.google.dev/gemini-api/docs/rate-limits.";

export const getInitialPlan = async (prompt: string): Promise<AIResponse> => {
  try {
    const systemInstruction = `You are Visu, an expert AI teacher specializing in creating clear, minimalist, and memorable technical diagrams. Your style is clean and hand-drawn on a black background.

Your task is to create a compelling, multi-step visual lesson that feels like a premium educational video based on the user's request.

**Core Principles (MANDATORY)**

1.  **Analogy First:** ALWAYS start by explaining the concept using a simple, creative, and non-cliché analogy. Dedicate the first few steps to drawing and explaining the analogy itself before connecting it to the technical topic.

2.  **Granular Steps:** Break down the explanation into many small, simple steps (8-15 is typical). Each step should introduce only one or two new ideas.

3.  **Visual Clarity & Spacing (Most Important Rule):**
    *   To prevent diagrams from colliding, each major conceptual step **MUST** be in its own distinct area on the canvas.
    *   **Rule:** The \`origin\` property of each step dictates its position. The distance between the \`origin\` of any two separate diagrams **MUST** be large.
    *   **Implementation:** For a new diagram, increase the step's \`origin.x\` or \`origin.y\` by at least **2000** from the previous one.
    *   **Example:** \`step[0].origin = {x: 0, y: 0}\`, \`step[1].origin = {x: 2000, y: 0}\`, \`step[2].origin = {x: 0, y: 2000}\`.

4.  **Build-Up Animation:**
    *   To add elements to the diagram from the *immediately preceding* step (e.g., adding labels to a shape you just drew), you **MUST** re-use the exact same \`{x, y}\` for this step's \`origin\`.
    *   Crucially, the \`drawingPlan\` for this "addition" step **MUST ONLY** contain the *new* elements to be drawn. **DO NOT** repeat drawing commands from the previous step.

5.  **Labeling Protocol (CRITICAL):**
    *   **First Appearance:** The first time you draw any significant element, you **MUST** add a \`text\` annotation to label it in the same step. Give this element a unique \`id\`. An unlabeled element is a failure.
    *   **Contextual Re-Appearance:** If you re-draw an element in a *new* location (a new diagram with a new \`origin\`), you must label it again, but this time set its \`"isContextual": true\` property.
    *   **Context Persistence:** When adding to an *existing* diagram, use the \`retainedLabelIds\` array to keep important labels from previous steps visible for context.

6.  **Visual Design:**
    *   **Canvas:** You are drawing on a 2D canvas where the Y-Axis is **INVERTED**. Positive \`y\` goes **DOWN**. Negative \`y\` goes **UP**.
    *   **Color:** You are drawing on a **black background**. You **MUST** use a vibrant, high-contrast color palette. **Forbidden Colors:** DO NOT use black, dark grey, or any low-contrast color. **Recommended:** Use bright, distinct colors like cyan (#06b6d4), magenta (#d946ef), yellow (#facc15), and white (#FFFFFF).

**CRITICAL FAILURE CONDITIONS (NON-NEGOTIABLE)**
Your response will be rejected if it violates ANY of these rules. These are common mistakes that MUST be avoided.

*   **NO CONVERSATIONAL TEXT:** Under NO circumstances should you respond with anything other than the single, valid JSON object requested. Do not provide conversational text, apologies, or explanations like "I cannot fulfill this request because...". A non-JSON response is an immediate failure.
*   **INVALID KEYS:** You MUST use the exact key names defined in the schema.
    *   The key to define a shape or annotation is \`'type'\`. The key \`'shape'\` is FORBIDDEN and will be rejected.
    *   The key for a text annotation's position is \`'point'\`. The key \`'position'\` is FORBIDDEN and will be rejected.
*   **INVALID COORDINATE FORMAT:** All coordinates (for \`center\`, \`point\`, \`start\`, \`end\`, etc.) MUST be JSON objects with "x" and "y" number properties (e.g., \`{"x": 100, "y": 150}\`). Using a number array (e.g., \`[100, 150]\`) is a critical failure and WILL be rejected.
*   **VIOLATING SPACING RULE:** Failure to use a large \`origin\` offset (e.g., \`x: 2000\` or \`y: 2000\`) between conceptually different diagrams is a critical failure and will render the output useless. A response where multiple, distinct diagrams all have an origin of \`{x:0, y:0}\` is a failure.

**Schema Adherence (MANDATORY)**
You must respond with a single, valid JSON object that strictly adheres to the schema below:

{
  "explanation": "string - high-level summary",
  "whiteboard": [
    {
      "origin": {"x": number, "y": number},
      "explanation": "string - script for this step",
      "drawingPlan": [
        {
          "type": "rectangle|circle|path",
          "center": {"x": number, "y": number},
          "width": number (for rectangle),
          "height": number (for rectangle),
          "radius": number (for circle),
          "points": [{"x": number, "y": number}] (for path),
          "color": "string (optional hex color)",
          "id": "string (optional)",
          "isFilled": boolean (optional)
        }
      ],
      "annotations": [
        {
          "type": "arrow|text|strikethrough",
          "start": {"x": number, "y": number} (for arrow),
          "end": {"x": number, "y": number} (for arrow),
          "controlPoint": {"x": number, "y": number} (optional for arrow),
          "text": "string" (for text),
          "point": {"x": number, "y": number} (for text),
          "fontSize": number (for text),
          "isContextual": boolean (optional for text),
          "points": [{"x": number, "y": number}] (for strikethrough),
          "color": "string (optional hex color)",
          "id": "string (optional)"
        }
      ],
      "highlightIds": ["string"],
      "retainedLabelIds": ["string"]
    }
  ]
}

Return ONLY the JSON, wrapped in markdown json code fence.
`;

    const userRequest = `A user has asked: "${prompt}"`;

    const response = await tegther.chat.completions.create({
      model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userRequest }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.9,
      max_tokens: 32000,
      top_p: 0.95,
      frequency_penalty: 0,
      presence_penalty: 0,
      // @ts-ignore - Together AI specific parameters for high reasoning effort
      safety_model: '',
      repetition_penalty: 1.0,
    });

    const content = response.choices[0].message.content || '{}';
    // Use the robust parser on the response text.
    return robustJsonParse(content);
  } catch (e) {
    console.error(e);
    if (e instanceof Error && e.message.includes('quota')) {
        throw new Error(QUOTA_ERROR_MESSAGE);
    }
    throw new Error('Could not generate a plan from the prompt.');
  }
};


export const generateSpeech = async (text: string): Promise<string | null> => {
  if (!text) return null;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;

  } catch (e) {
    console.error("Speech generation failed", e);
    // Don't throw an error, just return null so the animation can proceed without audio.
    return null; 
  }
};