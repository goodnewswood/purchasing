import { createClient } from "@supabase/supabase-js";

/* One Supabase project for all three GNWS apps. Purchasing has its own
   pur_* tables, and also reads and writes the shared kv rows that Office and
   Ops use for vendors, products and purchase orders. */
export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const KV = {
  suppliers: "gnws-shared-suppliers-v1",
  pos: "gnws-shared-pos-v1",
  products: "gnws-shared-products-v1",
};

export async function kvGet(key) {
  const { data, error } = await sb.from("kv").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  if (!data) return [];
  return typeof data.value === "string" ? JSON.parse(data.value) : data.value;
}

/* Office and Ops store each list as one big row, so a stale copy written
   back would erase their edits. Always read the freshest copy, change only
   what we mean to, and write straight away. */
export async function kvUpdate(key, fn) {
  const current = await kvGet(key);
  const next = fn(current);
  const { error } = await sb.from("kv").upsert({ key, value: JSON.stringify(next), updated_at: new Date().toISOString() });
  if (error) throw error;
  return next;
}

export async function selectAll(table, order) {
  let q = sb.from(table).select("*");
  if (order) q = q.order(order.col, { ascending: !!order.asc, nullsFirst: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function upsertRow(table, row, onConflict) {
  const { data, error } = await sb.from(table).upsert(row, onConflict ? { onConflict } : undefined).select().single();
  if (error) throw error;
  return data;
}

export async function insertRow(table, row) {
  const { data, error } = await sb.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateRow(table, match, patch) {
  let q = sb.from(table).update(patch);
  Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data;
}

export async function deleteRow(table, match) {
  let q = sb.from(table).delete();
  Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
  const { error } = await q;
  if (error) throw error;
}

export const uid = () => Math.random().toString(36).slice(2, 9);
export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Same numbering as Office and Ops: PO-YYYY-<day of year><sequence>.
export function nextNumber(records, prefix) {
  const now = new Date();
  const year = now.getFullYear();
  const dayOfYear = Math.floor((now - new Date(year, 0, 1)) / 86400000) + 1;
  const dayStr = String(dayOfYear).padStart(3, "0");
  const re = new RegExp(`^${prefix}-${year}-${dayStr}(\\d+)(?:-.*)?$`);
  const maxSeq = records.reduce((max, r) => {
    const m = re.exec((r.number || "").trim());
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `${prefix}-${year}-${dayStr}${maxSeq + 1}`;
}
