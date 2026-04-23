# Deploying CultStore Budget Flow

This app is ready to deploy as a small Node service with a persistent volume for the SQLite database.

## Recommended host

Use Railway or Render with a persistent disk / volume.

Why:
- The app stores data in SQLite.
- SQLite needs persistent storage to survive restarts and redeploys.
- This keeps the app simple without introducing Postgres yet.

## Required runtime settings

- `PORT`
  - Usually provided by the host automatically.
- `DATA_DIR`
  - Set this to the mounted persistent storage path.
  - Example for Railway: `/data`
  - Example for Render mounted disk: `/data`
- `R2_ACCOUNT_ID`
  - Your Cloudflare account ID for the R2 bucket.
- `R2_BUCKET`
  - The bucket name where PO PDFs will be stored.
- `R2_ACCESS_KEY_ID`
  - R2 access key with bucket read/write access.
- `R2_SECRET_ACCESS_KEY`
  - Matching R2 secret key.

## Health check

Use:

`/api/health`

This endpoint also shows whether PDF upload storage is configured.

## Railway

Suggested setup:

1. Create a new Railway project from this repo/folder.
2. Deploy using the included `Dockerfile`.
3. Attach a volume and mount it at `/data`.
4. Set environment variable:
   - `DATA_DIR=/data`
5. Expose the service on port `3000` or let Railway inject `PORT`.

## Render

Suggested setup:

1. Create a new Web Service.
2. Use the included `Dockerfile`.
3. Attach a persistent disk mounted at `/data`.
4. Set environment variable:
   - `DATA_DIR=/data`
5. Use start command from the Docker container.

## Local run

```bash
cd /Users/anirudh.panda/Documents/Codex/2026-04-22-hello-codex-what-s-up-my
./run-app.sh
```

## Important note

This is deploy-ready for a small internal team, but not yet hardened for heavy production use.

If usage grows, the next upgrade should be:
- move from SQLite to Postgres
- add backup policy
- add row edit history / audit trail
