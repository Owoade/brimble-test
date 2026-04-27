# Use official Node.js runtime as base image

FROM node:20-alpine

# Set working directory inside container

WORKDIR /app

COPY . .

# Expose the port your server runs on

EXPOSE 3000

# Start the app

CMD ["node", "index.js"]