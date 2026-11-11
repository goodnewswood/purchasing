import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import { useData } from "../store.jsx";
import { money, num } from "../lib/format";
import { SIZES } from "../lib/catalog";
import { PageHeader, Stat } from "../ui.jsx";

/* Twelve reports on what we spend and who we buy from. Money comes from the
   QuickBooks snapshot saved in pur_settings (qbo_vendor_spend). Boards, landed
   cost and contacts come from POs, the old tracking sheet and the activity log. */

// Fixed color order, checked for colorblind separation. Colors stick to a
// thing (Wood is always blue) so hiding one never repaints the others.
const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const OTHER = "#a8a29e";
const CATEGORIES = ["Wood", "Freight", "Labor", "Milling & finishing", "Parcel shipping", "Packaging", "No vendor", "Needs a category", "Everything else"];
const CAT_COLOR = Object.fromEntries(CATEGORIES.map((c, i) => [c, PALETTE[i] || OTHER]));
const KIND_LABEL = { call: "Call", text: "Text", visit: "Visit", email: "Email", note: "Note" };
const KIND_COLOR = { call: PALETTE[0], text: PALETTE[1], visit: PALETTE[2], email: PALETTE[3], note: PALETTE[4] };
const SIZE_COLOR = { 165: PALETTE[0], 166: PALETTE[1], 185: PALETTE[2], 186: PALETTE[3], 164: PALETTE[4], 184: PALETTE[5], DF: PALETTE[6] };
const TIER_COLOR = { "Tier 1": PALETTE[0], "Tier 2": PALETTE[1], "Tier 3": PALETTE[2], "No tier": OTHER, "Not in the app": "#d6d3d1" };

const ymd = (d) => d.toISOString().slice(0, 10);
const monthKey = (s) => (s || "").slice(0, 7);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (k) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;
const kMoney = (n) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`);
// Long QuickBooks names ("Hennessey's Fencing - Ricardo Oropeza") crowd the axis.
const short = (s) => { const t = String(s || "").split(/ - |,/)[0]; return t.length > 20 ? `${t.slice(0, 19)}…` : t; };
const pct = (n) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;

function monthsBetween(from, to) {
  const out = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  for (let i = 0; i < 120; i++) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    if (k > end) break;
    out.push(k);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

const PRESETS = [
  { id: "ytd", label: "Year to date" },
  { id: "m3", label: "Last 3 months" },
  { id: "m6", label: "Last 6 months" },
  { id: "m12", label: "Last 12 months" },
  { id: "q", label: "This quarter" },
  { id: "custom", label: "Custom" },
];
function presetRange(id) {
  const now = new Date();
  const back = (n) => new Date(now.getFullYear(), now.getMonth() - n + 1, 1);
  if (id === "m3") return [ymd(back(3)), ymd(now)];
  if (id === "m6") return [ymd(back(6)), ymd(now)];
  if (id === "m12") return [ymd(back(12)), ymd(now)];
  if (id === "q") return [ymd(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), ymd(now)];
  return [`${now.getFullYear()}-01-01`, ymd(now)];
}

/* The old sheet only has a notes column like "(9) 185 $2565, (3) 185p".
   A small number is units, a big one is boards. */
function parseSheetBoards(text) {
  const out = {};
  const re = /\((\d+(?:\.\d+)?)\)\s*(16[456]|18[456])p?/gi;
  let m;
  while ((m = re.exec(text || ""))) {
    const n = Number(m[1]);
    const size = SIZES.find((s) => s.code === m[2]);
    out[m[2]] = (out[m[2]] || 0) + (n < 100 ? n * (size?.boardsPerUnit || 0) : n);
  }
  return out;
}

export default function Reports() {
  const { settings, vendors, zones, pos, purchases, activities } = useData();
  const snap = settings.qbo_vendor_spend;
  const [preset, setPreset] = useState("ytd");
  const [custom, setCustom] = useState(() => presetRange("ytd"));
  const [from, to] = preset === "custom" ? custom : presetRange(preset);
  const [cats, setCats] = useState(() => new Set(CATEGORIES));
  const toggleCat = (c) => setCats((cur) => { const n = new Set(cur); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  const months = useMemo(() => monthsBetween(from, to), [from, to]);
  const inMonth = (k) => k >= monthKey(from) && k <= monthKey(to);
  const inRange = (d) => d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
  const vById = useMemo(() => Object.fromEntries(vendors.map((v) => [v.id, v])), [vendors]);
  const zoneName = (id) => zones.find((z) => z.id === id)?.name;

  // QuickBooks rows trimmed to the chosen months.
  const qbo = useMemo(() => (snap?.rows || []).map((r) => {
    const m = Object.fromEntries(Object.entries(r.months || {}).filter(([k]) => inMonth(k)));
    return { ...r, m, total: Object.values(m).reduce((s, x) => s + x, 0) };
  }), [snap, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = qbo.filter((r) => cats.has(r.category));

  // One line per real vendor (QuickBooks has California Fences twice).
  const woodVendors = useMemo(() => {
    const g = {};
    qbo.filter((r) => r.category === "Wood").forEach((r) => {
      const k = r.supplierId || r.name;
      const x = (g[k] = g[k] || { key: k, name: vById[r.supplierId]?.name || r.name, supplierId: r.supplierId, total: 0, m: {} });
      x.total += r.total;
      Object.entries(r.m).forEach(([mk, v]) => { x.m[mk] = (x.m[mk] || 0) + v; });
    });
    return Object.values(g).filter((x) => Math.abs(x.total) > 0.5).sort((a, b) => b.total - a.total);
  }, [qbo, vById]);
  const woodTotal = woodVendors.reduce((s, v) => s + v.total, 0);
  const catTotal = (c) => qbo.filter((r) => r.category === c).reduce((s, r) => s + r.total, 0);

  // Purchases from the sheet and POs, deduped the same way History does it.
  const buys = useMemo(() => {
    const dupe = (p) => pos.some((po) => po.supplierId === p.supplier_id && p.cost != null
      && Math.abs((po.lines || []).reduce((s, l) => s + (Number(l.cost) || 0), 0) - Number(p.cost)) < 1);
    const sheet = purchases.filter((p) => !dupe(p)).map((p) => ({
      supplierId: p.supplier_id, vendor: vById[p.supplier_id]?.name || p.vendor_name, date: p.date,
      boards: Number(p.boards) || 0, goods: Number(p.cost) || 0, freight: Number(p.shipping) || 0, bySize: parseSheetBoards(p.pricing),
    }));
    const fromPOs = pos.filter((p) => !p.archived).map((p) => {
      const bySize = {};
      (p.lines || []).forEach((l) => {
        const size = String(l.sizeLabel || "").replace(/RAW$/i, "");
        bySize[size] = (bySize[size] || 0) + (Number(l.boardCount) || 0) * (Number(l.copies) || 1);
      });
      return {
        supplierId: p.supplierId, vendor: vById[p.supplierId]?.name || "Unknown", date: p.date, status: p.status,
        boards: Object.values(bySize).reduce((s, x) => s + x, 0), goods: (p.lines || []).reduce((s, l) => s + (Number(l.cost) || 0), 0),
        freight: Number(p.shippingCost) || 0, bySize,
      };
    });
    return [...sheet, ...fromPOs].filter((b) => inRange(b.date));
  }, [purchases, pos, vById, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const acts = activities.filter((a) => inRange(a.at));

  /* ---------- Report data ---------- */
  const r1 = months.map((k) => ({ label: monthLabel(k), ...Object.fromEntries(CATEGORIES.filter((c) => cats.has(c)).map((c) => [c, qbo.filter((r) => r.category === c).reduce((s, r) => s + (r.m[k] || 0), 0)])) }));
  const r2 = CATEGORIES.filter((c) => cats.has(c)).map((c) => ({ name: c, value: catTotal(c), color: CAT_COLOR[c] })).filter((x) => x.value > 0);
  const r3 = woodVendors.slice(0, 12).map((v) => ({ name: v.name, value: v.total }));
  const top5 = woodVendors.slice(0, 5);
  const r4 = months.map((k, i) => {
    const row = { label: monthLabel(k) };
    top5.forEach((v) => { row[v.name] = months.slice(0, i + 1).reduce((s, mk) => s + (v.m[mk] || 0), 0); });
    return row;
  });
  const groupWood = (fn) => {
    const g = {};
    woodVendors.forEach((v) => { const k = fn(v); g[k] = (g[k] || 0) + v.total; });
    return Object.entries(g).map(([name, value]) => ({ name, value })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  };
  const r5 = groupWood((v) => { const t = v.supplierId && vById[v.supplierId]?.pv?.tier; return !v.supplierId || !vById[v.supplierId] ? "Not in the app" : t ? `Tier ${t}` : "No tier"; })
    .map((x) => ({ ...x, color: TIER_COLOR[x.name] }));
  const r6 = groupWood((v) => zoneName(vById[v.supplierId]?.pv?.zone_id) || "No zone yet");
  const r7 = months.map((k) => {
    const sum = (c) => qbo.filter((r) => r.category === c).reduce((s, r) => s + (r.m[k] || 0), 0);
    return { label: monthLabel(k), Wood: sum("Wood"), Freight: sum("Freight"), "Milling & finishing": sum("Milling & finishing") };
  });
  let run = 0;
  const r8 = woodVendors.filter((v) => v.total > 0).map((v) => { const share = v.total / (woodTotal || 1); run += share; return { name: v.name, Share: share, "Running total": run }; });
  const r9 = months.map((k) => {
    const row = { label: monthLabel(k) };
    buys.filter((b) => monthKey(b.date) === k).forEach((b) => Object.entries(b.bySize).forEach(([s, n]) => { row[s] = (row[s] || 0) + n; }));
    return row;
  });
  const r9sizes = SIZES.map((s) => s.code).filter((c) => r9.some((r) => r[c]));
  const landed = {};
  buys.filter((b) => b.boards > 0 && b.goods > 0).forEach((b) => {
    const x = (landed[b.vendor] = landed[b.vendor] || { boards: 0, goods: 0, freight: 0 });
    x.boards += b.boards; x.goods += b.goods; x.freight += b.freight;
  });
  const r10 = Object.entries(landed).map(([name, x]) => ({ name, Goods: x.goods / x.boards, Freight: x.freight / x.boards, boards: x.boards }))
    .sort((a, b) => (a.Goods + a.Freight) - (b.Goods + b.Freight));
  // Weeks start Monday.
  const weekOf = (d) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return ymd(x); };
  const weeks = {};
  acts.forEach((a) => { const w = weekOf(a.at); weeks[w] = weeks[w] || { label: `${MONTHS[Number(w.slice(5, 7)) - 1]} ${Number(w.slice(8))}` }; weeks[w][a.kind] = (weeks[w][a.kind] || 0) + 1; });
  const r11 = Object.keys(weeks).sort().map((w) => weeks[w]);
  const r11kinds = Object.keys(KIND_LABEL).filter((k) => r11.some((r) => r[k]));
  // Latest stock report per vendor inside the range, against POs still on the way.
  const latest = {};
  acts.forEach((a) => { if (a.stock && Object.values(a.stock).some((x) => Number(x) > 0) && (!latest[a.supplier_id] || a.at > latest[a.supplier_id].at)) latest[a.supplier_id] = a; });
  const r12 = ["165", "166", "185", "186", "164", "184", "DF"].map((s) => {
    const avail = Object.values(latest).reduce((t, a) => t + (Number(a.stock?.[s]) || 0) + (Number(a.stock?.[`${s}p`]) || 0), 0);
    const onOrder = pos.filter((p) => p.status === "ordered" && !p.archived && inRange(p.date))
      .reduce((t, p) => t + (p.lines || []).filter((l) => String(l.sizeLabel).replace(/RAW$/i, "") === s).reduce((u, l) => u + (Number(l.copies) || 0), 0), 0);
    return { name: s, "Vendors have": avail, "On order": onOrder };
  }).filter((r) => r["Vendors have"] || r["On order"]);

  const totalShown = shown.reduce((s, r) => s + r.total, 0);
  const freight = catTotal("Freight");
  const noData = !snap;

  return (
    <div className="space-y-5">
      <PageHeader title="Reports" sub={snap ? `QuickBooks pulled ${new Date(snap.pulledAt).toLocaleDateString()} (cash basis, ${snap.start} to ${snap.end})` : "No QuickBooks snapshot saved yet"} />

      {/* One filter row for every report. */}
      <div className="card p-3 md:sticky md:top-0 z-20 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-lg bg-paper p-1">
            {PRESETS.map((p) => (
              <button key={p.id} onClick={() => { if (p.id === "custom") setCustom([from, to]); setPreset(p.id); }}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${preset === p.id ? "bg-white shadow-sm text-ink" : "text-faint hover:text-ink"}`}>{p.label}</button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-1.5 text-sm">
              <input type="date" className="field w-auto py-1" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} />
              <span className="text-faint">to</span>
              <input type="date" className="field w-auto py-1" value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} />
            </div>
          )}
          {preset !== "custom" && <span className="text-xs text-faint font-mono">{from} to {to}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label mb-0 mr-1">Categories</span>
          {CATEGORIES.map((c) => (
            <Chip key={c} on={cats.has(c)} color={CAT_COLOR[c]} onClick={() => toggleCat(c)}>{c}</Chip>
          ))}
          <button className="text-xs text-faint underline ml-1" onClick={() => setCats(new Set(cats.size === CATEGORIES.length ? ["Wood"] : CATEGORIES))}>
            {cats.size === CATEGORIES.length ? "Just wood" : "All"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Spend, selected categories" value={money(totalShown)} sub={`${months.length} month${months.length === 1 ? "" : "s"}`} />
        <Stat label="Wood" value={money(woodTotal)} sub={`${woodVendors.length} vendors paid`} />
        <Stat label="Freight per $1 of wood" value={woodTotal > 0 ? `$${(freight / woodTotal).toFixed(2)}` : "None"} sub={money(freight)} />
        <Stat label="Top vendor share" value={woodVendors[0] && woodTotal > 0 ? pct(woodVendors[0].total / woodTotal) : "None"} sub={woodVendors[0]?.name} />
      </div>

      {noData && <div className="card p-4 text-sm text-faint">Money reports need the QuickBooks snapshot. Ask Claude to pull it again.</div>}

      <div className="grid lg:grid-cols-2 gap-4">
        <Report n={1} title="Spending by month" sub="Selected categories, stacked" wide
          table={{ cols: ["Month", ...CATEGORIES.filter((c) => cats.has(c))], rows: r1.map((r) => [r.label, ...CATEGORIES.filter((c) => cats.has(c)).map((c) => money(r[c]))]) }}
          series={CATEGORIES.filter((c) => cats.has(c)).map((c) => ({ key: c, color: CAT_COLOR[c] }))}
          render={(on) => (
            <BarChart data={r1} margin={M}>
              {grid}{xAxis("label")}{yAxis(kMoney)}
              <Tooltip cursor={CURSOR} content={<Tip fmt={money} total />} />
              {on.map((s, i) => <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="#fff" strokeWidth={1.5} maxBarSize={36} radius={i === on.length - 1 ? [4, 4, 0, 0] : 0} />)}
            </BarChart>
          )} />

        <Report n={2} title="Spending mix" sub="Share of the selected categories"
          table={{ cols: ["Category", "Spent", "Share"], rows: r2.map((x) => [x.name, money(x.value), pct(x.value / (totalShown || 1))]) }}
          series={r2.map((x) => ({ key: x.name, color: x.color }))}
          render={(on) => <Donut data={r2.filter((x) => on.some((s) => s.key === x.name))} />} />

        <Report n={3} title="Top wood vendors" sub="Paid in QuickBooks"
          table={{ cols: ["Vendor", "Paid", "Share of wood"], rows: woodVendors.map((v) => [v.name, money(v.total), pct(v.total / (woodTotal || 1))]) }}
          render={() => (
            <BarChart data={r3} layout="vertical" margin={{ ...M, left: 8 }}>
              <CartesianGrid horizontal={false} stroke="#ece6da" />
              <XAxis type="number" tickFormatter={kMoney} {...AXIS} />
              <YAxis type="category" dataKey="name" width={150} interval={0} tickFormatter={short} {...AXIS} tick={{ fontSize: 11, fill: "#5d554b" }} />
              <Tooltip cursor={CURSOR} content={<Tip fmt={money} />} />
              <Bar dataKey="value" name="Paid" fill={PALETTE[0]} maxBarSize={20} radius={[0, 4, 4, 0]} />
            </BarChart>
          )} tall />

        <Report n={4} title="Wood vendor trends" sub="Running total paid, top five vendors"
          table={{ cols: ["Month", ...top5.map((v) => v.name)], rows: r4.map((r) => [r.label, ...top5.map((v) => money(r[v.name]))]) }}
          series={top5.map((v, i) => ({ key: v.name, color: PALETTE[i] }))}
          render={(on) => (
            <LineChart data={r4} margin={M}>
              {grid}{xAxis("label")}{yAxis(kMoney)}
              <Tooltip cursor={LINE_CURSOR} content={<Tip fmt={money} />} />
              {on.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />)}
            </LineChart>
          )} />

        <Report n={5} title="Wood by vendor tier" sub="Tier 1 is our truckload producers"
          table={{ cols: ["Tier", "Paid", "Share"], rows: r5.map((x) => [x.name, money(x.value), pct(x.value / (woodTotal || 1))]) }}
          series={r5.map((x) => ({ key: x.name, color: x.color }))}
          render={(on) => <Donut data={r5.filter((x) => on.some((s) => s.key === x.name))} />} />

        <Report n={6} title="Wood by zone" sub="Where our wood money goes"
          table={{ cols: ["Zone", "Paid", "Share"], rows: r6.map((x) => [x.name, money(x.value), pct(x.value / (woodTotal || 1))]) }}
          render={() => (
            <BarChart data={r6} margin={M}>
              {grid}{xAxis("name")}{yAxis(kMoney)}
              <Tooltip cursor={CURSOR} content={<Tip fmt={money} />} />
              <Bar dataKey="value" name="Paid" fill={PALETTE[0]} maxBarSize={36} radius={[4, 4, 0, 0]} />
            </BarChart>
          )} />

        <Report n={7} title="Wood, freight and finishing" sub="What it takes to land a board, by month"
          table={{ cols: ["Month", "Wood", "Freight", "Milling & finishing"], rows: r7.map((r) => [r.label, money(r.Wood), money(r.Freight), money(r["Milling & finishing"])]) }}
          series={["Wood", "Freight", "Milling & finishing"].map((c) => ({ key: c, color: CAT_COLOR[c] }))}
          render={(on) => (
            <LineChart data={r7} margin={M}>
              {grid}{xAxis("label")}{yAxis(kMoney)}
              <Tooltip cursor={LINE_CURSOR} content={<Tip fmt={money} />} />
              {on.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={{ r: 3, fill: s.color, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />)}
            </LineChart>
          )} />

        <Report n={8} title="How spread out our wood buying is" sub="Each vendor's share, with the running total. A steep line means we lean on a few."
          table={{ cols: ["Vendor", "Share", "Running total"], rows: r8.map((r) => [r.name, pct(r.Share), pct(r["Running total"])]) }}
          series={[{ key: "Share", color: PALETTE[0] }, { key: "Running total", color: PALETTE[1] }]}
          render={(on) => (
            <ComposedChart data={r8} margin={M}>
              {grid}
              <XAxis dataKey="name" {...AXIS} tickFormatter={short} interval={0} angle={-35} textAnchor="end" height={70} tick={{ fontSize: 10, fill: "#8a8172" }} />
              {yAxis((v) => `${Math.round(v * 100)}%`, [0, 1])}
              <Tooltip cursor={CURSOR} content={<Tip fmt={pct} />} />
              {on.some((s) => s.key === "Share") && <Bar dataKey="Share" fill={PALETTE[0]} maxBarSize={24} radius={[4, 4, 0, 0]} />}
              {on.some((s) => s.key === "Running total") && <Line dataKey="Running total" stroke={PALETTE[1]} strokeWidth={2} dot={{ r: 3, fill: PALETTE[1], stroke: "#fff", strokeWidth: 1.5 }} />}
            </ComposedChart>
          )} tall />

        <Report n={9} title="Boards bought by size" sub="From POs and the old tracking sheet"
          table={{ cols: ["Month", ...r9sizes], rows: r9.map((r) => [r.label, ...r9sizes.map((s) => num(r[s] || 0))]) }}
          series={r9sizes.map((s) => ({ key: s, color: SIZE_COLOR[s] || OTHER }))}
          empty={!r9sizes.length && "No boards bought in this range."}
          render={(on) => (
            <BarChart data={r9} margin={M}>
              {grid}{xAxis("label")}{yAxis((v) => num(v))}
              <Tooltip cursor={CURSOR} content={<Tip fmt={(v) => `${num(v)} bd`} total />} />
              {on.map((s, i) => <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="#fff" strokeWidth={1.5} maxBarSize={36} radius={i === on.length - 1 ? [4, 4, 0, 0] : 0} />)}
            </BarChart>
          )} />

        <Report n={10} title="Landed cost per board" sub="Goods plus freight, cheapest first"
          table={{ cols: ["Vendor", "Boards", "Goods $/bd", "Freight $/bd", "Landed $/bd"], rows: r10.map((r) => [r.name, num(r.boards), `$${r.Goods.toFixed(3)}`, `$${r.Freight.toFixed(3)}`, `$${(r.Goods + r.Freight).toFixed(3)}`]) }}
          series={[{ key: "Goods", color: PALETTE[0] }, { key: "Freight", color: PALETTE[1] }]}
          empty={!r10.length && "No priced purchases in this range."}
          render={(on) => (
            <BarChart data={r10} margin={M}>
              {grid}
              <XAxis dataKey="name" {...AXIS} tickFormatter={short} interval={0} angle={-30} textAnchor="end" height={60} tick={{ fontSize: 10, fill: "#8a8172" }} />
              {yAxis((v) => `$${v.toFixed(2)}`)}
              <Tooltip cursor={CURSOR} content={<Tip fmt={(v) => `$${v.toFixed(3)}`} total />} />
              {on.map((s, i) => <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="#fff" strokeWidth={1.5} maxBarSize={24} radius={i === on.length - 1 ? [4, 4, 0, 0] : 0} />)}
            </BarChart>
          )} />

        <Report n={11} title="Vendor contacts per week" sub="From the activity log"
          table={{ cols: ["Week of", ...r11kinds.map((k) => KIND_LABEL[k])], rows: r11.map((r) => [r.label, ...r11kinds.map((k) => r[k] || 0)]) }}
          series={r11kinds.map((k) => ({ key: k, label: KIND_LABEL[k], color: KIND_COLOR[k] }))}
          empty={!r11.length && "No calls, texts or visits logged in this range."}
          render={(on) => (
            <BarChart data={r11} margin={M}>
              {grid}{xAxis("label")}{yAxis((v) => v, undefined, true)}
              <Tooltip cursor={CURSOR} content={<Tip fmt={(v) => v} names={KIND_LABEL} total />} />
              {on.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} stroke="#fff" strokeWidth={1.5} maxBarSize={24} radius={i === on.length - 1 ? [4, 4, 0, 0] : 0} />)}
            </BarChart>
          )} />

        <Report n={12} title="Supply out there vs on order" sub="Units vendors last told us they have, and units on open POs" wide
          table={{ cols: ["Size", "Vendors have", "On order"], rows: r12.map((r) => [r.name, r["Vendors have"], r["On order"]]) }}
          series={[{ key: "Vendors have", color: PALETTE[2] }, { key: "On order", color: PALETTE[6] }]}
          empty={!r12.length && "No stock reports or open POs in this range."}
          render={(on) => (
            <BarChart data={r12} margin={M} barGap={2}>
              {grid}{xAxis("name")}{yAxis((v) => v, undefined, true)}
              <Tooltip cursor={CURSOR} content={<Tip fmt={(v) => `${v} units`} />} />
              {on.map((s) => <Bar key={s.key} dataKey={s.key} fill={s.color} maxBarSize={24} radius={[4, 4, 0, 0]} />)}
            </BarChart>
          )} />
      </div>

      {snap && (
        <div className="text-xs text-faint leading-relaxed">
          QuickBooks only shows what was paid through it. Cash payments are not in here, and {money(catTotal("No vendor"))} of spending in this range has no vendor attached, so some wood may be hiding there.
        </div>
      )}
    </div>
  );
}

/* ---------- Chart pieces ---------- */
const M = { top: 8, right: 12, bottom: 4, left: 4 };
const AXIS = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: "#8a8172" } };
const CURSOR = { fill: "rgba(34,29,25,0.05)" };
const LINE_CURSOR = { stroke: "#c9bda3", strokeWidth: 1 };
const grid = <CartesianGrid vertical={false} stroke="#ece6da" />;
const xAxis = (key) => <XAxis dataKey={key} {...AXIS} />;
// Counts (contacts, units) get whole-number ticks.
const yAxis = (fmt, domain, wholeOnly) => <YAxis tickFormatter={fmt} width={56} domain={domain} allowDecimals={!wholeOnly} {...AXIS} />;

function Chip({ on, color, onClick, children }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${on ? "bg-white border-kraft-dark text-ink" : "bg-transparent border-kraft text-faint line-through"}`}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? color : "transparent", boxShadow: `inset 0 0 0 1.5px ${color}` }} />
      {children}
    </button>
  );
}

function Tip({ active, payload, label, fmt, total, names }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null && p.value !== 0);
  const sum = rows.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const title = label ?? payload[0]?.payload?.name;
  return (
    <div className="rounded-lg border border-kraft bg-white px-3 py-2 shadow-lg text-xs min-w-40">
      {title != null && <div className="font-bold text-ink mb-1">{title}</div>}
      {rows.map((p) => (
        <div key={p.dataKey + p.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.color || p.fill }} />
            {names?.[p.dataKey] || p.name}
          </span>
          <span className="font-mono text-ink">{fmt(p.value)}</span>
        </div>
      ))}
      {total && rows.length > 1 && (
        <div className="flex justify-between gap-4 border-t border-kraft mt-1 pt-1 font-semibold text-ink">
          <span>Total</span><span className="font-mono">{fmt(sum)}</span>
        </div>
      )}
    </div>
  );
}

function Donut({ data }) {
  const total = data.reduce((s, x) => s + x.value, 0);
  return (
    <PieChart>
      <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" stroke="#fff" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
        {data.map((x) => <Cell key={x.name} fill={x.color} />)}
      </Pie>
      <Tooltip content={<Tip fmt={(v) => `${money(v)}  ${pct(v / (total || 1))}`} />} />
      <text x="50%" y="47%" textAnchor="middle" className="fill-ink" style={{ fontSize: 18, fontWeight: 800 }}>{kMoney(total)}</text>
      <text x="50%" y="57%" textAnchor="middle" style={{ fontSize: 11, fill: "#8a8172" }}>total</text>
    </PieChart>
  );
}

/* A report card: title, chart or table, and a legend that doubles as an
   on/off switch for each series. */
function Report({ n, title, sub, render, series, table, wide, tall, empty }) {
  const [view, setView] = useState("chart");
  const [off, setOff] = useState(() => new Set());
  const on = (series || []).filter((s) => !off.has(s.key));
  const flip = (k) => setOff((cur) => { const x = new Set(cur); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  return (
    <section className={`card p-4 sm:p-5 ${wide ? "lg:col-span-2" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono tracking-widest text-faint">REPORT {String(n).padStart(2, "0")}</div>
          <h2 className="font-bold text-[15px] leading-tight">{title}</h2>
          {sub && <div className="text-xs text-faint mt-0.5">{sub}</div>}
        </div>
        <div className="flex rounded-md bg-paper p-0.5 shrink-0">
          <button title="Chart" onClick={() => setView("chart")} className={`rounded p-1.5 ${view === "chart" ? "bg-white shadow-sm" : "text-faint"}`}><BarChart3 size={14} /></button>
          <button title="Table" onClick={() => setView("table")} className={`rounded p-1.5 ${view === "table" ? "bg-white shadow-sm" : "text-faint"}`}><Table2 size={14} /></button>
        </div>
      </div>
      {series && series.length > 1 && view === "chart" && !empty && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {series.map((s) => <Chip key={s.key} on={!off.has(s.key)} color={s.color} onClick={() => flip(s.key)}>{s.label || s.key}</Chip>)}
        </div>
      )}
      <div className="mt-3">
        {empty ? (
          <div className={`${tall ? "h-80" : "h-64"} flex items-center justify-center text-sm text-faint`}>{empty}</div>
        ) : view === "chart" ? (
          <div className={tall ? "h-80" : "h-64"}>
            <ResponsiveContainer width="100%" height="100%">{render(on)}</ResponsiveContainer>
          </div>
        ) : (
          <div className={`${tall ? "max-h-80" : "max-h-64"} overflow-auto`}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="text-left text-[11px] uppercase tracking-wider text-faint font-mono">
                {table.cols.map((c, i) => <th key={c} className={`py-1.5 pr-2 ${i ? "text-right" : ""}`}>{c}</th>)}
              </tr></thead>
              <tbody>
                {table.rows.map((r, j) => (
                  <tr key={j} className="border-t border-kraft/60">
                    {r.map((c, i) => <td key={i} className={`py-1.5 pr-2 ${i ? "text-right font-mono text-xs" : ""}`}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
