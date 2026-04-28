# syntax=docker/dockerfile:1.7

# --- build ---
  FROM node:22-alpine AS build
  WORKDIR /app
  
  COPY package*.json ./
  COPY pnpm-lock.yaml* ./
  COPY tsconfig*.json ./
  
  RUN npm install -g pnpm
  RUN pnpm install
  
  COPY . .
  
  RUN npm run build
  
  # --- runtime (preview) ---
  FROM node:22-alpine
  
  WORKDIR /app
  
  # install pnpm again (needed to run preview script)
  RUN npm install -g pnpm
  
  # copy only what's needed
  COPY --from=build /app ./
  
  EXPOSE 4173
  
  CMD ["pnpm", "preview", "--host", "0.0.0.0"]