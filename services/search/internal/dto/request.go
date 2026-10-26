package dto

import "strings"

type SearchQuery struct {
	Q       string `query:"q"`
	Type    string `query:"type"` // "movie", "show", "all"
	Page    int    `query:"page"`
	PerPage int    `query:"per_page"`
}

func (q *SearchQuery) Normalize() {
	q.Q = strings.TrimSpace(q.Q)
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PerPage < 1 || q.PerPage > 50 {
		q.PerPage = 20
	}
	switch q.Type {
	case "movie", "show": // valid
	default:
		q.Type = "all"
	}
}
