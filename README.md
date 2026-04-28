# brimble-test
# Brimble Take-Home — Deployment Pipeline

A one-page deployment pipeline UI backed by a Go API, with Railpack builds, Docker container orchestration, and Caddy ingress. Everything starts with a single command.

---

## Quick Start


### Start the stack

```bash
docker compose up -d
```

The following services will start:

| Service | URL | Description |
|---|---|---|
| Frontend | http://localhost:4173 | React + TanStack one-pager |
| Backend API | http://localhost:3000 | Go REST + SSE API |
| Caddy | http://localhost:80 | Ingress proxy for all deployments |
| Caddy Admin | http://localhost:2019 | Dynamic route management |

### Tear down

```bash
docker compose down -v
```

---

## Sample Apps

Two sample apps are provided for testing the pipeline end-to-end.

### 1. Go HTTP Server (Zip upload)

A minimal Go HTTP server packaged as a zip archive. Use this to test the **file upload** flow in the UI.

**Download:** https://pub-e19ae060fb984bafba6381eafbb4e838.r2.dev/go-ms.zip

Steps:
1. Download the zip
2. Open the UI at http://localhost:4173
3. Click **New Deployment → Upload Zip Folder**
4. Upload the zip and submit
5. Watch the build and deploy logs stream live

### 2. Node/Express App (Git URL)

A simple Node + Express app. Use this to test the **Git URL** flow.

**Repository:** https://github.com/denisecase/node-express-app.git

Steps:
1. Open the UI at http://localhost:80
2. Click **New Deployment → Git URL**
3. Paste the URL above and submit
4. Watch the pipeline progress: `pending → building → deploying → running`

---


### Key design decisions

**Go for the API.** Go's `net/http` makes SSE straightforward — `http.Flusher` lets us push log lines to the client as they arrive from the Railpack build process, with no third-party streaming library needed.

**SQLite for state.** There is one server, one pipeline. SQLite is the right call here — no infra overhead, transactions where needed, and easy to inspect. 

**Caddy Admin API for routing.** Rather than rewriting a static `Caddyfile` on every deploy, the API calls Caddy's `/config/` endpoint to add or update a reverse-proxy route per deployment. This mirrors how a real PaaS manages ingress dynamically.

**Railpack for builds.** No handwritten Dockerfiles. Railpack detects the runtime, picks a build strategy, and produces an OCI image. The API shells out to `railpack build` and tails stdout/stderr directly into the SSE log stream.

**SSE over WebSocket for logs.** Log streaming is unidirectional (server → client), so SSE is the simpler fit — no upgrade handshake, works through proxies, and the browser `EventSource` API handles reconnection automatically.

---

## Log Streaming

Build logs stream live over SSE while Railpack is running. Open a deployment and logs appear as they are produced — you do not need to wait for the build to finish.

After the build completes, logs are persisted to SQLite and can be scrolled back at any time.

**Runtime logs** are currently returned as a snapshot via `docker logs <container-name>` rather than a true stream. See [What I'd change](#what-id-change-with-more-time) below.

---

## Walkthrough Video

https://www.loom.com/share/58f27a5b971b41f2955ba04669b6b3b2

---

## Brimble Deploy

**Deployed app:** https://smooth-event-scanner.brimble.app/

### Feedback

**Finding 1 - GitHub repository access is permanent after setup**
 
Connect your GitHub account and select the repositories you want the platform to access. If you did not include the repository you want to deploy, there is no way to update your selection from within Brimble. The platform does not prompt you to disconnect or guide you to fix it. The only resolution is to go to GitHub directly, revoke the app's access, and reconnect from scratch. There should be an option to edit repository access from within the platform without having to redo the entire integration.
 
**Finding 2 - Subscription error leads nowhere**
 
Go to the database provisioning screen and select a database that requires a paid plan, such as MySQL or Redis, then hit provision. You get an error that says "subscription required, contact support" with nothing else on the screen, no link, no button, no next step. You are left to find the billing page on your own, and by the time you do, the context of what you were trying to provision is gone. When a resource requires a paid plan, the platform should detect this and open an upgrade flow inline on the same screen, not dead-end the user into a support ticket.
---

## Time Spent

**~3 days**


---

## What I'd Change With More Time

**Real-time runtime log streaming.** Build logs stream live over SSE. Runtime logs currently return a buffer from `docker logs <container-name>` — it works, but it's a snapshot, not a stream. 

**Observability per deployment.** Track resource usage — CPU, memory, and network I/O — per running container.

**Traffic analytics.** Request volume per deployment, broken down by route. 


