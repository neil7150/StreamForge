CREATE TABLE library_sync_revisions (
    user_id UUID NOT NULL,
    collection TEXT NOT NULL CHECK (collection IN ('watchlist', 'history')),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    PRIMARY KEY (user_id, collection)
);
