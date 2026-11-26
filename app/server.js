const express = require("express");
const { Pool } = require("pg");
const client = require("prom-client");

const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// --- Prometheus metrics ---
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequests = new client.Counter({
  name: "app_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register],
});
const httpDuration = new client.Histogram({
  name: "app_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});
const dbQueryDuration = new client.Histogram({
  name: "app_db_query_duration_seconds",
  help: "Database query duration in seconds",
  labelNames: ["query"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    const route = req.route ? req.route.path : "unmatched";
    const labels = { method: req.method, route, status: res.statusCode };
    httpRequests.inc(labels);
    end(labels);
  });
  next();
});

async function timedQuery(name, text, params) {
  const end = dbQueryDuration.startTimer({ query: name });
  try {
    return await pool.query(text, params);
  } finally {
    end();
  }
}

// --- Routes ---
app.get("/", (req, res) => res.json({ status: "ok" }));

app.get("/items", async (req, res) => {
  try {
    const { rows } = await timedQuery("list_items", "SELECT id, name, created_at FROM items ORDER BY id DESC LIMIT 50");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/items", async (req, res) => {
  try {
    const name = (req.body && req.body.name) || `item-${Date.now()}`;
    const { rows } = await timedQuery("insert_item", "INSERT INTO items(name) VALUES($1) RETURNING id, name", [name]);
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Slow route: random latency up to 1.5s, to get interesting percentiles
app.get("/slow", async (req, res) => {
  await new Promise((r) => setTimeout(r, Math.random() * 1500));
  res.json({ status: "slow ok" });
});

// Flaky route: ~30% errors
app.get("/flaky", (req, res) => {
  if (Math.random() < 0.3) return res.status(500).json({ error: "random failure" });
  res.json({ status: "flaky ok" });
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// --- Startup: wait for DB, create table ---
async function init() {
  for (let i = 0; i < 20; i++) {
    try {
      await pool.query(
        "CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())"
      );
      return;
    } catch (e) {
      console.log("Waiting for database...", e.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("Database not reachable");
}

init().then(() => {
  app.listen(3000, () => console.log("App listening on :3000"));
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
