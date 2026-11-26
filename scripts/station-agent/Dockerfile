FROM golang:1.24-bookworm AS test
WORKDIR /src
COPY go.mod *.go ./
RUN go test -race ./... && go vet ./...
FROM test AS build
ARG TARGETARCH=arm64
RUN CGO_ENABLED=0 GOOS=darwin GOARCH=$TARGETARCH go build -trimpath -o /station-agent .
FROM scratch AS binary
COPY --from=build /station-agent /station-agent
