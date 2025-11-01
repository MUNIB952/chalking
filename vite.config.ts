import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// Fix: Add fileURLToPath to resolve __dirname in ES module
import { fileURLToPath } from 'url';

// Fix: define __dirname for ES module scope
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // On Vercel, use process.env directly, otherwise use loadEnv
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
    const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || env.DEEPGRAM_API_KEY;

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.GEMINI_API_KEY': JSON.stringify(GEMINI_API_KEY),
        'process.env.DEEPGRAM_API_KEY': JSON.stringify(DEEPGRAM_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});