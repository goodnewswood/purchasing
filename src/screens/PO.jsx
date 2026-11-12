import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Printer, Save, Plus, Trash2, Pencil } from "lucide-react";
import { useData } from "../store.jsx";
import { uid } from "../lib/db";
import { money, num, longDate, formatPhone } from "../lib/format";
import { poSubtotal, poDiscount, poGoods, poBoards, poDiscountPct } from "../lib/po";
import { PageHeader, Section, Field, Btn, Pill } from "../ui.jsx";

/* One purchase order: edit it, then print it. Edits merge into the shared
   PO record, so fields this screen doesn't know about (receiving, truckload
   number, anything Office or Ops added) are kept as they were. */
const PAYMENT = ["Unpaid", "Partial", "Paid"];

// Line editor works in boards and price per board; the PO stores the line total.
const toEdit = (l) => {
  const boards = (Number(l.boardCount) || 0) * (Number(l.copies) || 1);
  return { ...l, key: l.key || uid(), perBoard: boards > 0 ? +(Number(l.cost || 0) / boards).toFixed(4) : "", flat: boards > 0 ? "" : l.cost ?? "" };
};
const lineCost = (l) => {
  const boards = (Number(l.boardCount) || 0) * (Number(l.copies) || 1);
  return Math.round((boards > 0 ? (Number(l.perBoard) || 0) * boards : Number(l.flat) || 0) * 100) / 100;
};

export default function PO({ id }) {
  const { pos, vendors, products, settings, savePO } = useData();
  const po = pos.find((p) => p.id === id);
  const [d, setD] = useState(null);
  const [mode, setMode] = useState("edit");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");

  // Start a draft from the saved PO, and again if someone else saves it while it's open and untouched.
  useEffect(() => {
    if (po && (!d || !d._dirty)) setD({ ...po, lines: (po.lines || []).map(toEdit), _dirty: false });
  }, [po]); // eslint-disable-line react-hooks/exhaustive-deps

  const skus = useMemo(() => [...new Set(products.map((p) => p.sku).filter(Boolean))].sort(), [products]);
  if (!po) return <div className="text-faint">PO not found. <a className="underline" href="#/history">Back to history</a></div>;
  if (!d) return null;

  const set = (patch) => setD((cur) => ({ ...cur, ...patch, _dirty: true }));
  const setLine = (key, patch) => set({ lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  const draftForMoney = { ...d, lines: d.lines.map((l) => ({ ...l, cost: lineCost(l) })) };
  const vendor = vendors.find((v) => v.id === d.supplierId);

  const save = async () => {
    setSaving(true);
    try {
      const lines = d.lines.filter((l) => (l.sizeLabel || "").trim() || l.description).map((l) => {
        const { key, perBoard, flat, ...rest } = l; // eslint-disable-line no-unused-vars
        const match = products.find((p) => p.sku === rest.sizeLabel);
        return { ...rest, productId: match?.id ?? rest.productId ?? null, boardCount: Number(rest.boardCount) || 0, copies: Math.max(1, Math.floor(Number(rest.copies) || 1)), cost: lineCost(l), ...(rest.description ? {} : { description: undefined }) };
      });
      const changes = {
        supplierId: d.supplierId, date: d.date, shipVia: d.shipVia || "", paymentStatus: d.paymentStatus || "Unpaid", paidVia: d.paidVia || "",
        shippingCost: Number(d.shippingCost) || 0, discountPct: poDiscountPct(d), note: d.note || "", lines,
      };
      changes.totalCost = poGoods(changes);
      const saved = await savePO(po.id, JSON.parse(JSON.stringify(changes)));
      setD({ ...saved, lines: (saved.lines || []).map(toEdit), _dirty: false });
      setFlash("Saved. Office and Ops see the change right away.");
      setTimeout(() => setFlash(""), 3000);
    } catch (e) {
      alert(`Couldn't save: ${e.message}`);
    }
    setSaving(false);
  };

  if (mode === "print") return <PrintPO po={draftForMoney} vendor={vendor} shop={settings.shop || {}} onBack={() => setMode("edit")} dirty={d._dirty} />;

  return (
    <div className="space-y-5">
      <a href="#/history" className="inline-flex items-center gap-1 text-sm text-faint hover:text-ink"><ChevronLeft size={15} /> History</a>
      <PageHeader title={<span className="flex items-center gap-3">PO <span className="font-mono text-lg text-faint">{po.number}</span></span>}
        sub={<span className="flex items-center gap-2">{vendor?.name || "Unknown vendor"} <Pill tone={po.status === "ordered" ? "warn" : "moss"}>{po.status === "ordered" ? "Ordered" : "Received"}</Pill>{po.truckloadNumber && <span className="font-mono text-xs">{po.truckloadNumber}</span>}</span>}>
        <Btn onClick={() => setMode("print")}><Printer size={14} /> Print</Btn>
        <Btn kind={d._dirty ? "primary" : "ghost"} onClick={save} disabled={saving || !d._dirty}><Save size={14} /> {d._dirty ? "Save" : "Saved"}</Btn>
      </PageHeader>

      {flash && <div className="rounded-lg bg-moss-light text-moss px-4 py-3 text-sm font-semibold">{flash}</div>}
      {po.status === "received" && <div className="rounded-lg bg-warn-light text-warn px-4 py-3 text-sm">This PO was already received in Ops. Changing lines here changes the PO and what you owe, not the inventory that was counted in.</div>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Vendor">
          <select className="field" value={d.supplierId || ""} onChange={(e) => set({ supplierId: e.target.value })}>
            {vendors.filter((v) => !v.hidden || v.id === d.supplierId).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" className="field" value={d.date || ""} onChange={(e) => set({ date: e.target.value })} /></Field>
        <Field label="Ship via"><input className="field" value={d.shipVia || ""} onChange={(e) => set({ shipVia: e.target.value })} /></Field>
        <Field label="Payment">
          <select className="field" value={d.paymentStatus || "Unpaid"} onChange={(e) => set({ paymentStatus: e.target.value })}>
            {PAYMENT.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
      </div>

      <Section title="Lines" action={<Btn kind="soft" onClick={() => set({ lines: [...d.lines, toEdit({ sizeLabel: "", boardCount: "", copies: 1, cost: 0, finish: "natural" })] })}><Plus size={14} /> Add a line</Btn>}>
        <datalist id="po-skus">{skus.map((s) => <option key={s} value={s} />)}</datalist>
        <div className="space-y-3">
          {d.lines.map((l) => (
            <div key={l.key} className="rounded-lg border border-kraft p-3">
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
                <Field label="Item / SKU" className="col-span-2 sm:col-span-2"><input className="field font-mono" list="po-skus" value={l.sizeLabel || ""} onChange={(e) => setLine(l.key, { sizeLabel: e.target.value })} /></Field>
                <Field label="Boards per unit"><input type="number" className="field" value={l.boardCount ?? ""} onChange={(e) => setLine(l.key, { boardCount: e.target.value })} /></Field>
                <Field label="Units"><input type="number" className="field" value={l.copies ?? ""} onChange={(e) => setLine(l.key, { copies: e.target.value })} /></Field>
                {(Number(l.boardCount) || 0) > 0
                  ? <Field label="$ per board"><input type="number" step="0.01" className="field" value={l.perBoard} onChange={(e) => setLine(l.key, { perBoard: e.target.value })} /></Field>
                  : <Field label="Line $"><input type="number" step="0.01" className="field" value={l.flat} onChange={(e) => setLine(l.key, { flat: e.target.value })} /></Field>}
                <div className="flex items-center justify-between gap-2 pb-2">
                  <span className="font-semibold">{money(lineCost(l))}</span>
                  <button className="text-faint hover:text-warn" title="Remove line" onClick={() => set({ lines: d.lines.filter((x) => x.key !== l.key) })}><Trash2 size={15} /></button>
                </div>
              </div>
              <input className="field mt-2 text-sm" value={l.description || ""} placeholder="Description (optional), like 4x6, 10 to 17 ft" onChange={(e) => setLine(l.key, { description: e.target.value })} />
            </div>
          ))}
        </div>
      </Section>

      <div className="grid sm:grid-cols-2 gap-4">
        <Section title="Notes">
          <textarea className="field min-h-24" value={d.note || ""} onChange={(e) => set({ note: e.target.value })} />
        </Section>
        <Section title="Totals">
          <div className="space-y-2 text-sm">
            <Line k="Subtotal" v={money(poSubtotal(draftForMoney))} />
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2">Discount
                <span className="relative">
                  <input type="number" step="0.5" min="0" max="100" className="field w-24 py-1 pr-6 text-right" value={d.discountPct ?? ""} placeholder="0" onChange={(e) => set({ discountPct: e.target.value })} />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-faint">%</span>
                </span>
              </label>
              <span>{poDiscount(draftForMoney) > 0 ? `-${money(poDiscount(draftForMoney))}` : money(0)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-kraft pt-2 font-bold text-base"><span>Total to vendor</span><span>{money(poGoods(draftForMoney))}</span></div>
            <div className="flex items-center justify-between gap-3 pt-2 text-faint">
              <label className="flex items-center gap-2">Freight (billed separately) $
                <input type="number" step="0.01" className="field w-28 py-1 text-right" value={d.shippingCost ?? ""} onChange={(e) => set({ shippingCost: e.target.value })} />
              </label>
            </div>
            <Line k="Boards" v={num(poBoards(draftForMoney))} faint />
          </div>
        </Section>
      </div>
      {d._dirty && <div className="text-xs text-faint flex items-center gap-1"><Pencil size={12} /> Unsaved changes</div>}
    </div>
  );
}

const Line = ({ k, v, faint }) => <div className={`flex justify-between ${faint ? "text-faint" : ""}`}><span>{k}</span><span>{v}</span></div>;

function PrintPO({ po, vendor, shop, onBack, dirty }) {
  const cell = { border: "1px solid #999", padding: "4pt 6pt" };
  const freight = Number(po.shippingCost) || 0;
  const pct = poDiscountPct(po);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-faint hover:text-ink mr-auto"><ChevronLeft size={15} /> Back to edit</button>
        <Btn kind="primary" onClick={() => window.print()}><Printer size={15} /> Print</Btn>
      </div>
      {dirty && <div className="text-sm text-warn print:hidden">Showing your unsaved changes. Go back and Save so the PO in the app matches what you print.</div>}
      <div className="overflow-auto print:overflow-visible">
        <div className="print-area">
          <div className="bg-white text-black mx-auto shadow print:shadow-none" style={{ width: "8.5in", minHeight: "11in", padding: "0.5in", boxSizing: "border-box", fontSize: "10pt" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #000", paddingBottom: "6pt", marginBottom: "10pt" }}>
              <div style={{ display: "flex", gap: "10pt", alignItems: "center" }}>
                <img src="/icon-192.png" alt="" style={{ height: "0.6in", width: "0.6in" }} />
                <div>
                  <div style={{ fontSize: "18pt", fontWeight: 800 }}>PURCHASE ORDER</div>
                  <div style={{ fontWeight: 700 }}>Good News Wood Salvation</div>
                  <div>{shop.address}</div>
                  <div>{formatPhone(shop.phone || "5304606083")}</div>
                </div>
              </div>
              <div style={{ textAlign: "right", lineHeight: 1.5 }}>
                <div><b>PO #</b> {po.number}</div>
                <div><b>Date</b> {po.date ? longDate(po.date) : ""}</div>
                {po.shipVia && <div><b>Ship via</b> {po.shipVia}</div>}
                {po.truckloadNumber && <div><b>Truckload</b> {po.truckloadNumber}</div>}
              </div>
            </div>

            <div style={{ marginBottom: "10pt", lineHeight: 1.4 }}>
              <div style={{ fontSize: "8pt", fontWeight: 700, color: "#555", letterSpacing: "0.06em" }}>VENDOR</div>
              <div style={{ fontWeight: 700, fontSize: "11pt" }}>{vendor?.name || "Unknown vendor"}</div>
              {vendor?.contact && <div>{vendor.contact}</div>}
              {vendor?.pv?.pickup_address && <div>{vendor.pv.pickup_address}</div>}
              {vendor?.phone && <div>{formatPhone(vendor.phone)}</div>}
              {vendor?.email && <div>{vendor.email}</div>}
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#ececec" }}>
                  {["Item", "Description", "Boards / unit", "Units", "Boards", "Amount"].map((h, i) => <th key={h} style={{ ...cell, textAlign: i > 1 ? "right" : "left", fontSize: "8.5pt" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(po.lines || []).map((l, i) => (
                  <tr key={i}>
                    <td style={{ ...cell, fontFamily: "monospace", fontWeight: 700 }}>{l.sizeLabel}</td>
                    <td style={cell}>{l.description || ""}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{num(l.boardCount)}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{num(l.copies || 1)}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{num((Number(l.boardCount) || 0) * (Number(l.copies) || 1))}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{money(l.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table style={{ marginLeft: "auto", marginTop: "8pt", borderCollapse: "collapse", minWidth: "3in" }}>
              <tbody>
                <tr><td style={{ padding: "2pt 8pt" }}>Subtotal</td><td style={{ padding: "2pt 0", textAlign: "right" }}>{money(poSubtotal(po))}</td></tr>
                <tr><td style={{ padding: "2pt 8pt" }}>Discount ({pct}%)</td><td style={{ padding: "2pt 0", textAlign: "right" }}>{poDiscount(po) > 0 ? `-${money(poDiscount(po))}` : money(0)}</td></tr>
                <tr style={{ borderTop: "2px solid #000", fontWeight: 800, fontSize: "11pt" }}><td style={{ padding: "4pt 8pt" }}>Total to invoice</td><td style={{ padding: "4pt 0", textAlign: "right" }}>{money(poGoods(po))}</td></tr>
              </tbody>
            </table>

            {freight > 0 && <div style={{ marginTop: "8pt", fontSize: "9pt" }}>Freight of {money(freight)} is billed separately and is not part of the total above.</div>}
            {po.note && <div style={{ marginTop: "10pt" }}><b>Notes:</b> {po.note}</div>}
            <div style={{ marginTop: "24pt", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24pt", fontSize: "8pt", color: "#444" }}>
              <div style={{ borderTop: "1px solid #000", paddingTop: "2pt" }}>Authorized by</div>
              <div style={{ borderTop: "1px solid #000", paddingTop: "2pt" }}>Date</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
