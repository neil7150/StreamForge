package engine

import (
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

type FileInfo struct {
	Index int    `json:"index"`
	Name  string `json:"name"`
	Path  string `json:"path"`
	Size  int64  `json:"size"`
	Type  string `json:"type"`
}

func isVideo(name string) bool {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".mp4", ".mkv", ".webm", ".m4v", ".mov", ".avi", ".ts":
		return true
	}
	return false
}

// Return -1 for an ambiguous pack. Never silently choose the largest unrelated file.
func chooseFile(files []FileInfo, requested, season, episode int) (int, error) {
	if requested >= 0 {
		if requested >= len(files) || !isVideo(files[requested].Name) {
			return -1, errors.New("selected file is not a supported video")
		}
		return requested, nil
	}
	var candidates []int
	for index, file := range files {
		lower := strings.ToLower(file.Name)
		if isVideo(file.Name) && !strings.Contains(lower, "sample") && !strings.Contains(lower, "trailer") {
			candidates = append(candidates, index)
		}
	}
	if len(candidates) == 0 {
		return -1, errors.New("torrent contains no supported video files")
	}
	if episode > 0 {
		pattern := regexp.MustCompile(fmt.Sprintf(`(?i)(?:^|[^a-z0-9])(?:s0*%de0*%d|0*%dx0*%d)(?:[^0-9]|$)`, season, episode, season, episode))
		var matches []int
		for _, index := range candidates {
			if pattern.MatchString(files[index].Path) {
				matches = append(matches, index)
			}
		}
		if len(matches) == 1 {
			return matches[0], nil
		}
		return -1, nil
	}
	if len(candidates) == 1 {
		return candidates[0], nil
	}
	return -1, nil
}
