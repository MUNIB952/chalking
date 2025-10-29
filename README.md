<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# AI Drawing Assistant

This contains everything you need to run and deploy your AI Drawing Assistant application.

View your app in AI Studio: https://ai.studio/apps/drive/182-RW2yB1E2FanCIu4SHuqW1Xjpdkqk3

## Development

**Prerequisites:**  Node.js

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Set up environment variables:**
    Create a file named `.env` in the root of the project and add your Gemini API key:
    ```
    GEMINI_API_KEY=YOUR_API_KEY_HERE
    ```
3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    This will start the app on `http://localhost:3000`.

## Deployment

To deploy your application, you need to create a production-ready build.

1.  **Build the application:**
    ```bash
    npm run build
    ```
2.  **Preview the build (optional):**
    ```bash
    npm run preview
    ```
3.  **Deploy:**
    The build command creates a `dist` folder in your project root. This folder contains the optimized, static HTML, CSS, and JavaScript files for your application. Deploy the contents of this `dist` folder to your hosting provider (e.g., Vercel, Netlify, Google Cloud).
