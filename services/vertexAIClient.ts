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

interface StreamChunk {
  text?: string;
  error?: string;
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

  async *generateContentStream(params: GenerateContentParams): AsyncGenerator<StreamChunk, void, unknown> {
    const response = await fetch('/api/generate-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error('Failed to start streaming');
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remove 'data: ' prefix

            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed: StreamChunk = JSON.parse(data);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              yield parsed;
            } catch (e) {
              console.error('Failed to parse SSE message:', data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
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
