# ---- Build stage ----
    FROM golang:1.25-alpine AS builder
    WORKDIR /app
    RUN apk add --no-cache git
    COPY go.mod go.sum ./
    RUN go mod download
    COPY . .
      
    # Install C toolchain for CGO
    RUN apk add --no-cache gcc musl-dev
    
    RUN CGO_ENABLED=1 \
        go build -o main .
    
    # ---- Runtime stage ----
    FROM alpine:latest
    WORKDIR /root/
    
    # Install runtime dependencies
    RUN apk add --no-cache ca-certificates curl bash docker-cli
    
    # Download musl-compatible mise for arm64 directly
    RUN curl -Lo /usr/local/bin/mise \
        https://github.com/jdx/mise/releases/download/v2026.3.17/mise-v2026.3.17-linux-arm64-musl && \
        chmod +x /usr/local/bin/mise && \
        mkdir -p /tmp/railpack/mise && \
        cp /usr/local/bin/mise /tmp/railpack/mise/mise-2026.3.17 && \
        chmod +x /tmp/railpack/mise/mise-2026.3.17
    
    # Install railpack via mise
    RUN mise install "github:railwayapp/railpack@latest" \
        && mise use -g "github:railwayapp/railpack@latest"
    
    # Railpack ends up in mise's shims dir — add it to PATH permanently
    ENV PATH="/root/.local/share/mise/shims:$PATH"
    
    # Copy Go binary
    COPY --from=builder /app/main ./main

    RUN touch brimble.db

    EXPOSE 3000

    CMD ["./main"]