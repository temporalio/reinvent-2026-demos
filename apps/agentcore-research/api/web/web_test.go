package web

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBoothFrameAndTheme(t *testing.T) {
	rec := httptest.NewRecorder()
	Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if !strings.Contains(rec.Header().Get("Content-Security-Policy"), "frame-ancestors 'self'") {
		t.Fatal("booth must permit same-origin framing")
	}
	for _, asset := range []string{"cosmic-pop-theme.css", "booth.css", "note-keyboard.js"} {
		if !strings.Contains(rec.Body.String(), asset) {
			t.Fatalf("missing booth asset %s", asset)
		}
	}
}
