# puzzle-54-progressive-form

Puzzle #54 of the puzzle series: a **progressive-disclosure intake form** that asks one question at a time.

## What it does

A six-step project intake form ("Forge Studio") that shows exactly one question per screen:

1. Name
2. Email
3. Project type (single choice)
4. Budget (single choice)
5. Timeline (dropdown)
6. Project details (free text)

followed by a Review screen and a confirmation screen.

### Design points

- **One question at a time.** Only the current step renders; `state.index` tracks position.
- **Validation gates every advance.** You cannot move to the next question (or submit) until the current answer passes the rules in `public/shared/schema.js`.
- **Back and Next preserve state.** Answers live in `state.data` and are mirrored to `localStorage`, so moving backward, forward, or refreshing mid-flow never loses what you entered.
- **Progress indicator.** A progress bar plus a "Step N of 6" counter.
- **One shared validation module.** `public/shared/schema.js` is imported by the browser, the Node dev server, and the Cloudflare Worker, so the exact same rules gate the UI and the real server-side submit. The client can never advance past, or submit, a value the server would reject.
- **Real submit.** Accepted submissions are re-validated server-side and persisted (JSONL file locally, KV on Cloudflare when a namespace is bound).

## Run locally

```bash
node server.mjs
# http://localhost:4300
```

Submissions are appended to `submissions.jsonl` (gitignored).

## Deploy (Cloudflare Workers)

```bash
npx wrangler deploy
```

The static form is served via the `[assets]` binding; the Worker handles `POST /api/submit`. Bind an optional `INTAKE_KV` namespace (see `wrangler.toml`) to durably store submissions.

## Project layout

```
public/
  index.html        one-question-at-a-time UI shell
  styles.css        styling
  app.js            progressive-disclosure controller
  shared/schema.js  form definition + validation (shared across all 3 runtimes)
server.mjs          local dev + verification server (Node stdlib, real submit)
worker.js           Cloudflare Worker (same server-side validation)
wrangler.toml       Cloudflare config
```
