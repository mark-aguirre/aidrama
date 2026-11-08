# AI Drama backend (MVP thin slice)

Spring Boot REST API for the slice **signup, upload, process, watch**. It is not the full 8-module platform.
Contract for the frontend: [`docs/API-CONTRACT.md`](docs/API-CONTRACT.md). Schema contract: [`../db/SCHEMA.md`](../db/SCHEMA.md).

| Item | Value |
|---|---|
| Build tool | Maven 3.9 (no wrapper; use an installed Maven) |
| Java | 21 |
| Framework | Spring Boot 4.1.2 (Spring Framework 7, Hibernate 7, Spring Security 7, Jackson 3). Boot 3.5 left OSS support on 2026-06-30 |
| Persistence | Spring Data JPA on PostgreSQL 15+. Schema owned by Liquibase in `../db/changelog`. The app only validates it (`ddl-auto=validate`) |
| Base path | `/api/v1` on port 8080 |
| Object storage | S3-compatible (AWS SDK v2). Direct browser upload with a presigned `PUT` |

## Run it

1. Create the database and apply the migrations (needs Docker). The password comes from the environment only:

   ```powershell
   $env:PGPASSWORD = Read-Host "postgres password"
   powershell -NoProfile -ExecutionPolicy Bypass -File backend\scripts\db-init.ps1            # 192.168.100.46:5432, user postgres
   powershell -NoProfile -ExecutionPolicy Bypass -File backend\scripts\db-init.ps1 -PreviewOnly   # SQL review, changes nothing
   ```

   The script runs `CREATE DATABASE aidrama` only when it does not exist, then `liquibase update` with the
   unmodified changelog (`liquibase/liquibase:4.33.0`, the version the DB engineer verified). It never drops anything and
   never touches another database. Use `-DbHost`, `-Port`, `-User` for another server.

2. Configure: `copy backend\.env.example backend\.env` and fill it in. `.env` is gitignored.
3. Start: `powershell -NoProfile -File backend\scripts\run-local.ps1` (loads `.env`, runs `mvn spring-boot:run`), or build a jar with
   `mvn -B package` and run `java -jar target\aidrama-backend-0.1.0-SNAPSHOT.jar` with the variables set.

Health: `GET /actuator/health`. OpenAPI: `GET /v3/api-docs`.

## Configuration

URL and username are in `src/main/resources/application.yml`. Secrets are read from the environment and startup fails if they are missing.

| Variable | Required | Purpose |
|---|---|---|
| `SPRING_DATASOURCE_PASSWORD` | yes | Database password. Never in source or a `NEXT_PUBLIC_*` variable |
| `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME` | no | Default `jdbc:postgresql://192.168.100.46:5432/aidrama?options=-c%20timezone=UTC`, user `postgres` |
| `AIDRAMA_JWT_SECRET` | yes | HS256 signing key, at least 32 characters |
| `AIDRAMA_STORAGE_BUCKET`, `AIDRAMA_STORAGE_PUBLIC_BASE_URL` | yes | Bucket for uploads and the public (CDN) origin that serves processed media |
| `AIDRAMA_STORAGE_REGION`, `_ENDPOINT`, `_PATH_STYLE`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` | no | S3 settings. Without keys the AWS default credential chain is used |
| `AIDRAMA_CORS_ALLOWED_ORIGINS`, `AIDRAMA_WEB_BASE_URL` | no | Default `http://localhost:3000` |
| `AIDRAMA_MAIL_LOG_LINKS` | no | Dev only. Logs the email-verification link (a credential) |
| `AIDRAMA_PROCESSING_DEV_STUB_ENABLED` | no | Dev only. See "Processing worker" |
| `AIDRAMA_API_DOCS_ENABLED` | no | `false` hides `/v3/api-docs` |
| `AIDRAMA_VIEWS_SALT` | no locally, yes elsewhere | Salt (16+ chars) for hashing viewer ids into `video_view_events.viewer_key`. The default is a local-dev placeholder |
| `AIDRAMA_VIEWS_QUALIFIED_SECONDS` | no | Watch seconds a `VIEW_QUALIFIED` event needs to count a view. Default 10 |

Hibernate uses `hibernate.jdbc.time_zone=UTC` and the JDBC URL sets `timezone=UTC`.

## Tests

```powershell
cd backend
mvn -B verify      # compiles, 30 unit tests (surefire), 48 integration tests (failsafe), packages the jar
mvn -B test        # unit tests only, no Docker needed
```

Integration tests (`*IT`) start `postgres:16-alpine` with Testcontainers, apply the DB engineer's changelog (copied from
`../db/changelog` onto the test classpath at build time) and start the whole application with Hibernate validating every mapped entity
against that schema. Object storage is an in-memory fake in tests. They need Docker and about 1 GB of free memory.

## Layout

```
com.aidrama
  config/        AppProperties (validated settings)
  security/      SecurityConfig, TokenService (HS256 tokens), AuthenticatedUser
  common/        error envelope + GlobalExceptionHandler, pagination, request id filter
  user/ auth/    users, profiles, roles; register, login, refresh, verify email
  video/         Video + VideoAsset entities and lifecycle rules, visibility predicates (VideoSpecs), creator use cases
  series/        read-only Series and Season entities
  upload/        upload sessions, processing jobs, status, worker-facing transitions
  storage/       ObjectStorage port + S3 implementation
  discovery/     home, video list, watch lookup, series
```

## Design decisions

- **Upload approach:** a small file gets a presigned `PUT` of the whole file (single request); the signature covers method,
  `Content-Type` and `Content-Length`, so storage rejects a different type or size. A file at or above
  `aidrama.storage.multipart-threshold-bytes` (default 90 MiB) is uploaded with S3 multipart instead: `initiate` opens the
  multipart upload and returns a `multipart` plan of presigned per-part `PUT` URLs (each part `multipart-part-bytes`, default
  90 MiB), the browser PUTs each part and reads its `ETag`, and `POST /uploads/{id}/complete-multipart` assembles them. This keeps
  every request body under a proxy's limit (Cloudflare caps at 100 MB), which single-PUT large files hit (spec 3.7 "large file
  support"). The `multipart_upload_id`, `part_size_bytes` and `total_parts` columns of `upload_sessions` hold the plan.
- **Visibility is one definition.** `VideoSpecs.discoverable()` (lists) and `linkable()` (share links) hold the published, public,
  not-deleted and parent-series predicate from SCHEMA.md rule 1. Every public query composes one of them.
- **Ownership.** Services take the caller from the validated token and load by `(id, creator_id)`. Another creator's id is a `404`.
  Role checks happen in the URL rules and again in each use case.
- **No N+1.** Lists load creators, assets and seasons with one query each per page, not per row.
- **Transactions** are short. The storage `HEAD` call in `complete` runs outside any transaction.
- **Auth tokens are stateless** because SCHEMA.md has no table for them. See limitations and `docs/proposed-0010-auth-tokens.sql`.
- **Email is a stub.** Registration logs a masked address. The verification link is logged only with `AIDRAMA_MAIL_LOG_LINKS=true`.
  Verification does not gate any feature yet.
- **Processing worker.** The FFmpeg worker is outside this slice. `ProcessingJobService` holds the state transitions it needs
  (`claimNext`, `reportProgress`, `succeed`, `fail`). `AIDRAMA_PROCESSING_DEV_STUB_ENABLED=true` starts a simulator that marks jobs
  READY without transcoding anything or writing any file, so the frontend can walk the flow. `hlsUrl` will not play in that mode.

## Known limitations

- Access and refresh tokens cannot be revoked. `POST /auth/logout` is a no-op on the server. Suspending an account stops login and refresh
  at once, but an already issued access token works for up to 15 minutes. Needs a refresh-token table (proposal in `docs/`).
- No rate limiting or login throttling (spec section 8 item 8). Put a gateway limit in front, or add a limiter before public launch.
- No real email delivery, no password reset.
- Private, unlisted and draft media are not access controlled in storage: `hlsUrl` is a plain public URL built from the object key. Only
  the API hides the link. Spec 5.4 wants signed playback URLs or signed cookies for non-public media. Keep `videos/*/original/*` private
  in the bucket policy and expose only `videos/*/hls/*` and `videos/*/thumbnails/*`.
- No malware scan or media inspection of the uploaded file. Size and declared type are verified; the worker must validate the real media.
- `viewCount` and `likeCount` stay 0 (no view-event endpoint, no likes). The home "trending" rail therefore falls back to arbitrary order among ties.
- Series, seasons and episodes can be read but not created through the API. `EPISODE` videos cannot be created yet.
- Expired upload sessions are cleaned up lazily on the next `initiate` or `complete`; there is no scheduled sweeper.
- Suspended or deleted creators' published videos remain public (the schema has no rule for it). Decide the policy with moderation.
- Not run against a signature-validating S3 store: presigned-URL structure is unit tested and the PUT/HEAD flow was smoke tested against
  `adobe/s3mock`, which does not verify signatures.

## Git

`C:\code_area\Playground\sd` is not a git repository, so nothing was committed or pushed. `backend/.gitignore` already excludes `.env` and `target/`.
