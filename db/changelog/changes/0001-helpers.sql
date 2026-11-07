--liquibase formatted sql

--changeset aidrama:0001-helpers splitStatements:false dbms:postgresql
--preconditions onFail:HALT onError:HALT
--precondition-sql-check expectedResult:1 SELECT (current_setting('server_version_num')::int >= 150000)::int

-- Requires PostgreSQL 15 or newer (ON DELETE SET NULL with a column list, used in 0005).
-- gen_random_uuid() is built in since PostgreSQL 13, so no extension is needed.

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

--rollback DROP FUNCTION set_updated_at();
