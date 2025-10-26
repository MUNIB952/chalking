
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { AIResponse } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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


const pointSchema = {
  type: Type.OBJECT,
  properties: {
    x: { type: Type.NUMBER, description: 'X-coordinate relative to the step origin. Ranges from -1000 to 1000.' },
    y: { type: Type.NUMBER, description: 'Y-coordinate relative to the step origin. Ranges from -1000 to 1000.' }
  },
  required: ['x', 'y']
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
                end: pointSchema
            },
            required: ['type', 'start', 'end']
        },
        {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ['text']},
            text: { type: Type.STRING },
            point: pointSchema,
            fontSize: { type: Type.NUMBER, description: 'Font size, e.g., 18' }
          },
          required: ['type', 'text', 'point', 'fontSize']
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
                    height: { type: Type.NUMBER }
                },
                required: ['type', 'center', 'width', 'height']
            },
            {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, enum: ['circle'] },
                    center: pointSchema,
                    radius: { type: Type.NUMBER }
                },
                required: ['type', 'center', 'radius']
            },
            {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, enum: ['path'] },
                    points: { type: Type.ARRAY, items: pointSchema }
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
            properties: pointSchema.properties,
            required: pointSchema.required,
          },
          explanation: {
            type: Type.STRING,
            description: 'The script for what the AI teacher will say during this step. This will be converted to speech.'
          },
          drawingPlan: drawingPlanSchema,
          annotations: annotationsSchema
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
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: `You are Visu, an expert AI teacher and a skilled graphic designer specializing in technical diagrams. You explain complex topics using a minimalist, clean, hand-drawn whiteboard style on a black background. A user has asked: "${prompt}".

      Your task is to create a compelling, multi-step visual lesson that feels like a continuous, live presentation.

      **Persona:**
      - You are a patient and insightful teacher. Your tone should be encouraging and clear.
      - Use simple analogies to explain complex ideas. Break things down to their most fundamental components.
      - Ensure your explanation is comprehensive and leaves the user with a solid understanding.

      **Core Principles (Non-negotiable):**
      1.  **The Canvas:** You are drawing on a conceptual 2D canvas that is 2000 units wide and 2000 units tall. The center is at {x: 0, y: 0}. This gives you ample space. Use it wisely to create clean, spread-out diagrams.
      2.  **Clarity Above All:** Your primary goal is to create clear, understandable diagrams. The visuals must be high quality, logical, and aesthetically clean. Think like a top-tier technical illustrator preparing a slide deck.
      3.  **Legible Text is MANDATORY:**
          - You MUST use the \`text\` annotation type for all labels and text. Keep text labels short, clear, and easy to read.
          - **CRITICAL: DO NOT, under any circumstances, draw text using 'path' commands. It results in an unreadable mess.**
          - Place text labels logically near the elements they describe.
      4.  **Spatial Awareness & "Photographic Memory" (NO OVERLAPPING):**
          - **CRITICAL: You MUST behave as if you have a perfect, pixel-for-pixel memory of all elements drawn in all previous steps.** When planning the coordinates for a new element, you must mentally project it onto the existing canvas and ensure it does not collide or overlap with anything that is already there. Leave at least 30-40 units of padding between distinct visual elements.
          - **CRITICAL: Each step is additive. The \`drawingPlan\` and \`annotations\` for a given step should ONLY contain the NEW elements you want to draw in that specific step. DO NOT repeat or redeclare elements from previous steps.** The application will handle rendering all previous steps automatically. Your job is to provide only the new additions for each frame of the animation.
          - **CRITICAL: AGGRESSIVE ZONING. When introducing a new, distinct section of the explanation, you MUST choose an 'origin' that is far away (e.g., at least 800-1000 units) from the bounding box of all previous drawings to ensure a clean separation.
          - **CRITICAL: CONTAINER PLANNING. If you need to draw a container (like a rectangle) around a set of elements, you MUST define the inner elements FIRST (in one or more steps). Then, in a subsequent step, you will draw the container. You must mentally calculate the total bounding box of those previously drawn inner elements and use that to determine the center, width, and height of the new container, ensuring at least 50 units of padding on all sides. The \`drawingPlan\` for the container step should ONLY contain the new container command.
          - **CRITICAL: Utilize Horizontal Space. Don't just stack everything vertically. If a process has multiple stages, lay them out from left-to-right across the canvas. If you are comparing two concepts, place one on the left half and one on the right half. Think of the canvas as a wide blackboard, not a narrow strip of paper.**
      5.  **Mental Review & ADAPTIVE PLACEMENT (FLEXIBILITY):** 
          - Before you output the final JSON, mentally review your entire layout. Your mental review is not just a check; it's a final design phase.
          - **If you predict that your planned element will be too close to or overlap with an existing element, you MUST be flexible. Slightly adjust the coordinates or dimensions of the NEW element you are drawing to create more space.** A clean, legible diagram is the top priority, even if it means deviating from perfect symmetry or your initial placement idea.
          - Does your final layout look like a diagram a professional illustrator would create, or is it a tangled mess? If it's a mess, you MUST start over and rethink your coordinates. A clean, spacious layout is more important than fitting everything into a small area.
      6.  **Style Guide (Inspired by Examples):** Your visual style should be inspired by high-quality technical diagrams. These diagrams use clean lines, logical flow (often left-to-right), and generous use of negative space. Your goal is to produce diagrams of this caliber—uncluttered, professional, and easy to follow.
      7.  **Think in Diagrams:** Use established visual patterns. For historical concepts, draw a timeline. For processes, use a flowchart with boxes and arrows. For networks or systems, use node-link diagrams.
      8.  **Granular & Interconnected Steps:**
          - Break down every concept into MANY small, sequential steps. Each step should cover just one or two sentences of spoken explanation and the corresponding new visual elements. This is crucial for smooth animation and learning.
          - **Build upon previous steps.** If a new step adds to an existing diagram, reuse the 'origin' coordinate from the previous step. Remember the **Spatial Awareness** rule: you must place your new elements carefully to avoid colliding with anything already drawn. Only change the 'origin' when starting a completely new diagram on a different part of the canvas.
          - Your final step should act as a summary or conclusion, reinforcing the main takeaway.
      9. **Clean & Simple Visuals:**
          - Use the \`drawingPlan\` to create visuals with primitive shapes (rectangles, circles, paths). Draw clean, straight lines unless a curve is necessary.
          - Use arrows generously via the \`arrow\` annotation type to connect ideas and guide the viewer's eye.

      **Output Format:**
      - Start with a friendly, high-level summary in the main 'explanation' field.
      - For the 'whiteboard', provide an array of many small, granular steps.
      - Respond with ONLY the JSON object, adhering strictly to the schema. Do not include any other text or markdown.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: planSchema,
      },
    });

    return robustJsonParse(response.text);

  } catch (e) {
    console.error("Error getting plan from Gemini:", e);
    let errorMessage = e instanceof Error ? e.message : String(e);
    if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('429')) {
         errorMessage = QUOTA_ERROR_MESSAGE;
    }
    throw new Error(`Failed to get plan: ${errorMessage}`);
  }
};

export const generateSpeech = async (text: string): Promise<string | null> => {
    if (!text.trim()) {
        return null;
    }
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: { parts: [{ text }] },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' }, // A friendly, clear voice
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            return base64Audio;
        }
        return null;
    } catch (e) {
        console.error("Error generating speech:", e);
        let errorMessage = e instanceof Error ? e.message : String(e);
        if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('429')) {
             errorMessage = QUOTA_ERROR_MESSAGE;
        }
        // Don't throw for speech, just return null so the app can continue visually
        console.error(`Failed to generate speech: ${errorMessage}`);
        return null;
    }
};
