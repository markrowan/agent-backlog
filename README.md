# Codex Agile Backlog Manager

Minimal React backlog manager with a local API that reads and writes a markdown backlog file safely, including a hosted Google Cloud Run mode backed by Google Cloud Storage.

## What it does

- Reads a markdown backlog file from disk when one is opened.
- Parses lanes, epics, and backlog stories.
- Displays stories in a minimalist Kanban board.
- Lets you create and edit stories from the UI.
- Writes changes back to markdown atomically with version checks.
- Ships with a prompt for a UX-focused product owner agent who maintains the same file directly.

## Run

```bash
npm install
./bin/backlog-manager BACKLOG.md
```

If you launch without an argument, the UI starts with no backlog loaded and you can open or create one from the interface.

This starts:

- Vite on `http://localhost:5173`
- The local API on `http://localhost:4177`

## Hosted mode on Google Cloud Run

Hosted mode keeps the markdown backlog as the source of truth, stores it durably in Google Cloud Storage, serves the built React app and API from one Cloud Run service, and keeps a pre-write `.bak` copy beside the live object.

### Required environment variables

- `BACKLOG_STORAGE_MODE=gcs`
- `GCS_BACKLOG_BUCKET=<bucket>`
- `GCS_BACKLOG_OBJECT=<path/to/workspace-backlog.md>`
- `WORKSPACE_NAME=<label shown in the UI>`
- `HOSTED_AUTH_REQUIRED=true` (default)
- Optional: `HOSTED_ALLOWED_EMAILS=a@company.com,b@company.com`
- Optional: `HOSTED_ALLOWED_EMAIL_DOMAINS=company.com`

### Behaviour in hosted mode

- The board always opens the configured hosted backlog, not arbitrary local files.
- If the configured hosted markdown object does not exist yet, the server seeds it from the backlog template on first load.
- Every write checks the latest object generation first and rejects stale writes instead of merging silently.
- The UI reloads the newest state and tells the user to retry when a write loses the race.
- No database copy of story content is introduced. The markdown object remains canonical.
- A sibling backup object at `<object>.bak` is refreshed before each write.

### Deploy

```bash
gcloud run deploy agent-backlog \
  --source . \
  --region <region> \
  --allow-unauthenticated=false \
  --set-env-vars BACKLOG_STORAGE_MODE=gcs,GCS_BACKLOG_BUCKET=<bucket>,GCS_BACKLOG_OBJECT=<object>,WORKSPACE_NAME=<workspace>,HOSTED_ALLOWED_EMAIL_DOMAINS=<domain>
```

Grant the Cloud Run service account read and write access to the bucket object path. Use Cloud Run authenticated access, and optionally tighten the in-app allowlist with `HOSTED_ALLOWED_EMAILS` or `HOSTED_ALLOWED_EMAIL_DOMAINS`.
