# --- Stage 1: Build Frontend ---
FROM node:20 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Main Image ---
FROM mongo:6.0

# Install Node.js
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set up app directory
WORKDIR /app

# Copy and install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copy backend files
COPY backend/ ./backend/

# Copy built frontend assets to backend public folder
COPY --from=frontend-builder /app/frontend/dist ./backend/public/

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose backend port
EXPOSE 7890

# Define data directory for MongoDB
VOLUME ["/data/db"]

ENTRYPOINT ["./docker-entrypoint.sh"]
