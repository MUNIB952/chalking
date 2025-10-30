# Build stage
FROM node:18-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy all source files
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM node:18-alpine

# Install serve to run the static files
RUN npm install -g serve

# Set working directory
WORKDIR /app

# Copy built files from build stage
COPY --from=build /app/dist ./dist

# Expose port (Cloud Run uses PORT env variable)
ENV PORT=8080
EXPOSE 8080

# Serve the built app
CMD serve -s dist -l $PORT
