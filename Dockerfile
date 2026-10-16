# ─── Base ───────────────────────────────────────────────
FROM node:20-alpine

# Small quality-of-life: tini handles signals so Ctrl+C / docker stop
# propagate cleanly to node. Without it, zombie processes can linger.
RUN apk add --no-cache tini

WORKDIR /app

# ─── Install deps first (better layer caching) ──────────
# Copy only manifests first so `npm ci` re-runs only when deps change.
COPY package.json ./
COPY package-lock.json* ./

# npm ci = clean install from lockfile (reproducible).
# If no lockfile is present yet, fall back to npm install.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# ─── Copy source ────────────────────────────────────────
COPY src ./src

# ─── Runtime config ─────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run as non-root for safety
USER node

# tini as PID 1 → forwards signals to node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]