-- Content Service: Full content catalog schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Genres
CREATE TABLE genres (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Movies
CREATE TABLE movies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(500) NOT NULL,
    slug            VARCHAR(500) NOT NULL UNIQUE,
    overview        TEXT,
    tagline         VARCHAR(500),
    release_date    DATE,
    runtime_minutes INTEGER,
    language        VARCHAR(10) DEFAULT 'en',
    poster_url      TEXT,
    backdrop_url    TEXT,
    trailer_url     TEXT,
    imdb_id         VARCHAR(20),
    content_rating  VARCHAR(10),
    license_type    VARCHAR(50) NOT NULL DEFAULT 'public_domain',
    license_url     TEXT,
    status          VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending_review')),
    avg_rating      DECIMAL(3,2) DEFAULT 0,
    rating_count    INTEGER DEFAULT 0,
    view_count      BIGINT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE movie_genres (
    movie_id    UUID REFERENCES movies(id) ON DELETE CASCADE,
    genre_id    UUID REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (movie_id, genre_id)
);

-- Shows
CREATE TABLE shows (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(500) NOT NULL,
    slug            VARCHAR(500) NOT NULL UNIQUE,
    overview        TEXT,
    first_air_date  DATE,
    last_air_date   DATE,
    language        VARCHAR(10) DEFAULT 'en',
    poster_url      TEXT,
    backdrop_url    TEXT,
    season_count    INTEGER DEFAULT 0,
    episode_count   INTEGER DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'ongoing' CHECK (status IN ('ongoing', 'ended', 'cancelled', 'pending_review')),
    license_type    VARCHAR(50) NOT NULL DEFAULT 'public_domain',
    license_url     TEXT,
    avg_rating      DECIMAL(3,2) DEFAULT 0,
    rating_count    INTEGER DEFAULT 0,
    view_count      BIGINT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE show_genres (
    show_id     UUID REFERENCES shows(id) ON DELETE CASCADE,
    genre_id    UUID REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (show_id, genre_id)
);

-- Seasons
CREATE TABLE seasons (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    show_id         UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    season_number   INTEGER NOT NULL,
    title           VARCHAR(500),
    overview        TEXT,
    poster_url      TEXT,
    air_date        DATE,
    episode_count   INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(show_id, season_number)
);

-- Episodes
CREATE TABLE episodes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    show_id         UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    season_id       UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    episode_number  INTEGER NOT NULL,
    title           VARCHAR(500) NOT NULL,
    overview        TEXT,
    runtime_minutes INTEGER,
    air_date        DATE,
    still_url       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(season_id, episode_number)
);

-- Magnet Links
CREATE TABLE magnet_links (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_type    VARCHAR(10) NOT NULL CHECK (content_type IN ('movie', 'episode')),
    content_id      UUID NOT NULL,
    magnet_uri      TEXT NOT NULL,
    info_hash       VARCHAR(64) NOT NULL,
    quality         VARCHAR(20) NOT NULL,
    codec           VARCHAR(20),
    file_size_bytes BIGINT,
    seed_count      INTEGER DEFAULT 0,
    peer_count      INTEGER DEFAULT 0,
    verified        BOOLEAN DEFAULT FALSE,
    source          VARCHAR(255),
    last_checked_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(info_hash, quality)
);

-- Subtitles
CREATE TABLE subtitles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_type    VARCHAR(10) NOT NULL CHECK (content_type IN ('movie', 'episode')),
    content_id      UUID NOT NULL,
    language        VARCHAR(10) NOT NULL,
    language_name   VARCHAR(100) NOT NULL,
    subtitle_url    TEXT NOT NULL,
    format          VARCHAR(10) DEFAULT 'srt',
    is_default      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_movies_slug ON movies(slug);
CREATE INDEX idx_movies_release ON movies(release_date DESC);
CREATE INDEX idx_movies_rating ON movies(avg_rating DESC);
CREATE INDEX idx_movies_views ON movies(view_count DESC);
CREATE INDEX idx_shows_slug ON shows(slug);
CREATE INDEX idx_episodes_show ON episodes(show_id);
CREATE INDEX idx_episodes_season ON episodes(season_id);
CREATE INDEX idx_magnet_content ON magnet_links(content_type, content_id);
CREATE INDEX idx_magnet_hash ON magnet_links(info_hash);
CREATE INDEX idx_subtitles_content ON subtitles(content_type, content_id);

-- Full-text search indexes
CREATE INDEX idx_movies_fts ON movies USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(overview, ''))
);
CREATE INDEX idx_shows_fts ON shows USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(overview, ''))
);

-- Seed genres
INSERT INTO genres (name, slug) VALUES
    ('Action', 'action'),
    ('Adventure', 'adventure'),
    ('Animation', 'animation'),
    ('Comedy', 'comedy'),
    ('Crime', 'crime'),
    ('Documentary', 'documentary'),
    ('Drama', 'drama'),
    ('Family', 'family'),
    ('Fantasy', 'fantasy'),
    ('History', 'history'),
    ('Horror', 'horror'),
    ('Music', 'music'),
    ('Mystery', 'mystery'),
    ('Romance', 'romance'),
    ('Science Fiction', 'science-fiction'),
    ('Thriller', 'thriller'),
    ('War', 'war'),
    ('Western', 'western');
