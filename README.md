<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# AI Drawing Assistant

An interactive web application that uses Google's Gemini AI to generate hand-drawn style illustrations based on natural language requests. The AI creates whiteboard-style explanations with voice narration to help visualize complex concepts.

View your app in AI Studio: https://ai.studio/apps/drive/182-RW2yB1E2FanCIu4SHuqW1Xjpdkqk3

## Features

- Interactive canvas with AI-generated drawings
- Natural language prompts for visual explanations
- Hand-drawn style illustrations using geometric primitives
- Voice narration for explanations
- Step-by-step visual demonstrations

## Tech Stack

- React 19.2 with TypeScript
- Vite for build tooling
- Google Gemini AI API
- HTML5 Canvas for drawings
- Web Audio API for narration

## Run Locally

**Prerequisites:** Node.js (v18 or higher recommended)

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd chalking
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env.local`:
     ```bash
     cp .env.example .env.local
     ```
   - Get your Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Add your API key to `.env.local`:
     ```
     GEMINI_API_KEY=your_actual_api_key_here
     ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Deploy to Vercel

### Option 1: Deploy via Vercel Dashboard

1. Push your code to GitHub
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "New Project"
4. Import your GitHub repository
5. Configure the project:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
6. Add Environment Variables:
   - Add `GEMINI_API_KEY` with your Gemini API key
7. Click "Deploy"

### Option 2: Deploy via Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel
   ```

4. Add environment variable (if not already set):
   ```bash
   vercel env add GEMINI_API_KEY
   ```
   Then paste your Gemini API key when prompted.

5. Deploy to production:
   ```bash
   vercel --prod
   ```

## Environment Variables

The following environment variables are required:

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Your Google Gemini API key from [AI Studio](https://aistudio.google.com/app/apikey) | Yes |

### Setting Environment Variables in Vercel

1. Go to your project in Vercel Dashboard
2. Navigate to Settings > Environment Variables
3. Add `GEMINI_API_KEY` with your API key value
4. Select which environments to apply it to (Production, Preview, Development)
5. Click "Save"

**Note:** After adding environment variables, you need to redeploy your application for the changes to take effect.

## Build for Production

```bash
npm run build
```

The production-ready files will be in the `dist` directory.

## Project Structure

```
chalking/
├── components/          # React components
│   ├── Canvas.tsx      # Main drawing canvas
│   ├── Controls.tsx    # User interface controls
│   └── icons.tsx       # Icon components
├── services/
│   └── geminiService.ts # Gemini AI integration
├── hooks/              # Custom React hooks
├── types.ts            # TypeScript type definitions
├── constants.ts        # App constants
├── App.tsx             # Main app component
├── index.tsx           # Entry point
└── vercel.json         # Vercel configuration

```

## License

This project is part of Google's AI Studio.

## Support

For issues or questions, please open an issue in the GitHub repository.
