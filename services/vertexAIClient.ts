/**
 * Vertex AI Client Wrapper
 *
 * This wraps calls to /api/generate endpoint (server-side Vertex AI)
 * Provides same interface as @google/genai but runs securely on server
 */

interface GenerateContentParams {
  model: string;
  contents: any;
  config?: any;
}

interface GenerateContentResponse {
  text: string;
  candidates?: any[];
}

class VertexAIModels {
  async generateContent(params: GenerateContentParams): Promise<GenerateContentResponse> {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Failed to generate content');
    }

    return await response.json();
  }
}

class VertexAIClient {
  models: VertexAIModels;

  constructor() {
    this.models = new VertexAIModels();
  }
}

// Export singleton instance
export const vertexAI = new VertexAIClient();
