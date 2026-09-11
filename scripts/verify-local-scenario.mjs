import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const root = path.resolve("data/local-scenario");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
assert.equal(manifest.kind, "alpenblick-local-scenario");
assert.equal(path.resolve(manifest.database), path.join(root, "scenario.db"));
const db = new Database(path.join(root, "scenario.db"), { readonly: true });
const checks = [];
function check(name, fn) { fn(); checks.push(name); }
check("SQLite integrity and foreign keys", () => {
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  assert.deepEqual(db.pragma("foreign_key_check"), []);
});
check("Five demo identities with credentials, employees and assignments", () => {
  assert.equal(db.prepare("SELECT COUNT(*) n FROM user").get().n, 5);
  for (const person of manifest.users) {
    assert.ok(db.prepare("SELECT 1 FROM account WHERE userId=? AND providerId='credential' AND password IS NOT NULL").get(`demo-${person.username}`));
    assert.ok(db.prepare("SELECT 1 FROM employees WHERE user_id=?").get(`demo-${person.username}`));
    assert.ok(db.prepare("SELECT 1 FROM task_assignees WHERE user_id=?").get(`demo-${person.username}`));
  }
});
check("Entry VAT, tax-line totals and payment-line totals", () => {
  const entries = db.prepare("SELECT * FROM entries").all();
  for (const entry of entries) {
    assert.equal(entry.gross_amount_cents, entry.net_amount_cents + entry.vat_amount_cents);
    assert.equal(entry.vat_amount_cents, Math.round(entry.net_amount_cents * entry.vat_rate / 100));
    assert.ok(entry.gross_amount_cents > 0);
    const tax = db.prepare("SELECT SUM(net_amount_cents) net, SUM(vat_amount_cents) vat, SUM(gross_amount_cents) gross FROM entry_tax_lines WHERE entry_id=?").get(entry.id);
    assert.equal(tax.net, entry.net_amount_cents); assert.equal(tax.vat, entry.vat_amount_cents); assert.equal(tax.gross, entry.gross_amount_cents);
    assert.equal(db.prepare("SELECT SUM(amount_cents) n FROM entry_payment_lines WHERE entry_id=?").get(entry.id).n, entry.gross_amount_cents);
  }
});
check("Gapless invoice sequences and exactly matching paid income", () => {
  const sequences = new Map();
  for (const invoice of db.prepare("SELECT * FROM invoices ORDER BY number_year, number_seq").all()) {
    const sequence = (sequences.get(invoice.number_year) ?? 0) + 1;
    assert.equal(invoice.number_seq, sequence); sequences.set(invoice.number_year, sequence);
    const items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id=?").all(invoice.id);
    const expected = items.reduce((total, item) => {
      const net = Math.round(item.quantity_thousandths * item.unit_price_cents / 1000);
      return total + net + Math.round(net * item.vat_rate / 100);
    }, 0);
    const entries = db.prepare("SELECT * FROM entries WHERE invoice_id=?").all(invoice.id);
    if (invoice.status === "paid") { assert.equal(entries.length, 1); assert.equal(entries[0].gross_amount_cents, expected); }
    else assert.equal(entries.length, 0);
  }
});
check("Funding allocations do not exceed linked expense net amounts", () => {
  for (const allocation of db.prepare("SELECT accounting_entry_id, SUM(actual_amount_cents) amount FROM funding_booking_allocations GROUP BY accounting_entry_id").all()) {
    const entry = db.prepare("SELECT * FROM entries WHERE id=?").get(allocation.accounting_entry_id);
    assert.equal(entry.kind, "expense"); assert.ok(allocation.amount <= entry.net_amount_cents);
  }
});
check("Attachments exist inside the isolated store and match their hashes", () => {
  const uploadRoot = path.join(root, "uploads");
  for (const attachment of db.prepare("SELECT * FROM attachments").all()) {
    const absolute = path.resolve(uploadRoot, attachment.stored_name);
    assert.ok(absolute.startsWith(uploadRoot + path.sep));
    const bytes = fs.readFileSync(absolute);
    assert.equal(bytes.length, attachment.size_bytes);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), attachment.sha256);
    if (attachment.mime_type === "application/pdf") assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  }
});
check("Research PDFs processed with searchable text", () => {
  assert.equal(db.prepare("SELECT COUNT(*) n FROM wiki_pdf_documents WHERE status='ready'").get().n, 9);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM wiki_pdf_pages WHERE length(text)>100").get().n, 9);
});
check("Calendar ranges and wiki document JSON", () => {
  assert.equal(db.prepare("SELECT COUNT(*) n FROM calendar_events WHERE (all_day=0 AND end_at<=start_at) OR (all_day=1 AND end_date<=start_date)").get().n, 0);
  for (const page of db.prepare("SELECT content_json FROM wiki_pages").all()) assert.equal(JSON.parse(page.content_json).type, "doc");
});
const hashesFile = path.join(root, "original-database-hashes.json");
if (fs.existsSync(hashesFile)) check("Original local database files unchanged since switching to demo", () => {
  const original = JSON.parse(fs.readFileSync(hashesFile, "utf8").replace(/^\uFEFF/, ""));
  // The documented E2E workflow deliberately resets its disposable database.
  // Continue protecting app.db/dev.db and all other captured local databases.
  for (const file of original.filter((item) => !/^e2e\.db(?:-shm|-wal)?$/.test(path.basename(item.Path)))) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(file.Path)).digest("hex").toUpperCase(), file.Hash);
});
db.close();
fs.writeFileSync(path.join(root, "verification.json"), JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2));
console.log(`${checks.length} scenario integrity checks passed.`);
