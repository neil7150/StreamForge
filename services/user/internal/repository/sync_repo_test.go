package repository

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"streamforge/services/user/internal/model"
	"strings"
	"testing"
)

type testDB struct{ tx *testTx }

func (d testDB) Begin(context.Context) (pgx.Tx, error) { return d.tx, nil }

type testTx struct {
	pgx.Tx
	revision         int64
	queries          []string
	commit, rollback bool
	failInsert       bool
}
type revisionRow int64

func (r revisionRow) Scan(dest ...any) error { *(dest[0].(*int64)) = int64(r); return nil }
func (t *testTx) QueryRow(_ context.Context, query string, _ ...any) pgx.Row {
	t.queries = append(t.queries, query)
	return revisionRow(t.revision)
}
func (t *testTx) Exec(_ context.Context, query string, _ ...any) (pgconn.CommandTag, error) {
	t.queries = append(t.queries, query)
	if t.failInsert && strings.Contains(query, "INSERT INTO watchlist_items") {
		return pgconn.CommandTag{}, errors.New("disk failure")
	}
	return pgconn.NewCommandTag("OK"), nil
}
func (t *testTx) Commit(context.Context) error   { t.commit = true; return nil }
func (t *testTx) Rollback(context.Context) error { t.rollback = true; return nil }

func TestStaleSyncNeverDeletesItems(t *testing.T) {
	tx := &testTx{revision: 8}
	repo := NewSyncRepository(testDB{tx})
	revision, err := repo.UpsertWatchlist(context.Background(), uuid.New(), nil, 7)
	if !errors.Is(err, ErrSyncConflict) || revision != 8 || tx.commit || !tx.rollback {
		t.Fatalf("bad conflict result: %d %v %+v", revision, err, tx)
	}
	for _, q := range tx.queries {
		if strings.Contains(q, "DELETE FROM") || strings.Contains(q, "UPDATE library") {
			t.Fatal("stale snapshot mutated library")
		}
	}
	if !strings.Contains(tx.queries[len(tx.queries)-1], "FOR UPDATE") {
		t.Fatal("revision must be locked")
	}
}
func TestSuccessfulSyncAdvancesRevisionAndFailedInsertRollsBack(t *testing.T) {
	for _, fail := range []bool{false, true} {
		tx := &testTx{revision: 2, failInsert: fail}
		repo := NewSyncRepository(testDB{tx})
		revision, err := repo.UpsertWatchlist(context.Background(), uuid.New(), []model.WatchlistItem{{ContentKey: "one"}}, 2)
		if fail {
			if err == nil || tx.commit || !tx.rollback {
				t.Fatal("failed replacement did not roll back")
			}
		} else if err != nil || revision != 3 || !tx.commit {
			t.Fatalf("failed sync: %d %v", revision, err)
		}
	}
}
