CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE user_profiles (
    user_id         UUID PRIMARY KEY,
    display_name    VARCHAR(100),
    avatar_url      TEXT,
    preferences     JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE watchlist_items (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL,
    content_key VARCHAR(255) NOT NULL,
    title       VARCHAR(500),
    poster_url  TEXT,
    metadata    JSONB DEFAULT '{}',
    added_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, content_key)
);

CREATE TABLE watch_history (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL,
    content_key  VARCHAR(255) NOT NULL,
    title        VARCHAR(500),
    poster_url   TEXT,
    progress     DECIMAL(5,4) DEFAULT 0,
    "current_time" DECIMAL(10,2),
    duration     DECIMAL(10,2),
    metadata     JSONB DEFAULT '{}',
    watched_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, content_key)
);

CREATE INDEX idx_watchlist_user ON watchlist_items(user_id);
CREATE INDEX idx_history_user ON watch_history(user_id);
CREATE INDEX idx_history_watched ON watch_history(user_id, watched_at DESC);
