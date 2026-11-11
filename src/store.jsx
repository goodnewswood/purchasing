import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  KV, kvGet, kvUpdate, selectAll, upsertRow, insertRow, updateRow, deleteRow, uid, nextNumber,
} from "./lib/db";

const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);

const EMPTY = {
  suppliers: [], purVendors: [], zones: [], activities: [], purchases: [], truckloads: [],
  checks: [], settings: {}, pos: [], products: [],
};

export function DataProvider({ children }) {
  const [d, setD] = useState(EMPTY);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [suppliers, pos, products, purVendors, zones, activities, purchases, truckloads, checks, settingRows] = await Promise.all([
        kvGet(KV.suppliers), kvGet(KV.pos), kvGet(KV.products),
        selectAll("pur_vendors"), selectAll("pur_zones", { col: "sort", asc: true }),
        selectAll("pur_activities", { col: "at" }), selectAll("pur_purchases", { col: "date" }),
        selectAll("pur_truckloads", { col: "created_at" }), selectAll("pur_checks", { col: "created_at" }),
        selectAll("pur_settings"),
      ]);
      const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
      setD({ suppliers, pos, products, purVendors, zones, activities, purchases, truckloads, checks, settings });
      setStatus("ready");
    } catch (e) {
      setError(e.message || String(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = (p) => setD((cur) => ({ ...cur, ...(typeof p === "function" ? p(cur) : p) }));

  /* Vendors are two halves: the shared record in kv (name, phone, pricing
     Office uses) and the Purchasing profile in pur_vendors. The list view
     joins them so each screen sees one vendor. */
  const vendors = useMemo(() => {
    const byId = Object.fromEntries(d.purVendors.map((p) => [p.supplier_id, p]));
    return d.suppliers
      .filter((s) => s.name && s.name !== "GNWS")
      .map((s) => {
        const pv = byId[s.id] || { supplier_id: s.id, prices: {}, contacts: [] };
        const acts = d.activities.filter((a) => a.supplier_id === s.id);
        const lastStock = acts.find((a) => a.stock && Object.values(a.stock).some((v) => Number(v) > 0));
        return { ...s, pv, lastActivity: acts[0] || null, lastStock: lastStock || null, activityCount: acts.length };
      })
      .sort((a, b) => (a.pv.tier || 9) - (b.pv.tier || 9) || a.name.localeCompare(b.name));
  }, [d.suppliers, d.purVendors, d.activities]);

  const actions = useMemo(() => ({
    reload: load,

    async saveProfile(supplierId, changes) {
      const existing = d.purVendors.find((p) => p.supplier_id === supplierId) || { supplier_id: supplierId };
      const row = await upsertRow("pur_vendors", { ...existing, ...changes, supplier_id: supplierId, updated_at: new Date().toISOString() }, "supplier_id");
      patch((cur) => ({ purVendors: [...cur.purVendors.filter((p) => p.supplier_id !== supplierId), row] }));
      return row;
    },

    async saveSupplier(supplierId, changes) {
      const next = await kvUpdate(KV.suppliers, (list) => list.map((s) => (s.id === supplierId ? { ...s, ...changes } : s)));
      patch({ suppliers: next });
    },

    async addVendor(name) {
      const s = { id: uid(), name, altName: "", code: "", contact: "", phone: "", email: "", address: "", city: "", hidden: false, favorite: false, accountOwner: "", crews: "", has1099: false, payMethod: "Check", notes: "", pricing: {}, priceNotes: "" };
      const next = await kvUpdate(KV.suppliers, (list) => [s, ...list]);
      const row = await upsertRow("pur_vendors", { supplier_id: s.id, prices: {}, contacts: [] }, "supplier_id");
      patch((cur) => ({ suppliers: next, purVendors: [...cur.purVendors, row] }));
      return s.id;
    },

    async logActivity(a) {
      const row = await insertRow("pur_activities", a);
      patch((cur) => ({ activities: [row, ...cur.activities] }));
      return row;
    },
    async updateActivity(id, changes) {
      const row = await updateRow("pur_activities", { id }, changes);
      patch((cur) => ({ activities: cur.activities.map((a) => (a.id === id ? row : a)) }));
    },
    async deleteActivity(id) {
      await deleteRow("pur_activities", { id });
      patch((cur) => ({ activities: cur.activities.filter((a) => a.id !== id) }));
    },

    async saveTruckload(t) {
      const row = t.id
        ? await updateRow("pur_truckloads", { id: t.id }, { ...t, updated_at: new Date().toISOString() })
        : await insertRow("pur_truckloads", t);
      patch((cur) => ({ truckloads: [row, ...cur.truckloads.filter((x) => x.id !== row.id)] }));
      return row;
    },
    async deleteTruckload(id) {
      await deleteRow("pur_truckloads", { id });
      patch((cur) => ({ truckloads: cur.truckloads.filter((x) => x.id !== id) }));
    },

    /* POs land in the shared list as "ordered", exactly like one placed in
       Office, so Ops can receive them. Numbers are worked out against the
       freshest list so two people can't be handed the same one. */
    async createPOs(drafts) {
      const made = [];
      const next = await kvUpdate(KV.pos, (list) => {
        let all = list;
        drafts.forEach((draft) => {
          const po = { id: uid(), number: nextNumber(all, "PO"), status: "ordered", paymentStatus: "Unpaid", paidVia: "", ...draft };
          all = [po, ...all];
          made.push(po);
        });
        return all;
      });
      patch({ pos: next });
      return made;
    },

    async markPOsPaid(poIds, paidVia) {
      if (!poIds.length) return;
      const next = await kvUpdate(KV.pos, (list) => list.map((p) => (poIds.includes(p.id) ? { ...p, paymentStatus: "Paid", paidVia } : p)));
      patch({ pos: next });
    },

    async saveCheck(c) {
      const row = c.id ? await updateRow("pur_checks", { id: c.id }, c) : await insertRow("pur_checks", c);
      patch((cur) => ({ checks: [row, ...cur.checks.filter((x) => x.id !== row.id)] }));
      return row;
    },

    async saveSetting(key, value) {
      await upsertRow("pur_settings", { key, value }, "key");
      patch((cur) => ({ settings: { ...cur.settings, [key]: value } }));
    },

    async saveZone(z) {
      const row = await upsertRow("pur_zones", z, "id");
      patch((cur) => ({ zones: [...cur.zones.filter((x) => x.id !== row.id), row].sort((a, b) => a.sort - b.sort) }));
    },
  }), [d.purVendors, load]);

  const value = useMemo(() => ({ ...d, vendors, status, error, ...actions }), [d, vendors, status, error, actions]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

// Who is using the app, for "logged by". Kept per device.
export function useMe() {
  const [me, setMeState] = useState(() => {
    try { return localStorage.getItem("gnws-purchasing-me") || ""; } catch { return ""; }
  });
  const setMe = (v) => {
    setMeState(v);
    try { localStorage.setItem("gnws-purchasing-me", v); } catch { /* storage blocked */ }
  };
  return [me, setMe];
}
