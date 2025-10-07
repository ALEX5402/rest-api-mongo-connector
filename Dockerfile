# syntax=docker/dockerfile:1

# Pass your local Node.js version (detected: 24.8.0) as build arg for flexibility
ARG NODE_VERSION=24.8.0

# ---------- Base image ----------
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app

# Install production OS deps if needed later
RUN apk add --no-cache tini

# ---------- Dependencies layer ----------
FROM base AS deps
# Copy only package manifests for better caching
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ---------- Runtime image ----------
FROM base AS runtime
ENV NODE_ENV=production

# Copy node_modules from deps and app source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure env file can be provided at runtime; using env.example for doc only
# Expose configured port (default 3000)
ENV PORT=3000
EXPOSE 3000

# Use tini as init to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start the app
CMD ["node", "src/index.js"]
