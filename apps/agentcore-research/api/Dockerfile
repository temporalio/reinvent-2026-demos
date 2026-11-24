# golang 1.27.4 and distroless static-debian13:nonroot, digests checked on their
# registries 2026-11-23 (docker buildx imagetools inspect).
FROM golang:1.27.4-trixie@sha256:f18c3d73a184fb0582828510722e723b63a93f7188d11dd223d9be6f6880e65d AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api && \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/local-invoker ./cmd/local-invoker

FROM build AS test
CMD ["sh", "-c", "go vet ./... && test -z \"$(gofmt -l .)\" && go test -race -count=1 ./..."]

FROM gcr.io/distroless/static-debian13:nonroot@sha256:8ce6dd87e9823c5b48dcfb2c8604714ccb351ce59607327bcc4957448da279b5 AS local-invoker
COPY --from=build /out/local-invoker /local-invoker
ENTRYPOINT ["/local-invoker"]

# Last, so a plain `docker build` produces the API image the platform deploys.
FROM gcr.io/distroless/static-debian13:nonroot@sha256:8ce6dd87e9823c5b48dcfb2c8604714ccb351ce59607327bcc4957448da279b5 AS api
COPY --from=build /out/api /api
EXPOSE 8080
ENTRYPOINT ["/api"]
