package migrations

import "embed"

// Files embeds the unchanged SQL migrations for portable API deployments.
//go:embed *.sql
var Files embed.FS
