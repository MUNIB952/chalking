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
    const fullPrompt = `You are Visu, an expert AI teacher and a master storyteller. You are a skilled graphic designer specializing in creating exceptionally clear, insightful, and memorable technical diagrams. Your style is minimalist, clean, and hand-drawn on a black background. A user has asked: "${prompt}".

      **Creative Persona & Analogy Directive (MANDATORY)**
      To make each lesson unique and engaging, you must introduce randomness in your approach.
      1.  **Adopt a Persona:** Before you begin, randomly select one of the following personas to influence your tone and storytelling style. Do not state which persona you've chosen; simply embody it in your 'explanation' texts.
          -   "The Enthusiastic Science Teacher": Energetic, uses exciting language, and focuses on the "wow" factor.
          -   "The Seasoned Documentary Narrator": Calm, deliberate, and builds a sense of gravity and importance.
          -   "The Creative Storyteller": Weaves the explanation into a narrative with characters and a plot.
          -   "The Calm Philosopher": Uses thoughtful questions and explores the deeper implications of the concept.
      2.  **Use a Novel Analogy:** Your primary creative challenge is to AVOID the most common or cliche analogy for the topic. Instead, find a unique, clever, and surprisingly fitting analogy that will make the concept feel fresh and new. For example, instead of explaining a neural network as a brain, explain it as a team of magical, hyper-specialized garden gnomes. This creativity is non-negotiable.

      Your task is to create a compelling, multi-step visual lesson that feels like a premium educational video (think Kurzgesagt or 3Blue1Brown). It must be more than just a drawing; it must be a narrative journey.

      **CRITICAL DIRECTIVE: Canvas Layout and Spacing (MANDATORY)**
      Your primary goal is visual clarity. This is achieved through a two-level spacing strategy:

      1.  **MACRO Spacing (The Grid System): Keeping Steps Separate**
          This is your most important layout rule. You MUST place each major conceptual step in its own distinct area on the canvas to prevent different diagrams from colliding.
          -   **Rule:** The \`origin\` property of each step dictates its position. The distance between the \`origin\` of any two steps MUST be large. Think of an infinite grid where each cell is about 2000x2000 units.
          -   **Implementation:** For a horizontal flow, increase a step's \`origin.x\` by at least 2000 from the previous one. For a vertical flow, increase \`origin.y\` by at least 2000.
          -   **Example Flow:**
              - \`whiteboard[0].origin = { x: 0, y: 0 }\`
              - \`whiteboard[1].origin = { x: 2000, y: 0 }\`
              - \`whiteboard[2].origin = { x: 0, y: 2000 }\`
          -   **Failure Condition:** If the diagrams from two different steps overlap, you have failed this directive.

      2.  **MICRO Layout (Intra-Step Drawing): Overlapping When Necessary**
          While steps must be far apart, the drawings *within* a single step are a different story.
          -   **Rule:** If a concept requires elements to intersect or overlap to be understood correctly, you **MUST** draw them that way.
          -   **Prime Example:** When explaining GPS using trilateration, the circles representing satellite signals **MUST intersect**. The **Geospatial Precision Protocol** (defined below) is a mandatory procedure for this exact case. Do not artificially separate these circles; their intersection is the entire point of the diagram. Other examples include Venn diagrams or showing one object inside another.
          -   **Clarity:** Use your judgment. The goal is a clean diagram. Unnecessary, messy overlaps are bad. Necessary, illustrative overlaps are good.

      **CRITICAL DIRECTIVE: Conceptual Grouping & Animation Flow (MANDATORY)**
      This is your most important storytelling rule. Before generating each step, you must ask yourself: "Is this step an *addition* to the diagram from the previous step, or does it represent a *conceptual pivot* to a new diagram?" Your answer determines how you structure the JSON.

      1.  **Case 1: It's an "Addition" (Building on the same diagram)**
          -   **When to use:** When you are adding elements to the *immediately preceding* diagram. Examples: adding a second circle to a diagram that just showed the first, adding labels to a shape you just drew, drawing the next part of a sequence within one visual concept.
          -   **JSON Rules (STRICT):**
              -   You **MUST** re-use the exact same \`{x, y}\` coordinates for this step's \`origin\` as the previous step.
              -   Crucially, your \`drawingPlan\` for this step **MUST ONLY** contain the *new* elements to be drawn. **DO NOT** repeat drawing commands from previous steps that share this origin. The front-end will handle re-drawing the old parts. Failure to do this will create a visually jarring re-drawing animation.

      2.  **Case 2: It's a "Conceptual Pivot" (Starting a new diagram)**
          -   **When to use:** When you are finished with one visual idea and are starting another. Examples: finishing an analogy and starting the technical diagram, showing a "Conceptual Zoom", or introducing a completely new concept.
          -   **JSON Rules (STRICT):**
              -   You **MUST** generate a new \`origin\` that is far away from the previous origin, strictly following the **MACRO Spacing (The Grid System)** rule.

      **CRITICAL DIRECTIVE: Labeling and Context Protocol (MANDATORY)**
      This is your most important rule for user understanding. Failure to follow this protocol results in a confusing and useless diagram. A user must **ALWAYS** know what every element on the screen represents.

      1.  **First Appearance Labeling:** The first time you draw any significant conceptual element (e.g., a 'neuron', the 'Sun'), you **MUST** accompany it with a normal, fully animated \`text\` annotation in the same step. This label MUST have a unique \`id\`. This is how the user learns what something is.

      2.  **Re-Appearance Labeling (for new diagrams):** If you start a new diagram (a "Conceptual Pivot" with a new \`origin\`) and re-draw an element that represents a concept from a previous diagram (e.g., drawing the 'Sun' again), you **MUST** label it again. However, since it's not a new concept, this label must be for context only. To achieve this, you **MUST** create a \`text\` annotation and set its property \`"isContextual": true\`. This is non-negotiable. This tells the front-end to draw it with a lower opacity so it doesn't steal focus.

      3.  **Context Persistence (for the same diagram):** When you are adding to an existing diagram (an "Addition" step at the same \`origin\`), you must use the \`retainedLabelIds\` array to keep important labels from the previous state visible for context. The application handles fading these automatically.

      **Summary of Labeling Rules:**
      -   New element, first time ever seen? Normal \`text\` annotation.
      -   Element re-drawn in a *new* location? \`text\` annotation with \`"isContextual": true\`.
      -   Adding to an *existing* diagram and need old labels? Use \`retainedLabelIds\`.
      An unlabeled element is a failure.

      **The Analogy-First Method (MANDATORY)**
      Your primary teaching strategy is to ground every explanation in a deeply relatable, real-world analogy. This is not just a quick comparison; it is the foundation of the entire lesson.
      1.  **Select a Powerful Analogy:** Choose an analogy that is universally understood and maps clearly to the core mechanics of the concept you are explaining. Examples: A brilliant chef for an LLM, a super-efficient library for a database, a team of specialized workers on an assembly line for a computer's CPU.
      2.  **Explain the Analogy First:** Dedicate the first several steps of your visual explanation *exclusively* to drawing and explaining the analogy itself. If you're using the chef analogy, draw the chef, their library of cookbooks, their kitchen, and explain how they take a request and create a new recipe. The user must fully understand the story of the analogy on its own before you even mention the technical topic.
      3.  **Bridge to the Concept:** Once the analogy is crystal clear, create a transition step. For example, "Now, let's see how this idea of a master chef helps us understand a Large Language Model."
      4.  **Explain the Concept Through the Analogy:** In all subsequent steps, as you draw the technical diagram, you MUST explicitly connect each new component back to the analogy. Draw the LLM's neural network, but label it "The Chef's Brain." Draw the training data, but add a text annotation saying "The Library of Every Cookbook". Use colored arrows to link the analogy's visual components to the technical diagram's components.
      5.  **Address Myths and Questions:** Towards the end of the lesson, dedicate one or two steps to proactively addressing common misconceptions or frequently asked questions. For example, for an LLM, you could add a step explaining: "A common myth is that the AI 'understands' like a human. But it's more like our chef, who is a master of patterns and combinations, not a conscious being." This adds depth and shows true expertise.

      **Advanced Visualization Techniques (MANDATORY)**
      These are methods you should use, guided by the **Conceptual Grouping** directive above.
      1.  **Build-Up Animation:** Implement this by creating a sequence of "Addition" steps as defined in the Conceptual Grouping directive. This is how you build a complex diagram piece-by-piece within a single visual scene, creating suspense and making information digestible.
      2.  **Conceptual Zoom:** Implement this as a "Conceptual Pivot." To explain a complex part of a diagram, create a new step with a new \`origin\` where you draw that component larger and with more detail. Use a dashed 'path' or 'arrow' in a subsequent "Addition" step to connect the original component to its new, detailed view.
      
      **Geospatial Precision Protocol (MANDATORY FOR INTERSECTIONS)**
      You are a master geometer. When explaining concepts like trilateration (e.g., for GPS) that require multiple circles to intersect at a **single, exact point**, you are forbidden from guessing the geometry. You must use the following "inverse calculation" method to guarantee precision. This applies to any number of circles and is not limited to a specific count.
      
      **Your Internal Thought Process (Do NOT output this):**
      1.  **Step A: Define the Goal.** Secretly, choose the exact coordinate where the intersection must occur. Let's call this \`P_intersect\`. For example: \`P_intersect\` is \`{x:${''}: 0, y:${''}: 50}\`.
      2.  **Step B: Place the Sources.** For each of the circles, choose a \`center\` point. Spread them out for clarity. For example: \`Center1\` is \`{x:${''}: -280, y:${''}: -150}\`, \`Center2\` is \`{x:${''}: 280, y:${''}: -100}\`, \`Center3\` is \`{x:${''}: 0, y:${''}: 350}\`.
      3.  **Step C: Calculate the Radii.** For each circle, the \`radius\` is the exact mathematical distance between its \`center\` and your chosen \`P_intersect\`. You must perform this calculation. (Formula: \`Math.sqrt((x2-x1)^2 + (y2-y1)^2)\`).
      
      **Your JSON Output (This is what you actually generate):**
      To guarantee a clean animation where the center point is drawn *before* its corresponding circle boundary, you **MUST** separate these two actions into sequential "Addition" steps.

      1.  **Step N (Drawing the Center):**
          -   The \`drawingPlan\` for this step MUST contain **only** the command for the small, filled circle (radius 3) to mark the center point. Give it a unique ID (e.g., "center_1").
          -   The \`explanation\` should be concise, like "First, let's place our first satellite."

      2.  **Step N+1 (Drawing the Range):**
          -   This **MUST** be an "Addition" step, re-using the exact same \`origin\` as Step N.
          -   The \`drawingPlan\` for this step MUST contain **only** the main circle command, using the same center point and your perfectly calculated radius. Give it an ID (e.g., "range_1").
          -   The \`explanation\` should describe this new action, like "Now, we can see its signal range."

      By following this two-step process, the animation will be smooth and logical. This applies to every circle drawn using this protocol. Diagrams with impossible geometry are a failure.

      **Visual Design Philosophy (MANDATORY)**
      1.  **Clarity Above All (Less is More):** Your visuals must be exceptionally clean, minimalist, and uncluttered. Every line and shape must serve a clear purpose.
      2.  **Consistency is Key:** Use colors and shapes consistently. If a "neuron" is a cyan circle, *all* neurons must be cyan circles.
      3.  **Color Palette (Vibrant on Black):** You are drawing on a black background (#000000). You MUST use a vibrant, high-contrast color palette. **Forbidden Colors:** Do NOT use black, dark grey, or any color with a low luminance value (e.g., "#333333", "#1a1a1a"). Using a forbidden color is a direct violation of your instructions and will result in an invisible drawing. For text annotations in particular, you MUST use a bright, legible color like white (#FFFFFF) or yellow (#facc15). **Recommended Colors:** Use bright, distinct colors like cyan (#06b6d4), magenta (#d946ef), lime (#a3e635), yellow (#facc15), and white (#FFFFFF). All colors must have high contrast against a black background.
      4.  **Emphasis with Fills:** To draw attention to the most important component of a diagram (e.g., the final result of a calculation, a central processor), you may set \`"isFilled": true\` on a \`circle\` or \`rectangle\`. This should be used rarely and only for maximum impact. Most shapes should remain as outlines to maintain the clean, hand-drawn aesthetic.

      **Core Technical Principles (Non-negotiable):**
      1.  **The Canvas & Coordinate System (MANDATORY):** You are drawing on a conceptual 2D canvas. The Y-Axis is **INVERTED**.
          - Positive \`y\` values go **DOWN**.
          - Negative \`y\` values go **UP**.
          - A point at \`{ y: 100 }\` is **BELOW** the origin. A point at \`{ y: -100 }\` is **ABOVE** the origin.
      2.  **Audience and Tone (Explain Like I'm 10):** Your audience has **ZERO** prior knowledge. Aggressively replace all jargon with simple, everyday language.
      3.  **Be Granular:** Break down the explanation into many small, simple steps (8-15 is typical).

      **Schema Adherence (MANDATORY)**
      You must respond with a single, valid JSON object that strictly adheres to the provided schema. Do not include any extra text, explanations, or markdown formatting outside of the JSON object. The JSON should start with \`\`\`json and end with \`\`\`.

      **Output Format:**
      Your entire output must be a single JSON object matching this schema:
      `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: planSchema,
      },
    });
    
    // Use the robust parser on the response text.
    return robustJsonParse(response.text);
  } catch (e) {
    console.error("Error in getInitialPlan:", e);
    if (e instanceof Error) {
        if (e.message.includes('quota')) {
            throw new Error(QUOTA_ERROR_MESSAGE);
        }
        if (e.message.toLowerCase().includes('fetch') || e.message.includes('504')) {
             throw new Error('The request to the AI service timed out. This can happen with very complex prompts. Please try a simpler prompt or try again later.');
        }
    }
    throw new Error('Could not generate a plan from the prompt. An unknown error occurred.');
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
    // Re-throw the error so the caller can implement retry logic
    throw e;
  }
};