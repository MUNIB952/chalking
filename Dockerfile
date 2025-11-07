# Multi-stage Dockerfile for Google Cloud Run
# Stage 1: Build the Vite React app
# Stage 2: Run Node.js server with built files

# ========================================
# Stage 1: Build Stage
# ========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Accept build arguments
ARG VITE_GEMINI_API_KEY
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the Vite app (Vite will embed VITE_GEMINI_API_KEY)
RUN npm run build

# ========================================
# Stage 2: Production Stage
# ========================================
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy server file
COPY server.js .

# Expose port 8080 (Cloud Run standard)
EXPOSE 8080

# Set environment variable for port
ENV PORT=8080
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["node", "server.js"]
