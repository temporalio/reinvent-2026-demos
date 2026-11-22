# Native local worker for UI/workflow rehearsal. This does not emulate Lambda.
FROM golang:1.27-alpine AS builder
WORKDIR /build
COPY shared/ ../shared/
COPY demo-app/ ./
RUN go build -o /out/demo-app . && go build -o /out/local-worker ./localworker
FROM alpine:3.22
WORKDIR /app
COPY --from=builder /out/ ./
EXPOSE 8080
ENTRYPOINT ["/app/demo-app"]
