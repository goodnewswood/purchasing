import { useMemo, useState } from "react";
import { useData } from "../store.jsx";
import { money, num, shortDate } from "../lib/format";
import { go } from "../lib/nav";
import { poGoods } from "../lib/po";
import { PageHeader, Section, Stat, Pill, Empty } from "../ui.jsx";

/* Everything we've bought: the old Purchase Tracking sheet plus POs placed
   in the apps. Used for cost per board, who we lean on, and trends. */
export default function History() {
  const { purchases, pos, vendors } = useData();
  const [range, setRange] = useState("all");
  const vName = (id) => vendors.find((v) => v.id === id)?.name;

  const rows = useMemo(() => {
    // Some sheet rows were later entered as POs too. Skip a sheet row when a
    // PO for the same vendor has the same goods total, so nothing counts twice.
    const dupe = (p) => pos.some((po) => po.supplierId === p.supplier_id && p.cost != null
      && Math.abs((po.lines || []).reduce((s, l) => s + (Number(l.cost) || 0), 0) - Number(p.cost)) < 1);
    const fromSheet = purchases.filter((p) => !dupe(p)).map((p) => ({
      key: `s-${p.id}`, source: "Sheet", supplierId: p.supplier_id, vendor: vName(p.supplier_id) || p.vendor_name,
      date: p.date, boards: Number(p.boards) || 0, goods: Number(p.cost) || 0, freight: Number(p.shipping) || 0,
      paid: p.payment_status, paidVia: p.paid_via, detail: p.pricing, notes: p.notes,
    }));
    const fromPOs = pos.filter((p) => !p.archived).map((p) => ({
      key: `p-${p.id}`, source: p.number, supplierId: p.supplierId, vendor: vName(p.supplierId) || "Unknown vendor",
      date: p.date, boards: (p.lines || []).reduce((s, l) => s + (Number(l.boardCount) || 0) * (Number(l.copies) || 1), 0),
      goods: poGoods(p), freight: Number(p.shippingCost) || 0, poId: p.id,
      paid: p.paymentStatus, paidVia: p.paidVia, detail: (p.lines || []).map((l) => `${l.copies || 1} x ${l.sizeLabel}`).join(", "),
      notes: p.status === "ordered" ? "Ordered, not received" : "",
    }));
    const cutoff = range === "all" ? null : new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 10);
    return [...fromSheet, ...fromPOs]
      .filter((r) => !cutoff || (r.date && r.date >= cutoff))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [purchases, pos, vendors, range]);

  const priced = rows.filter((r) => r.boards > 0 && r.goods > 0);
  const totals = {
    spend: rows.reduce((s, r) => s + r.goods + r.freight, 0),
    boards: rows.reduce((s, r) => s + r.boards, 0),
    landed: priced.reduce((s, r) => s + r.goods + r.freight, 0) / (priced.reduce((s, r) => s + r.boards, 0) || 1),
    freight: rows.reduce((s, r) => s + r.freight, 0),
  };

  const byVendor = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      const k = r.supplierId || r.vendor;
      const x = (m[k] = m[k] || { k, id: r.supplierId, vendor: r.vendor, buys: 0, boards: 0, goods: 0, freight: 0, pricedBoards: 0, pricedCost: 0, last: null });
      x.buys++; x.boards += r.boards; x.goods += r.goods; x.freight += r.freight;
      if (r.boards > 0 && r.goods > 0) { x.pricedBoards += r.boards; x.pricedCost += r.goods + r.freight; }
      if (r.date && (!x.last || r.date > x.last)) x.last = r.date;
    });
    return Object.values(m).sort((a, b) => b.boards - a.boards);
  }, [rows]);

  return (
    <div className="space-y-5">
      <PageHeader title="Purchase history" sub="The old tracking sheet plus every PO since">
        <select className="field w-auto" value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="all">All time</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
        </select>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Spent" value={money(totals.spend)} sub={`${rows.length} purchases`} />
        <Stat label="Boards" value={num(totals.boards)} />
        <Stat label="Landed $/board" value={`$${totals.landed.toFixed(3)}`} sub="goods plus freight" />
        <Stat label="Freight" value={money(totals.freight)} />
      </div>

      <Section title="By vendor">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-faint font-mono">
              <th className="py-2">Vendor</th><th className="py-2 text-right">Buys</th><th className="py-2 text-right">Boards</th><th className="py-2 text-right">Spent</th><th className="py-2 text-right">Landed $/bd</th><th className="py-2 text-right">Last</th>
            </tr></thead>
            <tbody className="divide-y divide-kraft">
              {byVendor.map((x) => (
                <tr key={x.k} className={x.id ? "cursor-pointer hover:bg-paper/60" : ""} onClick={() => x.id && go(`vendors/${x.id}`)}>
                  <td className="py-2 font-semibold">{x.vendor}</td>
                  <td className="py-2 text-right">{x.buys}</td>
                  <td className="py-2 text-right">{num(x.boards)}</td>
                  <td className="py-2 text-right">{money(x.goods + x.freight)}</td>
                  <td className="py-2 text-right font-mono">{x.pricedBoards ? `$${(x.pricedCost / x.pricedBoards).toFixed(3)}` : ""}</td>
                  <td className="py-2 text-right text-faint">{shortDate(x.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Every purchase">
        {rows.length === 0 ? <Empty>Nothing in this range.</Empty> : (
          <div className="divide-y divide-kraft">
            {rows.map((r) => (
              <div key={r.key} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="w-16 text-faint">{r.date ? shortDate(r.date) : "No date"}</span>
                <span className="font-semibold min-w-32">{r.vendor}</span>
                {r.poId ? <a href={`#/po/${r.poId}`} className="font-mono text-xs font-semibold text-redwood underline underline-offset-2">{r.source}</a> : <Pill>{r.source}</Pill>}
                <span className="text-faint text-xs flex-1 min-w-40 truncate">{r.detail}{r.notes ? ` · ${r.notes}` : ""}</span>
                <span className="text-xs">{r.boards ? `${num(r.boards)} bd` : ""}</span>
                <span className="font-semibold w-24 text-right">{money(r.goods + r.freight)}</span>
                <Pill tone={r.paid === "Paid" ? "moss" : "warn"}>{r.paid || "Unpaid"}{r.paidVia ? ` · ${r.paidVia}` : ""}</Pill>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
