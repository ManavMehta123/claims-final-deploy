# Monitoring (Story 5)

## 1. Why software teams monitor applications

Once an application is deployed, the team no longer sees it run — monitoring is what
replaces that direct visibility. In the industry it's generally split into three questions:

- **Is it up?** — basic liveness/uptime checks (this project already had `GET /health`
  before this story).
- **Is it healthy?** — request rate, error rate, latency, resource usage (CPU, memory,
  event-loop lag for Node). This is what this story adds.
- **Why did it break?** — logs and traces, for root-causing an incident after the first two
  layers flagged it.

The three signals monitoring tools are built around are usually summarized as the **RED
method** for services (**R**ate, **E**rrors, **D**uration) and the **USE method** for
resources (**U**tilization, **S**aturation, **E**rrors). Both map directly onto the metrics
this story adds to the API.

Concretely, monitoring is what lets a team:

1. **Detect problems before users report them** — an error-rate spike or a latency
   regression shows up on a dashboard/alert within seconds of a bad deploy, instead of
   being discovered from a support ticket hours later.
2. **Answer capacity questions with data** — "can this survive 3x traffic?" is answerable
   from historical request-rate and resource graphs instead of guesswork.
3. **Prove SLAs and justify architecture decisions** — e.g. p95 latency graphs are the
   evidence behind a "the API is fast enough" claim.
4. **Shorten incident response** — when something does break, dashboards narrow down
   *which* endpoint, *when* it started, and *whether* it's a code, database, or
   infrastructure problem, before anyone reads a single log line.

**Prometheus + Grafana** were chosen for this project because they're the de facto open
source standard for exactly this: Prometheus *pulls* metrics from the app on a schedule and
stores them as time series; Grafana turns those time series into dashboards. Both run as
plain Docker containers, which fits this project's existing Docker-first deployment (Story
3's Nginx gateway, `docker-compose.yml`) with no new infrastructure paradigm.

## 2. What was implemented

### 2.1 Instrumenting the app (`prom-client`)

The backend now depends on [`prom-client`](https://www.npmjs.com/package/prom-client), the
standard Prometheus client library for Node.js.

- **`backend/src/config/metrics.js`** — creates a dedicated `Registry` and defines the
  custom metrics below. `client.collectDefaultMetrics()` also registers ~20 built-in Node
  process metrics for free (CPU time, resident memory, heap usage, event-loop lag, open file
  descriptors, GC duration).
- **`backend/src/middleware/metrics.js`** — an Express middleware, mounted before routing in
  `src/app.js`, that times every request (`res.on("finish")`) and records it against the
  metrics below, labeled by the *route pattern* (e.g. `/api/claims/:id`) rather than the raw
  URL, so per-record IDs don't explode into thousands of distinct label values.

| Metric | Type | Labels | What it answers |
|---|---|---|---|
| `claims_api_http_requests_total` | Counter | `method`, `route`, `status_code` | Request rate, traffic mix by route |
| `claims_api_http_errors_total` | Counter | `method`, `route`, `status_code` | Error rate (any status ≥ 400) |
| `claims_api_http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Latency distribution → p50/p95/p99 |
| `claims_api_in_flight_requests` | Gauge | — | Concurrent load right now |
| `claims_api_nodejs_eventloop_lag_*`, `claims_api_process_*`, `claims_api_nodejs_heap_*` | Gauge/Counter | — | Node process health (event-loop lag, memory, CPU) |

- **`GET /metrics`** (added in `src/app.js`) — a public, unauthenticated endpoint that
  serializes the registry in Prometheus's plain-text exposition format. It's public for the
  same reason `/health` is: monitoring infrastructure needs unconditional access, and it
  exposes no business data — only counts and timings.

### 2.2 Collecting and visualizing the metrics

`docker-compose.yml` gains two new services, alongside the existing `mongo` / `backend` /
`nginx`:

- **`prometheus`** (`prom/prometheus`) — scrapes `backend:5000/metrics` every 15 seconds
  (`monitoring/prometheus.yml`) over the internal Docker network, storing the results as
  time series. UI at `http://localhost:9090`.
- **`grafana`** (`grafana/grafana`) — reads from Prometheus and renders dashboards. UI at
  `http://localhost:3001` (`admin` / `admin` for this demo). A Prometheus data source and a
  ready-made **"Claims API Overview"** dashboard are both auto-provisioned on container start
  (`monitoring/grafana/provisioning/`), so there's nothing to click through manually —
  request rate, error rate, p95 latency, in-flight requests, event-loop lag, and memory are
  already on one screen.

Like `mongo`, neither service is routed through the Nginx gateway — they're reached directly
on their own ports, which mirrors how monitoring stacks are typically kept on an internal
network in real deployments (not exposed to the same public entry point as the API itself).

## 3. Running it

```bash
docker compose up --build
```

- API (via gateway): `http://localhost:8080`
- Prometheus: `http://localhost:9090` — try the **Graph** tab with a query like
  `rate(claims_api_http_requests_total[1m])`
- Grafana: `http://localhost:3001` (login `admin` / `admin`) → **Dashboards → Claims API
  Overview**

Generate some traffic (via the frontend, Postman collection, or `curl`) and watch the
dashboard update in real time.

## 4. Useful PromQL queries

```promql
# Requests per second, by route
sum(rate(claims_api_http_requests_total[1m])) by (route)

# Error rate as a percentage of total traffic
sum(rate(claims_api_http_errors_total[5m])) / sum(rate(claims_api_http_requests_total[5m])) * 100

# p95 latency, by route
histogram_quantile(0.95, sum(rate(claims_api_http_request_duration_seconds_bucket[5m])) by (le, route))

# Is the event loop under pressure?
claims_api_nodejs_eventloop_lag_p99_seconds
```

## 5. Viva Q&A

**Q: Why Prometheus specifically, and not just logging to a file?**
Logs answer "what happened on this one request"; metrics answer "what's the overall trend
right now" cheaply — a counter increment costs far less than writing a log line per request,
and it's already pre-aggregated into rates/percentiles instead of needing to be parsed after
the fact.

**Q: Why pull (Prometheus scrapes the app) instead of push (app sends metrics out)?**
Pull means the app stays simple — it just exposes current counter values on an endpoint and
does no network calls of its own to "report" metrics, so a slow or unreachable monitoring
backend can never block or slow down a request. Prometheus also gets liveness for free: a
target that stops responding to scrapes is itself an alertable signal.

**Q: What's the difference between the `_total` counters and the histogram?**
Counters only ever go up and answer "how many" (rate = how many per second). The histogram
buckets every request's duration so percentiles (p50/p95/p99) can be computed — a counter
alone can't tell you if requests are fast or slow, only how many there were.

**Q: Why label by route *pattern* and not the raw URL?**
`/api/claims/64f1...` and `/api/claims/64f2...` are different URLs for the same operation. If
each claim ID became its own Prometheus label value, the number of time series would grow
unbounded with the data — this is the classic "high cardinality" mistake Prometheus docs
warn about. `resolveRoute()` in the middleware normalizes the raw URL to Express's matched
`req.route.path` (e.g. `/api/claims/:id`) before it's used as a label.

**Q: What would you alert on, if you set up Alertmanager next?**
Sustained error rate above a threshold (e.g. >5% for 5 minutes), p95 latency above an SLO
(e.g. >1s for 5 minutes), and the backend target being unreachable by Prometheus at all
(`up{job="claims-backend"} == 0`).
