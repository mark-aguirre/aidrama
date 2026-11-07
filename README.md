# aidrama

AI Drama is a community-driven public video streaming platform for AI filmmakers and creators:
upload a video, have it processed, and watch it. Content is organised as series/seasons/episodes,
movies, and shorts.

The full product requirements and software specification live in [`spec.md`](spec.md).

## Repository layout

| Path | What it holds |
|---|---|
| [`frontend/`](frontend) | Next.js + TypeScript + Tailwind + shadcn/ui web app |
| [`backend/`](backend) | Spring Boot REST API (`/api/v1`), Java 21, Maven |
| [`db/`](db) | PostgreSQL schema owned by Liquibase, plus the schema contract |
| [`design/`](design) | Design references and assets |
| [`spec.md`](spec.md) | Product requirements (PRD) and software spec (SRS) |

## Getting started

Each module documents its own setup:

- Backend: [`backend/README.md`](backend/README.md) — database init, configuration, and running locally.
- API contract used by the frontend: [`backend/docs/API-CONTRACT.md`](backend/docs/API-CONTRACT.md).
- Database schema contract: [`db/SCHEMA.md`](db/SCHEMA.md).

Both modules read their secrets from the environment. Copy the `.env.example` next to each module to
`.env` and fill it in; `.env` files are never committed.
