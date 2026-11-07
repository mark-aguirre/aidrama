--liquibase formatted sql

-- PROPOSAL ONLY. NOT part of db/changelog and NOT applied anywhere.
-- Owner: database-engineer. The backend does not need this to run the MVP slice.
--
-- Why it is proposed: SCHEMA.md lists "refresh tokens or sessions" and "email verification tokens" as open
-- items with no table. The MVP backend therefore uses stateless signed tokens:
--   * refresh tokens cannot be revoked on logout or after theft (they live until expiry, 14 days, 30 days max session);
--   * email verification tokens are idempotent but cannot be revoked.
-- This table closes the refresh-token gap with rotation and reuse detection. It stores only a SHA-256 hash,
-- never the token. Expand-and-contract applies: add this, ship backend code that writes and checks it, then
-- stop accepting stateless refresh tokens in a later release.

--changeset aidrama:0010-refresh-tokens dbms:postgresql
CREATE TABLE refresh_tokens (
    id            uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id       uuid        NOT NULL,
    family_id     uuid        NOT NULL,            -- one login = one family; reuse of a rotated token revokes the family
    token_hash    char(64)    NOT NULL,            -- lowercase hex SHA-256 of the token
    issued_at     timestamptz NOT NULL DEFAULT now(),
    expires_at    timestamptz NOT NULL,
    session_start timestamptz NOT NULL,            -- original login time, caps total session age
    rotated_at    timestamptz,
    revoked_at    timestamptz,
    CONSTRAINT pk_refresh_tokens PRIMARY KEY (id),
    CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash),
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_refresh_tokens_hash CHECK (token_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX ix_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX ix_refresh_tokens_family ON refresh_tokens (family_id);
CREATE INDEX ix_refresh_tokens_expiry ON refresh_tokens (expires_at);

--rollback DROP TABLE refresh_tokens;
