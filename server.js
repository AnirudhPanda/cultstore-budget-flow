import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { createHash, createHmac, randomUUID } from "node:crypto";
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
const r2Config = {
  accountId: process.env.R2_ACCOUNT_ID?.trim() || "",
  bucket: process.env.R2_BUCKET?.trim() || "",
  accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim() || "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim() || ""
};

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
      },
      uploads: {
        provider: "r2",
        configured: isR2Configured(),
        bucket: r2Config.bucket || null
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

    const nextStatus = typeof body.status === "string" ? sanitizeStatus(body.status) : null;
    const nextPoNumber = Object.hasOwn(body, "poNumber") ? sanitizeText(body.poNumber) : null;

    if (nextStatus !== null) {
      db.prepare("UPDATE entries SET status = ? WHERE id = ?").run(nextStatus, id);
    }

    if (nextPoNumber !== null) {
      db.prepare("UPDATE entries SET po_number = ? WHERE id = ?").run(nextPoNumber, id);
    }

    respondJson(response, 200, mapEntryRow(db.prepare("SELECT * FROM entries WHERE id = ?").get(id)));
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/entries/") && url.pathname.endsWith("/attachment")) {
    const id = decodeURIComponent(url.pathname.replace("/api/entries/", "").replace("/attachment", ""));
    const entry = db.prepare("SELECT id, attachment_key, attachment_name FROM entries WHERE id = ?").get(id);

    if (!entry || !entry.attachment_key) {
      respondJson(response, 404, { error: "Attachment not found" });
      return;
    }

    if (!isR2Configured()) {
      respondJson(response, 503, { error: "R2 storage is not configured yet" });
      return;
    }

    const object = await getObjectFromR2(entry.attachment_key);
    const dispositionType = url.searchParams.get("download") === "1" ? "attachment" : "inline";
    response.writeHead(200, {
      "Content-Type": object.contentType || "application/pdf",
      "Content-Disposition": `${dispositionType}; filename="${encodeContentDispositionFilename(entry.attachment_name || "attachment.pdf")}"`
    });

    if (object.body) {
      Readable.fromWeb(object.body).pipe(response);
      return;
    }

    response.end();
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/entries/") && url.pathname.endsWith("/attachment")) {
    const id = decodeURIComponent(url.pathname.replace("/api/entries/", "").replace("/attachment", ""));
    const entry = db.prepare("SELECT id, attachment_key FROM entries WHERE id = ?").get(id);

    if (!entry) {
      respondJson(response, 404, { error: "Entry not found" });
      return;
    }

    if (!isR2Configured()) {
      respondJson(response, 503, { error: "R2 storage is not configured yet" });
      return;
    }

    const body = await readJsonBody(request);
    const attachment = sanitizeAttachmentUpload(body);
    const attachmentKey = buildAttachmentKey(id, attachment.fileName);

    await putObjectInR2(attachmentKey, attachment.buffer, attachment.contentType);

    if (entry.attachment_key && entry.attachment_key !== attachmentKey) {
      await deleteObjectFromR2(entry.attachment_key).catch(() => {});
    }

    const uploadedAt = new Date().toISOString();
    db.prepare(`
      UPDATE entries
      SET attachment_key = ?, attachment_name = ?, attachment_uploaded_at = ?
      WHERE id = ?
    `).run(attachmentKey, attachment.fileName, uploadedAt, id);

    respondJson(response, 200, mapEntryRow(db.prepare("SELECT * FROM entries WHERE id = ?").get(id)));
    return;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/entries/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/entries/", ""));
    const existingEntry = db.prepare("SELECT attachment_key FROM entries WHERE id = ?").get(id);
    db.prepare("DELETE FROM entries WHERE id = ?").run(id);
    if (existingEntry?.attachment_key && isR2Configured()) {
      await deleteObjectFromR2(existingEntry.attachment_key).catch(() => {});
    }
    respondJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/reset") {
    await resetAppData();
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
      attachment_key TEXT NOT NULL,
      attachment_name TEXT NOT NULL,
      attachment_uploaded_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const entryColumns = db.prepare("PRAGMA table_info(entries)").all();
  const hasBrandColumn = entryColumns.some((column) => column.name === "brand");
  if (!hasBrandColumn) {
    db.exec(`ALTER TABLE entries ADD COLUMN brand TEXT NOT NULL DEFAULT ''`);
  }
  const hasAttachmentKeyColumn = entryColumns.some((column) => column.name === "attachment_key");
  if (!hasAttachmentKeyColumn) {
    db.exec(`ALTER TABLE entries ADD COLUMN attachment_key TEXT NOT NULL DEFAULT ''`);
  }
  const hasAttachmentNameColumn = entryColumns.some((column) => column.name === "attachment_name");
  if (!hasAttachmentNameColumn) {
    db.exec(`ALTER TABLE entries ADD COLUMN attachment_name TEXT NOT NULL DEFAULT ''`);
  }
  const hasAttachmentUploadedAtColumn = entryColumns.some((column) => column.name === "attachment_uploaded_at");
  if (!hasAttachmentUploadedAtColumn) {
    db.exec(`ALTER TABLE entries ADD COLUMN attachment_uploaded_at TEXT NOT NULL DEFAULT ''`);
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
      spend_type, vendor, record_type, purpose, amount, status, notes,
      attachment_key, attachment_name, attachment_uploaded_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    entry.attachmentKey,
    entry.attachmentName,
    entry.attachmentUploadedAt,
    entry.createdAt
  );
}

async function resetAppData() {
  const insert = db.prepare(`
    INSERT INTO budgets (category, amount) VALUES (?, ?)
    ON CONFLICT(category) DO UPDATE SET amount = excluded.amount
  `);
  const insertBrandBudget = db.prepare(`
    INSERT INTO footwear_brand_budgets (brand, amount) VALUES (?, ?)
    ON CONFLICT(brand) DO UPDATE SET amount = excluded.amount
  `);
  const attachmentKeys = isR2Configured()
    ? db.prepare("SELECT attachment_key FROM entries WHERE attachment_key != ''").all().map((row) => row.attachment_key)
    : [];
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

  if (attachmentKeys.length > 0) {
    await Promise.all(attachmentKeys.map((key) => deleteObjectFromR2(key).catch(() => {})));
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
    attachmentKey: sanitizeText(input.attachmentKey),
    attachmentName: sanitizeAttachmentName(input.attachmentName),
    attachmentUploadedAt: typeof input.attachmentUploadedAt === "string" ? input.attachmentUploadedAt : "",
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
    attachmentKey: row.attachment_key,
    attachmentName: row.attachment_name,
    attachmentUploadedAt: row.attachment_uploaded_at,
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

function sanitizeAttachmentName(value) {
  const fileName = String(value || "").trim().replace(/[^\w.\- ]+/g, "_");
  return fileName.slice(0, 160);
}

function sanitizeAttachmentUpload(input) {
  const fileName = sanitizeAttachmentName(input.fileName);
  const contentType = String(input.contentType || "").trim().toLowerCase();
  if (!fileName || !fileName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please upload a PDF file only.");
  }
  if (contentType && contentType !== "application/pdf") {
    throw new Error("Please upload a PDF file only.");
  }
  const base64Data = String(input.base64Data || "");
  if (!base64Data) {
    throw new Error("Missing PDF file data.");
  }
  const buffer = Buffer.from(base64Data, "base64");
  const maxBytes = 10 * 1024 * 1024;
  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new Error("Please keep the PDF under 10 MB.");
  }
  return {
    fileName,
    contentType: "application/pdf",
    buffer
  };
}

function buildAttachmentKey(entryId, fileName) {
  const safeFileName = sanitizeAttachmentName(fileName || "attachment.pdf") || "attachment.pdf";
  return `po-attachments/${entryId}/${Date.now()}-${safeFileName}`;
}

function clampMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount);
}

function isR2Configured() {
  return Boolean(
    r2Config.accountId && r2Config.bucket && r2Config.accessKeyId && r2Config.secretAccessKey
  );
}

function getR2Endpoint() {
  return `https://${r2Config.accountId}.r2.cloudflarestorage.com`;
}

async function putObjectInR2(key, buffer, contentType) {
  const response = await signedR2Request("PUT", key, {
    body: buffer,
    contentType
  });
  if (!response.ok) {
    throw new Error(`Could not upload PDF to storage (${response.status}).`);
  }
}

async function getObjectFromR2(key) {
  const response = await signedR2Request("GET", key);
  if (!response.ok) {
    throw new Error(`Could not fetch PDF from storage (${response.status}).`);
  }

  return {
    body: response.body,
    contentType: response.headers.get("content-type")
  };
}

async function deleteObjectFromR2(key) {
  const response = await signedR2Request("DELETE", key);
  if (!response.ok && response.status !== 404) {
    throw new Error(`Could not delete PDF from storage (${response.status}).`);
  }
}

async function signedR2Request(method, key, options = {}) {
  if (!isR2Configured()) {
    throw new Error("R2 storage is not configured yet.");
  }

  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const body = options.body ? Buffer.from(options.body) : Buffer.alloc(0);
  const payloadHash = sha256Hex(body);
  const host = `${r2Config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeURIComponent(r2Config.bucket)}/${encodeR2Key(key)}`;
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`
  ].join("\n") + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signingKey = getSignatureKey(r2Config.secretAccessKey, dateStamp, "auto", "s3");
  const signature = hmacHex(signingKey, stringToSign);
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${r2Config.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = {
    Authorization: authorization,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };

  if (options.contentType) {
    headers["Content-Type"] = options.contentType;
  }

  return fetch(`${getR2Endpoint()}${canonicalUri}`, {
    method,
    headers,
    body: ["GET", "HEAD"].includes(method) ? undefined : body
  });
}

function encodeR2Key(key) {
  return String(key || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function toAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key, value) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getSignatureKey(secretKey, dateStamp, regionName, serviceName) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, "aws4_request");
}

function encodeContentDispositionFilename(value) {
  return String(value || "attachment.pdf").replace(/"/g, "");
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
