import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicFiles = new Set(["/index.html", "/styles.css", "/app.js"]);
const configuredDataDir = process.env.DATA_DIR?.trim();
const dataDir = configuredDataDir
  ? path.isAbsolute(configuredDataDir)
    ? configuredDataDir
    : path.join(__dirname, configuredDataDir)
  : path.join(__dirname, "data");
const jsonDataPath = path.join(dataDir, "budget-flow.json");
const dbPath = path.join(dataDir, "budget-flow.db");
const port = Number(process.env.PORT) || 3000;

const defaultBudgets = {
  Apparel: 1200000,
  Footwear: 1000000,
  Massagers: 500000,
  Accessories: 650000,
  "Indoor Equipment": 900000,
  Cycles: 1400000
};
const defaultFootwearBrandBudgets = {
  Cult: 500000,
  Avant: 500000
};

await fs.mkdir(dataDir, { recursive: true });
const db = new DatabaseSync(dbPath);
initializeDatabase();
await migrateLegacyJsonIfNeeded();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    await handleStatic(response, url.pathname);
  } catch (error) {
    respondJson(response, 500, { error: "Internal server error", detail: error.message });
  }
});

server.listen(port, () => {
  console.log(`CultStore Budget Flow running at http://localhost:${port}`);
});

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    respondJson(response, 200, {
      ok: true,
      storage: {
        dataDir,
        dbPath
      }
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    respondJson(response, 200, {
      budgets: readBudgets(),
      footwearBrandBudgets: readFootwearBrandBudgets(),
      entries: readEntries()
    });
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/budgets") {
    const body = await readJsonBody(request);
    const budgets = sanitizeBudgets(body.budgets);
    const footwearBrandBudgets = sanitizeFootwearBrandBudgets(body.footwearBrandBudgets);
    writeBudgets(budgets, footwearBrandBudgets);
    respondJson(response, 200, { budgets, footwearBrandBudgets, entries: readEntries() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/entries") {
    const body = await readJsonBody(request);
    const entry = sanitizeEntry(body);
    insertEntry(entry);
    respondJson(response, 201, entry);
    return;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/entries/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/entries/", ""));
    const body = await readJsonBody(request);
    const existingEntry = db.prepare("SELECT id FROM entries WHERE id = ?").get(id);

    if (!existingEntry) {
      respondJson(response, 404, { error: "Entry not found" });
      return;
    }

    const nextStatus = sanitizeStatus(body.status);
    db.prepare("UPDATE entries SET status = ? WHERE id = ?").run(nextStatus, id);
    respondJson(response, 200, db.prepare("SELECT * FROM entries WHERE id = ?").get(id));
    return;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/entries/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/entries/", ""));
    db.prepare("DELETE FROM entries WHERE id = ?").run(id);
    respondJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/reset") {
    resetAppData();
    respondJson(response, 200, { budgets: readBudgets(), entries: readEntries() });
    return;
  }

  respondJson(response, 404, { error: "Route not found" });
}

async function handleStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;

  if (!publicFiles.has(requested)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const filePath = path.join(__dirname, requested);
  const content = await fs.readFile(filePath);
  response.writeHead(200, { "Content-Type": getContentType(filePath) });
  response.end(content);
}

function initializeDatabase() {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS budgets (
      category TEXT PRIMARY KEY,
      amount INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS footwear_brand_budgets (
      brand TEXT PRIMARY KEY,
      amount INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
      owner_name TEXT NOT NULL,
      po_number TEXT NOT NULL,
      po_date TEXT NOT NULL,
      category TEXT NOT NULL,
      brand TEXT NOT NULL,
      spend_type TEXT NOT NULL,
      vendor TEXT NOT NULL,
      record_type TEXT NOT NULL,
      purpose TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const entryColumns = db.prepare("PRAGMA table_info(entries)").all();
  const hasBrandColumn = entryColumns.some((column) => column.name === "brand");
  if (!hasBrandColumn) {
    db.exec(`ALTER TABLE entries ADD COLUMN brand TEXT NOT NULL DEFAULT ''`);
  }

  if (db.prepare("SELECT COUNT(*) AS count FROM budgets").get().count === 0) {
    writeBudgets(defaultBudgets, defaultFootwearBrandBudgets);
  }

  if (db.prepare("SELECT COUNT(*) AS count FROM footwear_brand_budgets").get().count === 0) {
    writeBudgets(readBudgets(), defaultFootwearBrandBudgets);
  }
}

async function migrateLegacyJsonIfNeeded() {
  try {
    await fs.access(jsonDataPath);
  } catch {
    return;
  }

  if (db.prepare("SELECT COUNT(*) AS count FROM entries").get().count > 0) {
    return;
  }

  const raw = await fs.readFile(jsonDataPath, "utf8");
  const parsed = JSON.parse(raw);
  writeBudgets(
    sanitizeBudgets(parsed.budgets),
    sanitizeFootwearBrandBudgets(parsed.footwearBrandBudgets)
  );

  if (Array.isArray(parsed.entries)) {
    for (const legacyEntry of parsed.entries) {
      insertEntry(sanitizeEntry(legacyEntry, null));
    }
  }
}

function readBudgets() {
  const rows = db.prepare("SELECT category, amount FROM budgets ORDER BY rowid").all();
  return Object.fromEntries(rows.map((row) => [row.category, row.amount]));
}

function readFootwearBrandBudgets() {
  const rows = db.prepare("SELECT brand, amount FROM footwear_brand_budgets ORDER BY rowid").all();
  const saved = Object.fromEntries(rows.map((row) => [row.brand, row.amount]));
  return {
    ...defaultFootwearBrandBudgets,
    ...saved
  };
}

function writeBudgets(budgets, footwearBrandBudgets) {
  const insert = db.prepare(`
    INSERT INTO budgets (category, amount) VALUES (?, ?)
    ON CONFLICT(category) DO UPDATE SET amount = excluded.amount
  `);
  const insertBrandBudget = db.prepare(`
    INSERT INTO footwear_brand_budgets (brand, amount) VALUES (?, ?)
    ON CONFLICT(brand) DO UPDATE SET amount = excluded.amount
  `);
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM budgets").run();
    db.prepare("DELETE FROM footwear_brand_budgets").run();
    for (const [category, amount] of Object.entries(budgets)) {
      insert.run(category, amount);
    }
    for (const [brand, amount] of Object.entries(footwearBrandBudgets)) {
      insertBrandBudget.run(brand, amount);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function readEntries() {
  return db.prepare("SELECT * FROM entries ORDER BY datetime(created_at) DESC").all().map(mapEntryRow);
}

function insertEntry(entry) {
  db.prepare(`
    INSERT INTO entries (
      id, owner_user_id, owner_name, po_number, po_date, category, brand,
      spend_type, vendor, record_type, purpose, amount, status, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.ownerUserId,
    entry.ownerName,
    entry.poNumber,
    entry.poDate,
    entry.category,
    entry.brand,
    entry.spendType,
    entry.vendor,
    entry.recordType,
    entry.purpose,
    entry.amount,
    entry.status,
    entry.notes,
    entry.createdAt
  );
}

function resetAppData() {
  const insert = db.prepare(`
    INSERT INTO budgets (category, amount) VALUES (?, ?)
    ON CONFLICT(category) DO UPDATE SET amount = excluded.amount
  `);
  const insertBrandBudget = db.prepare(`
    INSERT INTO footwear_brand_budgets (brand, amount) VALUES (?, ?)
    ON CONFLICT(brand) DO UPDATE SET amount = excluded.amount
  `);
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM entries").run();
    db.prepare("DELETE FROM budgets").run();
    db.prepare("DELETE FROM footwear_brand_budgets").run();
    for (const [category, amount] of Object.entries(defaultBudgets)) {
      insert.run(category, amount);
    }
    for (const [brand, amount] of Object.entries(defaultFootwearBrandBudgets)) {
      insertBrandBudget.run(brand, amount);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function sanitizeBudgets(input) {
  const normalizedInput = { ...(input || {}) };
  delete normalizedInput["Massage Oils"];
  const merged = { ...defaultBudgets, ...normalizedInput };
  return Object.fromEntries(
    Object.entries(merged).map(([category, amount]) => [String(category), clampMoney(amount)])
  );
}

function sanitizeFootwearBrandBudgets(input) {
  const merged = { ...defaultFootwearBrandBudgets, ...(input || {}) };
  return Object.fromEntries(
    Object.entries(defaultFootwearBrandBudgets).map(([brand]) => [brand, clampMoney(merged[brand])])
  );
}

function sanitizeEntry(input, sessionUser) {
  const recordType = sanitizeRecordType(input.recordType);
  const ownerName = sanitizeText(input.ownerName || input.owner);
  const category = sanitizeCategory(input.category);
  return {
    id: typeof input.id === "string" ? input.id : randomUUID(),
    ownerUserId: null,
    ownerName: ownerName || "Unknown",
    poNumber: sanitizeText(input.poNumber),
    poDate: sanitizeDate(input.poDate),
    category,
    brand: sanitizeBrand(input.brand, category),
    spendType: sanitizeText(input.spendType),
    vendor: sanitizeText(input.vendor),
    recordType,
    purpose: sanitizeText(input.purpose),
    amount: sanitizeAmount(input),
    status: sanitizeStatus(input.status),
    notes: sanitizeText(input.notes),
    createdAt: typeof input.createdAt === "string" ? input.createdAt : new Date().toISOString()
  };
}

function mapEntryRow(row) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
    poNumber: row.po_number,
    poDate: row.po_date,
    category: row.category,
    brand: row.brand,
    spendType: row.spend_type,
    vendor: row.vendor,
    recordType: row.record_type,
    purpose: row.purpose,
    amount: row.amount,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at
  };
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function sanitizeText(value) {
  return String(value || "").trim().slice(0, 240);
}

function sanitizeDate(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10);
}

function sanitizeCategory(value) {
  const text = String(value || "");
  if (text === "Massage Oils") return "Massagers";
  return Object.hasOwn(defaultBudgets, text) ? text : Object.keys(defaultBudgets)[0];
}

function sanitizeBrand(value, category) {
  if (category !== "Footwear") return "";
  return Object.hasOwn(defaultFootwearBrandBudgets, value) ? value : "Cult";
}

function sanitizeStatus(value) {
  const statuses = new Set(["Raised", "Invoiced", "Paid", "Delayed", "Cancelled"]);
  return statuses.has(value) ? value : "Raised";
}

function sanitizeRecordType(value) {
  return value === "Invoice" ? "Invoice" : "PO";
}

function sanitizeAmount(input) {
  if (typeof input.amount !== "undefined") {
    return clampMoney(input.amount);
  }

  const poAmount = clampMoney(input.poAmount);
  const invoiceAmount = clampMoney(input.invoiceAmount);
  if (invoiceAmount > 0 && poAmount === 0) return invoiceAmount;
  return poAmount || invoiceAmount;
}

function clampMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount);
}

function getContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function respondJson(response, statusCode, payload) {
  if (!response.getHeader("Content-Type")) {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  response.writeHead(statusCode);
  response.end(JSON.stringify(payload));
}
