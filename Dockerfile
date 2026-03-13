# Use Node.js 20 slim as the base image for a smaller footprint
FROM node:20-slim

# Install Python 3 and other dependencies for yt-dlp
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp using pip
RUN python3 -m pip install --no-cache-dir yt-dlp --break-system-packages

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the frontend
RUN npm run build

# Expose the port the server listens on
EXPOSE 8080

# Environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Command to start the production server
CMD ["node", "server.js"]
