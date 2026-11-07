--liquibase formatted sql

--changeset aidrama:0003-series-seasons dbms:postgresql
-- Routing namespace for series slugs is /series/{slug}. Slug is unique across all rows, including
-- soft-deleted ones, so a shared link can never later resolve to different content.
-- UNIQUE (id, creator_id) and UNIQUE (id, series_id) exist only as targets for composite foreign keys
-- that stop a video pointing at another creator's series or at a season of a different series.

CREATE TABLE drama_series (
    id                 uuid          NOT NULL DEFAULT gen_random_uuid(),
    creator_id         uuid          NOT NULL,
    title              varchar(200)  NOT NULL,
    slug               varchar(120)  NOT NULL,
    description        varchar(5000) NOT NULL DEFAULT '',
    poster_url         varchar(2048),
    genre              varchar(40),
    language           varchar(35)   NOT NULL DEFAULT 'en',
    visibility         varchar(20)   NOT NULL DEFAULT 'PRIVATE',
    publication_status varchar(20)   NOT NULL DEFAULT 'DRAFT',
    published_at       timestamptz,
    version            bigint        NOT NULL DEFAULT 0,
    created_at         timestamptz   NOT NULL DEFAULT now(),
    updated_at         timestamptz   NOT NULL DEFAULT now(),
    deleted_at         timestamptz,
    CONSTRAINT pk_drama_series PRIMARY KEY (id),
    CONSTRAINT uq_drama_series_slug UNIQUE (slug),
    CONSTRAINT uq_drama_series_id_creator UNIQUE (id, creator_id),
    CONSTRAINT fk_drama_series_creator FOREIGN KEY (creator_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_drama_series_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT ck_drama_series_title CHECK (title = btrim(title) AND title <> ''),
    CONSTRAINT ck_drama_series_genre CHECK (genre IS NULL OR (genre = btrim(genre) AND genre <> '')),
    CONSTRAINT ck_drama_series_visibility CHECK (visibility IN ('PUBLIC', 'UNLISTED', 'PRIVATE')),
    CONSTRAINT ck_drama_series_publication_status CHECK (publication_status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'REMOVED')),
    CONSTRAINT ck_drama_series_published_has_timestamp CHECK (publication_status <> 'PUBLISHED' OR published_at IS NOT NULL),
    CONSTRAINT ck_drama_series_published_has_genre CHECK (publication_status <> 'PUBLISHED' OR genre IS NOT NULL)
);

CREATE TRIGGER trg_drama_series_set_updated_at BEFORE UPDATE ON drama_series
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Creator dashboard: own series, newest first.
CREATE INDEX ix_drama_series_creator_recent ON drama_series (creator_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
-- Public discovery: published and public, newest first, optionally by genre.
CREATE INDEX ix_drama_series_public_recent ON drama_series (published_at DESC, id DESC)
    WHERE publication_status = 'PUBLISHED' AND visibility = 'PUBLIC' AND deleted_at IS NULL;
CREATE INDEX ix_drama_series_public_genre ON drama_series (genre, published_at DESC, id DESC)
    WHERE publication_status = 'PUBLISHED' AND visibility = 'PUBLIC' AND deleted_at IS NULL;

CREATE TABLE drama_seasons (
    id            uuid          NOT NULL DEFAULT gen_random_uuid(),
    series_id     uuid          NOT NULL,
    season_number integer       NOT NULL,
    title         varchar(200),
    description   varchar(5000) NOT NULL DEFAULT '',
    version       bigint        NOT NULL DEFAULT 0,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    deleted_at    timestamptz,
    CONSTRAINT pk_drama_seasons PRIMARY KEY (id),
    CONSTRAINT uq_drama_seasons_id_series UNIQUE (id, series_id),
    CONSTRAINT fk_drama_seasons_series FOREIGN KEY (series_id) REFERENCES drama_series (id) ON DELETE RESTRICT,
    CONSTRAINT ck_drama_seasons_number CHECK (season_number > 0),
    CONSTRAINT ck_drama_seasons_title CHECK (title IS NULL OR (title = btrim(title) AND title <> ''))
);

CREATE TRIGGER trg_drama_seasons_set_updated_at BEFORE UPDATE ON drama_seasons
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Season number is unique per series among live seasons. Also serves "seasons of a series".
CREATE UNIQUE INDEX uq_drama_seasons_series_number_live ON drama_seasons (series_id, season_number)
    WHERE deleted_at IS NULL;

--rollback DROP TABLE drama_seasons;
--rollback DROP TABLE drama_series;
