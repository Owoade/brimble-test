# ---- Build stage ----
    FROM golang:1.25-alpine AS builder

    WORKDIR /app
    
    RUN apk add --no-cache git
    
    COPY go.mod go.sum ./
    RUN go mod download
    
    COPY . .
    
    RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
        go build -o main .
    
    # ---- Runtime stage ----
    FROM alpine:latest
    
    WORKDIR /root/
    
    # Install runtime dependencies
    RUN apk add --no-cache ca-certificates curl bash docker-cli
    
    # Install railpack
   # Install mise to a known location, then use it to install railpack
    RUN curl -fsSL https://mise.run | MISE_INSTALL_PATH=/usr/local/bin/mise sh \
    && mise install "github:railwayapp/railpack@latest" \
    && mise use -g "github:railwayapp/railpack@latest"

    # Railpack ends up in mise's shims dir — add it to PATH permanently
    ENV PATH="/root/.local/share/mise/shims:$PATH"
    
    # Copy Go binary
    COPY --from=builder /app/main .
    
    EXPOSE 3000
    
    CMD ["./main"]