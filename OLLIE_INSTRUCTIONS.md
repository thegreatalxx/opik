# Local Integration: Ollie + Opik

Run the Ollie assistant sidebar inside the Opik frontend, backed by the ollie-assist agent.

## Prerequisites

| Component | Repo | Default Port |
|-----------|------|-------------|
| ollie-assist | `../ollie-assist` | 9080 |
| ollie-console | `../ollie-console` | 3333 |
| opik frontend | `../opik/apps/opik-frontend` | 5174 |
| opik backend | `../opik/apps/opik-backend` | 8080 |

## 1. Start ollie-assist

```bash
cd ollie-assist
# Follow repo README for setup (Python, uv, etc.)
# Starts on :9080 by default (nginx -> FastAPI)
make dev
```

Verify: `curl -s http://localhost:9080/sessions -X POST -H 'Content-Type: application/json' -d '{"message":"ping","context":{"page":"opik"}}'` should return a `session_id`.

## 2. Start ollie-console

```bash
cd ollie-console
npm install
npm run dev    # builds + watches + serves dist/ on :3333
```

Verify: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3333/ollie.js` should return `200`.

## 3. Configure the Opik frontend

Add two env vars to `apps/opik-frontend/.env.development`:

```
VITE_OLLIE_BASE_URL=http://localhost:3333
VITE_OLLIE_ASSIST_URL=/ollie-assist
```

`VITE_OLLIE_BASE_URL` tells the frontend where to load `ollie.js` and `ollie.css` from. `VITE_OLLIE_ASSIST_URL` is the backend the sidebar talks to for chat sessions.

### Vite proxy for ollie-assist

The sidebar makes fetch/SSE requests to ollie-assist. To avoid CORS issues (nginx + FastAPI both add CORS headers, causing duplicates), proxy through Vite instead of hitting `:9080` directly.

In `apps/opik-frontend/vite.config.ts`, add to the `proxy` block:

```ts
"/ollie-assist": {
  target: "http://localhost:9080",
  changeOrigin: true,
  rewrite: (requestPath) => requestPath.replace(/^\/ollie-assist/, ""),
},
```

### OllieSidebar component

Create `apps/opik-frontend/src/components/layout/OllieSidebar/OllieSidebar.tsx`. This component:

- Loads `ollie.js` + `ollie.css` from `VITE_OLLIE_BASE_URL`
- Creates the `AssistantSidebarBridge` with workspace/project context
- Calls `window.OllieConsole.mount(el, bridge)`
- Pushes context updates (theme, project changes) via the bridge's subscribe mechanism

Mount it in `PageLayout.tsx` alongside the main content area:

```tsx
<div className="comet-content-inset absolute bottom-0 right-0 top-[var(--banner-height)] flex transition-all">
  <main className="relative flex min-w-0 flex-1 flex-col">
    <TopBar />
    <section className="comet-header-inset absolute inset-x-0 bottom-0 overflow-auto bg-soft-background px-6">
      <Outlet />
    </section>
  </main>
  <OllieSidebar />
</div>
```

The sidebar sits in the flex row next to `<main>`, so it takes up space in the layout rather than overlapping.

## 4. Start the Opik frontend

```bash
cd opik/apps/opik-frontend
npm run dev
```

**Important:** Restart the dev server after changing `.env.development` — Vite doesn't hot-reload env vars.

## 5. Open the app

Go to `http://localhost:5174`. The Ollie sidebar should appear on the right. Type a message or click a suggestion to verify it streams a response.

## How it works

```
Browser (:5174)
  |
  |-- loads ollie.js + ollie.css from :3333 (ollie-console dev server)
  |-- mounts sidebar into shadow DOM (CSS isolation)
  |
  |-- chat requests go to /ollie-assist/*
  |     \-- Vite proxy rewrites to :9080/* (ollie-assist)
  |           |-- POST /sessions        (create session)
  |           |-- POST /sessions/:id/message (send message)
  |           |-- GET  /sessions/:id/stream  (SSE response stream)
  |
  |-- bridge passes context:
        workspaceName, projectId, authToken, theme, baseApiUrl
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Sidebar doesn't appear | `VITE_OLLIE_BASE_URL` not set or ollie-console not running | Check env var, restart Vite, verify `:3333` serves `ollie.js` |
| Messages send but no response | CORS duplicate headers | Use the Vite proxy (`/ollie-assist`) instead of hitting `:9080` directly |
| `onNavigate is not defined` | Stale ollie-console build | Rebuild ollie-console (`npm run dev`) |
| Sidebar overlaps content | Mounted with fixed positioning | Use inline flex layout in PageLayout |
| Context not updating | Bridge subscribe not wired | OllieSidebar pushes `getContext()` to listeners on dependency change |
