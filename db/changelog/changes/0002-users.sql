--liquibase formatted sql

--changeset aidrama:0002-users dbms:postgresql
-- Identity tables. Soft delete (deleted_at) on users only. Profile and roles share the user lifecycle.
-- email and username are stored normalized (lowercase) so plain UNIQUE constraints are case-safe.
-- Uniqueness covers soft-deleted rows too, so a deleted account name cannot be taken over.

CREATE TABLE users (
    id                uuid         NOT NULL DEFAULT gen_random_uuid(),
    email             varchar(254) NOT NULL,
    username          varchar(30)  NOT NULL,
    password_hash     varchar(255) NOT NULL,
    email_verified_at timestamptz,
    account_status    varchar(20)  NOT NULL DEFAULT 'ACTIVE',
    version           bigint       NOT NULL DEFAULT 0,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT ck_users_email_format CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+$'),
    CONSTRAINT ck_users_username_format CHECK (username ~ '^[a-z0-9_]{3,30}$'),
    CONSTRAINT ck_users_account_status CHECK (account_status IN ('ACTIVE', 'DEACTIVATED', 'SUSPENDED'))
);

CREATE TRIGGER trg_users_set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_profiles (
    user_id        uuid         NOT NULL,
    display_name   varchar(50)  NOT NULL,
    bio            varchar(500) NOT NULL DEFAULT '',
    avatar_url     varchar(2048),
    follower_count bigint       NOT NULL DEFAULT 0,
    version        bigint       NOT NULL DEFAULT 0,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_user_profiles PRIMARY KEY (user_id),
    CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_user_profiles_display_name CHECK (display_name = btrim(display_name) AND display_name <> ''),
    CONSTRAINT ck_user_profiles_follower_count CHECK (follower_count >= 0)
);

CREATE TRIGGER trg_user_profiles_set_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_roles (
    id         uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL,
    role       varchar(20) NOT NULL,
    granted_by uuid,
    granted_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_user_roles PRIMARY KEY (id),
    CONSTRAINT uq_user_roles_user_role UNIQUE (user_id, role),
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_granted_by FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT ck_user_roles_role CHECK (role IN ('USER', 'CREATOR', 'MODERATOR', 'ADMIN'))
);

--rollback DROP TABLE user_roles;
--rollback DROP TABLE user_profiles;
--rollback DROP TABLE users;
