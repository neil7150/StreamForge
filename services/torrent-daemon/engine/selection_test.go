package engine

import "testing"

func TestCancellationBeforeNativeRegistration(t *testing.T) {
	engine := &TorrentEngine{}
	engine.CancelSession("cancelled-before-prepare")
	if _, err := engine.PrepareSession("cancelled-before-prepare", "invalid", -1, 0, 0); err == nil || err.Error() != "playback request cancelled" {
		t.Fatalf("early cancellation was lost: %v", err)
	}
}

func TestChooseFile(t *testing.T) {
	files := []FileInfo{
		{Name: "readme.txt", Path: "readme.txt", Size: 999999},
		{Name: "Show.S01E01.mkv", Path: "Show.S01E01.mkv"},
		{Name: "Show.S01E02.mkv", Path: "Show.S01E02.mkv"},
		{Name: "sample.mp4", Path: "sample.mp4"},
	}
	for _, tc := range []struct {
		name                             string
		requested, season, episode, want int
		fail                             bool
	}{
		{"ambiguous movie pack", -1, 0, 0, -1, false},
		{"exact episode", -1, 1, 2, 2, false},
		{"missing episode asks", -1, 1, 3, -1, false},
		{"explicit selection", 1, 1, 2, 1, false},
		{"nonvideo rejected", 0, 0, 0, -1, true},
		{"out of range rejected", 8, 0, 0, -1, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := chooseFile(files, tc.requested, tc.season, tc.episode)
			if got != tc.want || (err != nil) != tc.fail {
				t.Fatalf("got %d, %v", got, err)
			}
		})
	}
	one := []FileInfo{{Name: "sample.mp4"}, {Name: "movie.mp4"}, {Name: "poster.jpg"}}
	if got, err := chooseFile(one, -1, 0, 0); got != 1 || err != nil {
		t.Fatalf("single movie: %d %v", got, err)
	}
	if got, _ := chooseFile([]FileInfo{{Name: "Show.S01E020.mkv", Path: "Show.S01E020.mkv"}}, -1, 1, 2); got != -1 {
		t.Fatal("episode 2 matched episode 20")
	}
}
