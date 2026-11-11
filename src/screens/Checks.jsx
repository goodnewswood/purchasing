import { useState } from "react";
import { Plus, Printer, ChevronLeft, Ban } from "lucide-react";
import { useData } from "../store.jsx";
import { money, shortDate, longDate, amountInWords } from "../lib/format";
import { today } from "../lib/db";
import { go } from "../lib/nav";
import { PageHeader, Section, Field, Btn, Pill, Empty, Modal } from "../ui.jsx";

const poGoods = (p) => (p.lines || []).reduce((s, l) => s + (Number(l.cost) || 0), 0);

export default function Checks({ id }) {
  const { checks } = useData();
  if (id === "test") return <PrintCheck check="test" />;
  if (id) {
    const c = checks.find((x) => x.id === id);
    return c ? <PrintCheck check={c} /> : <div className="text-faint">Check not found.</div>;
  }
  return <CheckList />;
}

function CheckList() {
  const { checks, vendors } = useData();
  const [writing, setWriting] = useState(false);
  const vName = (sid) => vendors.find((v) => v.id === sid)?.name;
  return (
    <div className="space-y-5">
      <PageHeader title="Checks" sub="Write and print vendor checks on QuickBooks voucher stock">
        <Btn onClick={() => go("checks/test")}><Printer size={15} /> Test alignment</Btn>
        <Btn kind="primary" onClick={() => setWriting(true)}><Plus size={15} /> Write a check</Btn>
      </PageHeader>
      <Section>
        {checks.length === 0 ? <Empty>No checks written yet.</Empty> : (
          <div className="divide-y divide-kraft">
            {checks.map((c) => (
              <button key={c.id} onClick={() => go(`checks/${c.id}`)} className="w-full flex flex-wrap items-center gap-3 py-3 text-left hover:bg-paper/60 rounded px-1">
                <span className="font-mono font-semibold w-16">#{c.number}</span>
                <span className="text-sm text-faint w-16">{shortDate(c.date)}</span>
                <span className="font-semibold flex-1">{c.payee || vName(c.supplier_id)}</span>
                {c.status === "void" && <Pill tone="warn">Void</Pill>}
                <span className={`font-bold ${c.status === "void" ? "line-through text-faint" : ""}`}>{money(c.amount)}</span>
              </button>
            ))}
          </div>
        )}
      </Section>
      {writing && <WriteCheck onClose={() => setWriting(false)} />}
    </div>
  );
}

function WriteCheck({ onClose }) {
  const { vendors, pos, settings, saveCheck, saveSetting, markPOsPaid } = useData();
  const cs = settings.checks || { nextNumber: 1001 };
  const [sid, setSid] = useState("");
  const [payee, setPayee] = useState("");
  const [picked, setPicked] = useState([]);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [date, setDate] = useState(today());
  const [number, setNumber] = useState(String(cs.nextNumber || 1001));
  const [busy, setBusy] = useState(false);

  const unpaid = pos.filter((p) => p.supplierId === sid && p.paymentStatus !== "Paid" && !p.archived);

  const pickVendor = (id) => {
    const nv = vendors.find((x) => x.id === id);
    setSid(id); setPicked([]); setAmount("");
    setPayee(nv?.pv.check_payee || nv?.name || "");
  };
  const toggle = (p) => {
    const next = picked.includes(p.id) ? picked.filter((x) => x !== p.id) : [...picked, p.id];
    setPicked(next);
    const sum = pos.filter((x) => next.includes(x.id)).reduce((s, x) => s + poGoods(x), 0);
    setAmount(sum ? sum.toFixed(2) : "");
    setMemo(pos.filter((x) => next.includes(x.id)).map((x) => x.number).join(", "));
  };

  const save = async () => {
    setBusy(true);
    const n = Number(number);
    const row = await saveCheck({ number: n, date, supplier_id: sid || null, payee, amount: Number(amount), memo, po_ids: picked, status: "printed" });
    await saveSetting("checks", { ...cs, nextNumber: n + 1 });
    await markPOsPaid(picked, `Check #${n}`);
    setBusy(false);
    onClose();
    go(`checks/${row.id}`);
  };

  return (
    <Modal title="Write a check" onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Vendor">
          <select className="field" value={sid} onChange={(e) => pickVendor(e.target.value)}>
            <option value="">Pick vendor</option>
            {vendors.filter((x) => !x.hidden).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Check #"><input className="field font-mono" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Date"><input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Pay to the order of" className="sm:col-span-2"><input className="field" value={payee} onChange={(e) => setPayee(e.target.value)} /></Field>
      </div>

      {sid && (
        <div className="mt-4">
          <span className="label">Unpaid POs</span>
          {unpaid.length === 0 ? <div className="text-sm text-faint">None. Type an amount below.</div> : (
            <div className="divide-y divide-kraft rounded-lg border border-kraft">
              {unpaid.map((p) => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p)} />
                  <span className="font-mono">{p.number}</span>
                  <span className="text-faint">{shortDate(p.date)}</span>
                  <Pill tone={p.status === "ordered" ? "warn" : "moss"}>{p.status === "ordered" ? "Not received" : "Received"}</Pill>
                  <span className="ml-auto font-semibold">{money(poGoods(p))}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <Field label="Amount"><input type="number" step="0.01" className="field text-lg font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Memo"><input className="field" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
      </div>
      {Number(amount) > 0 && <div className="text-sm text-faint mt-2 italic">{amountInWords(amount)} dollars</div>}
      <div className="text-xs text-faint mt-3">Saving marks the picked POs paid by this check number, in Office and Ops too. Freight isn't included; that's billed separately.</div>
      <div className="flex justify-end gap-2 mt-4">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={busy || !payee || !(Number(amount) > 0) || !number} onClick={save}><Printer size={15} /> Save and print</Btn>
      </div>
    </Modal>
  );
}

/* QuickBooks voucher layout: the check fills the top third of a letter
   sheet and two matching stubs fill the rest. Positions are in inches from
   the sheet's top left; Settings has a nudge for printers that sit off. */
function PrintCheck({ check }) {
  const { vendors, pos, settings, saveCheck } = useData();
  const isTest = check === "test";
  const cs = settings.checks || {};
  const dx = Number(cs.offsetX) || 0;
  const dy = Number(cs.offsetY) || 0;
  const c = isTest ? { number: 1234, date: today(), payee: "Sample Vendor Name", amount: 1234.56, memo: "PO-2026-0001", po_ids: [] } : check;
  const v = vendors.find((x) => x.id === c.supplier_id);
  const address = v?.pv.mailing_address || "";
  const paidPOs = pos.filter((p) => (c.po_ids || []).includes(p.id));
  const at = (x, y) => ({ position: "absolute", left: `${x + dx}in`, top: `${y + dy}in` });

  const Stub = ({ top }) => (
    <div style={{ position: "absolute", left: `${0.5 + dx}in`, top: `${top + dy}in`, width: "7.5in", fontSize: "10pt" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
        <span>{c.payee}</span><span>{longDate(c.date)}</span><span>Check #{c.number}</span>
      </div>
      <div style={{ borderTop: "1px solid #000", marginTop: "0.08in", paddingTop: "0.08in" }}>
        {paidPOs.length ? paidPOs.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{p.number} · {shortDate(p.date)} · {(p.lines || []).map((l) => `${l.copies || 1} x ${l.sizeLabel}`).join(", ")}</span>
            <span>{money(poGoods(p))}</span>
          </div>
        )) : <div>{c.memo}</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", fontWeight: 700, marginTop: "0.1in" }}>Total {money(c.amount)}</div>
      <div style={{ marginTop: "0.05in", fontSize: "8pt" }}>Good News Wood Salvation</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <a href="#/checks" className="inline-flex items-center gap-1 text-sm text-faint hover:text-ink mr-auto"><ChevronLeft size={15} /> All checks</a>
        {!isTest && c.status !== "void" && <Btn onClick={() => { if (confirm("Void this check? It stays in the list marked void.")) saveCheck({ ...c, status: "void" }); }}><Ban size={14} /> Void</Btn>}
        <Btn kind="primary" onClick={() => window.print()}><Printer size={15} /> Print</Btn>
      </div>
      <div className="text-xs text-faint print:hidden">
        {isTest ? "Print this on plain paper, hold it over a blank check, and nudge the offset in Settings until it lines up." : "Load voucher check stock face up, check on top. Print at actual size, no scaling, no margins."}
      </div>
      <div className="overflow-auto print:overflow-visible">
        <div className="print-area bg-white shadow-sm mx-auto" style={{ position: "relative", width: "8.5in", height: "11in", fontFamily: "Helvetica, Arial, sans-serif", color: "#000" }}>
          <div style={{ ...at(6.6, 0.68), fontSize: "11pt" }}>{new Date(`${c.date}T12:00:00`).toLocaleDateString("en-US")}</div>
          <div style={{ ...at(1.0, 1.28), fontSize: "11pt", fontWeight: 700 }}>{c.payee}</div>
          <div style={{ ...at(6.85, 1.28), fontSize: "11pt", fontWeight: 700 }}>**{Number(c.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div style={{ ...at(0.5, 1.63), fontSize: "10pt", width: "6.2in" }}>{amountInWords(c.amount)}{"*".repeat(Math.max(0, 60 - amountInWords(c.amount).length))}</div>
          <div style={{ ...at(1.0, 1.98), fontSize: "10pt", whiteSpace: "pre-line" }}>{c.payee}{address ? `\n${address}` : ""}</div>
          <div style={{ ...at(0.6, 2.88), fontSize: "9pt" }}>{c.memo}</div>
          {isTest && <div style={{ ...at(0, 3.5), width: "8.5in", borderTop: "1px dashed #999" }} />}
          <Stub top={3.95} />
          <Stub top={7.62} />
        </div>
      </div>
    </div>
  );
}
