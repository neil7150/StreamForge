package mobile

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/streamforge/services/torrent-daemon/engine"
)

func TestStoppedEngineReturnsAnActionableStatisticsError(t *testing.T) {
	if result := GetStats("old-session"); !strings.HasPrefix(result, "ERROR:") || !strings.Contains(result, "retry") {
		t.Fatalf("stopped engine was silently represented as valid statistics: %q", result)
	}
}

func TestSessionJSONRequiresSuccessfulSelectionBeforeExposingStream(t *testing.T) {
	info := &engine.SessionInfo{SessionID: "attempt-1", Token: "secret", RequiresFileSelection: true}
	var decoded map[string]any
	if err := json.Unmarshal([]byte(sessionJSON(info, nil, 8888)), &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded["streamURL"] != "" {
		t.Fatal("unselected session exposed a media URL")
	}
	for _, key := range []string{"Token", "token"} {
		if _, present := decoded[key]; present {
			t.Fatal("internal token field was serialized")
		}
	}
	info.Ready = true
	if err := json.Unmarshal([]byte(sessionJSON(info, nil, 8888)), &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded["streamURL"] != "http://127.0.0.1:8888/stream/attempt-1?token=secret" {
		t.Fatal("selected stream URL is incorrect")
	}
	if result := sessionJSON(nil, errors.New("metadata failed"), 8888); result != "ERROR: metadata failed" {
		t.Fatal(result)
	}
}
