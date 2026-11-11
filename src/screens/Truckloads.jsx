import { useMemo, useState } from "react";
import { Plus, Trash2, ChevronLeft, Mail, Copy, Check, MapPin, Route, FileText, AlertTriangle, ExternalLink, Save } from "lucide-react";
import { useData } from "../store.jsx";
import { SIZES, FINISHES, sizeOf, finishLabel, priceFor, lineBf, lineBoards, lineLbs, lineCost, skuFor } from "../lib/catalog";
import { bestRoute, mapsLink, miles } from "../lib/route";
import { money, num, shortDate, longDate, formatPhone } from "../lib/format";
import { today, uid, nextNumber } from "../lib/db";
import { go } from "../lib/nav";
import { PageHeader, Section, Field, Btn, Pill, TierBadge, Empty, Modal } from "../ui.jsx";

const STATUSES = [
  { id: "planning", label: "Planning", tone: "plain" },
  { id: "booked", label: "Booked", tone: "gold" },
  { id: "picked_up", label: "Picked up", tone: "warn" },
  { id: "delivered", label: "Delivered", tone: "moss" },
];
const statusOf = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];
const VENDOR_COLORS = ["#7E2F21", "#4A5D3A", "#B8862B", "#3F5A7A", "#7A4A6E", "#A65D21"];

export default function Truckloads({ id }) {
  if (id === "new") return <Builder key="new" />;
  if (id) return <Builder key={id} id={id} />;
  return <TruckList />;
}

/* ---------------- List and lane costs ---------------- */

function TruckList() {
  const { truckloads, zones } = useData();
  const zName = (zid) => zones.find((z) => z.id === zid)?.name || zid;

  // What a truck from each zone (or mix of zones) has cost us.
  const lanes = useMemo(() => {
    const map = {};
    truckloads.filter((t) => Number(t.freight) > 0 && t.status !== "planning").forEach((t) => {
      const key = [...(t.zone_ids || [])].sort().join("+") || "unknown";
      const bf = (t.picks || []).reduce((s, p) => s + lineBf(p), 0);
      const m = (map[key] = map[key] || { key, zones: t.zone_ids || [], count: 0, freight: 0, bf: 0, last: null });
      m.count += 1; m.freight += Number(t.freight); m.bf += bf;
      if (!m.last || t.date > m.last) m.last = t.date;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [truckloads]);

  return (
    <div className="space-y-5">
      <PageHeader title="Truckloads" sub="Build a load, route the pickups, book it with Charlie">
        <Btn kind="primary" onClick={() => go("truckloads/new")}><Plus size={15} /> New truckload</Btn>
      </PageHeader>

      <Section title="What a truck costs, by zone">
        {lanes.length ? (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-faint font-mono">
              <th className="py-2">Zones</th><th className="py-2 text-right">Trucks</th><th className="py-2 text-right">Avg freight</th><th className="py-2 text-right">Freight $/bf</th><th className="py-2 text-right">Last</th>
            </tr></thead>
            <tbody className="divide-y divide-kraft">
              {lanes.map((l) => (
                <tr key={l.key}>
                  <td className="py-2 font-semibold">{l.zones.map(zName).join(" + ") || "Unknown"}</td>
                  <td className="py-2 text-right">{l.count}</td>
                  <td className="py-2 text-right font-semibold">{money(l.freight / l.count)}</td>
                  <td className="py-2 text-right font-mono">{l.bf ? `$${(l.freight / l.bf).toFixed(3)}` : ""}</td>
                  <td className="py-2 text-right text-faint">{shortDate(l.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>Once a truck is booked with a freight cost, its zone and price show up here.</Empty>}
      </Section>

      <Section title="All truckloads">
        {truckloads.length === 0 ? <Empty>No truckloads yet.</Empty> : (
          <div className="divide-y divide-kraft">
            {truckloads.map((t) => {
              const units = (t.picks || []).reduce((s, p) => s + (Number(p.units) || 0), 0);
              const vendorsOn = new Set((t.picks || []).map((p) => p.supplierId)).size;
              return (
                <button key={t.id} onClick={() => go(`truckloads/${t.id}`)} className="w-full flex flex-wrap items-center gap-3 py-3 text-left hover:bg-paper/60 rounded px-1">
                  <span className="font-mono text-sm font-semibold">{t.number}</span>
                  <Pill tone={statusOf(t.status).tone}>{statusOf(t.status).label}</Pill>
                  <span className="text-sm text-faint">{t.date ? shortDate(t.date) : "No date"}</span>
                  <span className="text-sm">{units} units · {vendorsOn} vendor{vendorsOn === 1 ? "" : "s"}</span>
                  <span className="text-sm text-faint">{(t.zone_ids || []).map(zName).join(" + ")}</span>
                  <span className="ml-auto font-semibold">{t.freight ? money(t.freight) : ""}</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ---------------- Builder ---------------- */

const blankPick = () => ({ key: uid(), supplierId: "", size: "185", finish: "natural", units: "", perUnit: "", bfPerUnit: "", price: "", wet: false });

function Builder({ id }) {
  const data = useData();
  const { vendors, truckloads, products, settings, zones, saveTruckload, deleteTruckload, createPOs } = data;
  const existing = id ? truckloads.find((t) => t.id === id) : null;
  const truck = settings.truck || { maxLbs: 48000, spots: 32, courses: 8, perCourse: 4, lbsPerBf: 1.5, wetFactor: 1 };
  const shop = settings.shop || {};
  const broker = settings.broker || {};

  const [t, setT] = useState(() => existing
    // A hand-set order is saved as {locked, order}; otherwise route is just the ids.
    ? { ...existing, picks: existing.picks?.length ? existing.picks : [blankPick()],
        route_locked: !Array.isArray(existing.route) && !!existing.route?.locked,
        route: Array.isArray(existing.route) ? existing.route : existing.route?.order || [] }
    : { number: nextNumber(truckloads, "TL"), date: "", status: "planning", freight: "", notes: "", picks: [blankPick()], po_ids: [] });
  const [dirty, setDirty] = useState(!existing);
  const [saving, setSaving] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [flash, setFlash] = useState("");

  if (id && !existing) return <div className="text-faint">Truckload not found. <a className="underline" href="#/truckloads">Back</a></div>;

  const set = (p) => { setT((cur) => ({ ...cur, ...p })); setDirty(true); };
  const setPick = (key, p) => set({ picks: t.picks.map((x) => (x.key === key ? { ...x, ...p } : x)) });
  const vendorOf = (sid) => vendors.find((v) => v.id === sid);
  const active = vendors.filter((v) => !v.hidden);

  const rows = t.picks.map((p) => ({ ...p, v: vendorOf(p.supplierId), bf: lineBf(p), boards: lineBoards(p), lbs: lineLbs(p, truck), cost: lineCost(p) }));
  const live = rows.filter((r) => r.supplierId && Number(r.units) > 0);
  const units = live.reduce((s, r) => s + Number(r.units), 0);
  const lbs = live.reduce((s, r) => s + r.lbs, 0);
  const bf = live.reduce((s, r) => s + r.bf, 0);
  const goods = live.reduce((s, r) => s + r.cost, 0);
  const freight = Number(t.freight) || 0;
  const overSpots = units > truck.spots;
  const overWeight = lbs > truck.maxLbs;

  // Route: one stop per vendor, shortest order ending at the shop.
  const stops = [...new Set(live.map((r) => r.supplierId))].map((sid) => {
    const v = vendorOf(sid);
    return { id: sid, name: v?.name, lat: v?.pv.lat, lng: v?.pv.lng, address: v?.pv.pickup_address, v };
  });
  const route = bestRoute(stops, shop);
  const order = t.route_locked && t.route?.length
    ? t.route.map((sid) => stops.find((s) => s.id === sid)).filter(Boolean).concat(stops.filter((s) => !t.route.includes(s.id)))
    : route.order;
  const colorOf = (sid) => VENDOR_COLORS[stops.findIndex((s) => s.id === sid) % VENDOR_COLORS.length];
  const zoneIds = [...new Set(stops.map((s) => s.v?.pv.zone_id).filter(Boolean))];
  const routeMiles = order.length ? order.reduce((sum, s, i) => {
    const next = order[i + 1] || shop;
    return sum + (miles(s, next) || 0);
  }, 0) : 0;

  // Fill the truck in pickup order, nose first.
  const spots = [];
  order.forEach((s) => live.filter((r) => r.supplierId === s.id).forEach((r) => {
    for (let i = 0; i < Number(r.units); i++) spots.push({ sid: s.id, label: r.size });
  }));

  const persist = async (extra = {}) => {
    setSaving(true);
    const row = {
      ...(t.id ? { id: t.id } : {}),
      number: t.number, date: t.date || null, status: t.status, freight: t.freight === "" ? null : Number(t.freight),
      notes: t.notes || null, picks: t.picks.filter((p) => p.supplierId), route: t.route_locked ? { locked: true, order: order.map((s) => s.id) } : order.map((s) => s.id),
      zone_ids: zoneIds, po_ids: t.po_ids || [], broker: broker.name || null, ...extra,
    };
    const saved = await saveTruckload(row);
    setT((cur) => ({ ...cur, ...saved, route: cur.route, route_locked: cur.route_locked, picks: saved.picks.length ? saved.picks : [blankPick()] }));
    setDirty(false);
    setSaving(false);
    if (!t.id) go(`truckloads/${saved.id}`);
    return saved;
  };

  const vendorOptions = (pickVendorId) => active.filter((v) => v.id === pickVendorId || !v.hidden);
  const missingInfo = stops.filter((s) => !s.address || s.lat == null);

  return (
    <div className="space-y-5">
      <a href="#/truckloads" className="inline-flex items-center gap-1 text-sm text-faint hover:text-ink"><ChevronLeft size={15} /> All truckloads</a>

      <PageHeader title={<span className="flex items-center gap-3">Truckload <span className="font-mono text-lg text-faint">{t.number}</span></span>} sub={t.date ? longDate(t.date) : "No pickup date yet"}>
        {existing && <Btn onClick={() => { if (confirm("Delete this truckload? POs already created stay.")) { deleteTruckload(existing.id); go("truckloads"); } }}><Trash2 size={14} /></Btn>}
        <Btn kind={dirty ? "primary" : "ghost"} onClick={() => persist()} disabled={saving || live.length === 0}><Save size={14} /> {dirty ? "Save" : "Saved"}</Btn>
      </PageHeader>

      {flash && <div className="rounded-lg bg-moss-light text-moss px-4 py-3 text-sm font-semibold">{flash}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Pickup date"><input type="date" className="field" value={t.date || ""} onChange={(e) => set({ date: e.target.value })} /></Field>
        <Field label="Status">
          <select className="field" value={t.status} onChange={(e) => set({ status: e.target.value })}>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Freight cost ($)"><input type="number" className="field" value={t.freight ?? ""} onChange={(e) => set({ freight: e.target.value })} placeholder="From Charlie" /></Field>
        <Field label="Zones"><div className="field bg-paper text-sm truncate">{zoneIds.map((z) => zones.find((x) => x.id === z)?.name).join(" + ") || "Set by vendors"}</div></Field>
      </div>

      <TruckGauge units={units} lbs={lbs} truck={truck} overSpots={overSpots} overWeight={overWeight} />

      <Section title="What goes on the truck" action={<Btn kind="soft" onClick={() => set({ picks: [...t.picks, blankPick()] })}><Plus size={14} /> Add a line</Btn>}>
        <div className="space-y-3">
          {rows.map((r) => {
            const s = sizeOf(r.size);
            const listed = r.v ? priceFor(r.v.pv, r.size, r.finish) : 0;
            const isDF = r.size === "DF";
            return (
              <div key={r.key} className="rounded-lg border border-kraft p-3">
                <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
                  <Field label="Vendor" className="col-span-2 sm:col-span-3">
                    <select className="field" value={r.supplierId} onChange={(e) => {
                      const v = vendorOf(e.target.value);
                      setPick(r.key, { supplierId: e.target.value, price: v ? priceFor(v.pv, r.size, r.finish) || "" : "" });
                    }}>
                      <option value="">Pick vendor</option>
                      {[1, 2, 3, null].map((tier) => {
                        const group = vendorOptions(r.supplierId).filter((v) => (v.pv.tier || null) === tier);
                        if (!group.length) return null;
                        return <optgroup key={String(tier)} label={tier ? `Tier ${tier}` : "No tier"}>{group.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>;
                      })}
                    </select>
                  </Field>
                  <Field label="Size" className="sm:col-span-2">
                    <select className="field" value={r.size} onChange={(e) => setPick(r.key, { size: e.target.value, perUnit: "", price: r.v ? priceFor(r.v.pv, e.target.value, r.finish) || "" : "" })}>
                      {SIZES.map((x) => <option key={x.code} value={x.code}>{x.code}{x.code !== "DF" ? ` · ${x.label}` : ""}</option>)}
                    </select>
                  </Field>
                  <Field label="Finish" className="sm:col-span-2">
                    <select className="field" value={r.finish} onChange={(e) => setPick(r.key, { finish: e.target.value, price: r.v ? priceFor(r.v.pv, r.size, e.target.value) || "" : "" })}>
                      {FINISHES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Units" className="sm:col-span-1"><input type="number" min="0" className="field" value={r.units} onChange={(e) => setPick(r.key, { units: e.target.value })} /></Field>
                  {isDF
                    ? <Field label="Bf/unit" className="sm:col-span-1"><input type="number" className="field" value={r.bfPerUnit} placeholder={String(s.bfPerUnit)} onChange={(e) => setPick(r.key, { bfPerUnit: e.target.value })} /></Field>
                    : <Field label="Bd/unit" className="sm:col-span-1"><input type="number" className="field" value={r.perUnit} placeholder={String(s.boardsPerUnit)} onChange={(e) => setPick(r.key, { perUnit: e.target.value })} /></Field>}
                  <Field label={isDF ? "$/bf" : "$/board"} className="sm:col-span-2"><input type="number" step="0.01" className="field font-mono" value={r.price} onChange={(e) => setPick(r.key, { price: e.target.value })} placeholder={listed ? listed.toFixed(2) : "price"} /></Field>
                  <div className="col-span-2 sm:col-span-1 flex sm:justify-end pb-2">
                    <button onClick={() => set({ picks: t.picks.length > 1 ? t.picks.filter((x) => x.key !== r.key) : [blankPick()] })} className="text-faint hover:text-redwood"><Trash2 size={16} /></button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-faint">
                  {r.supplierId && <TierBadge tier={r.v?.pv.tier} />}
                  {Number(r.units) > 0 && <span>{!isDF && `${num(r.boards)} boards · `}{num(r.bf)} bf · {num(r.lbs)} lbs</span>}
                  {Number(r.units) > 0 && <span className="font-semibold text-ink">{money(r.cost)}</span>}
                  <label className="flex items-center gap-1 ml-auto"><input type="checkbox" checked={!!r.wet} onChange={(e) => setPick(r.key, { wet: e.target.checked })} /> Wet</label>
                  {r.supplierId && !(Number(r.price) > 0) && <span className="text-warn">Needs a price</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <div className="grid lg:grid-cols-2 gap-5">
        <Section title={<span className="flex items-center gap-2"><Route size={16} /> Pickup order</span>}
          action={order.length > 1 && <label className="flex items-center gap-1.5 text-xs text-faint"><input type="checkbox" checked={!!t.route_locked} onChange={(e) => set({ route_locked: e.target.checked, route: order.map((s) => s.id) })} /> Set by hand</label>}>
          {order.length === 0 ? <Empty>Add vendors to see the route.</Empty> : (
            <>
              <ol className="space-y-2">
                {order.map((s, i) => (
                  <li key={s.id} className="flex items-start gap-3">
                    <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full text-white text-xs font-bold flex items-center justify-center" style={{ background: colorOf(s.id) }}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-xs text-faint truncate">{s.address || "No pickup address"}{s.v?.pv.hours ? ` · ${s.v.pv.hours}` : ""}</div>
                    </div>
                    {t.route_locked && (
                      <div className="flex flex-col">
                        <button disabled={i === 0} className="text-xs disabled:opacity-20" onClick={() => { const r = order.map((x) => x.id); [r[i - 1], r[i]] = [r[i], r[i - 1]]; set({ route: r }); }}>▲</button>
                        <button disabled={i === order.length - 1} className="text-xs disabled:opacity-20" onClick={() => { const r = order.map((x) => x.id); [r[i + 1], r[i]] = [r[i], r[i + 1]]; set({ route: r }); }}>▼</button>
                      </div>
                    )}
                  </li>
                ))}
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-ink text-white flex items-center justify-center"><MapPin size={12} /></span>
                  <div><div className="font-semibold">Deliver to shop</div><div className="text-xs text-faint">{shop.address}</div></div>
                </li>
              </ol>
              <div className="flex flex-wrap items-center gap-3 mt-4 text-sm">
                {routeMiles > 0 && <span className="text-faint">About {num(routeMiles)} miles with pickups</span>}
                <a className="inline-flex items-center gap-1 font-semibold text-redwood" target="_blank" rel="noreferrer" href={mapsLink([...order.map((s) => s.address), shop.address])}>Open in Google Maps <ExternalLink size={13} /></a>
              </div>
              {missingInfo.length > 0 && (
                <div className="mt-3 rounded-md bg-warn-light text-warn text-xs px-3 py-2 flex gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>Not on the map yet: {missingInfo.map((s) => s.name).join(", ")}. Add the address and press Find on map on the vendor, or set the order by hand.</span>
                </div>
              )}
            </>
          )}
        </Section>

        <Section title="How it loads" action={<span className="text-xs text-faint">nose on the left</span>}>
          <TruckPicture spots={spots} truck={truck} colorOf={colorOf} />
          <div className="flex flex-wrap gap-3 mt-3 text-xs">
            {order.map((s) => <span key={s.id} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: colorOf(s.id) }} /> {s.name}</span>)}
          </div>
        </Section>
      </div>

      <div className="rounded-xl bg-ink text-white p-5">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Num label="Board feet" value={num(bf)} />
          <Num label="Goods" value={money(goods)} />
          <Num label="Freight" value={freight ? money(freight) : "Not set"} />
          <Num label="Landed" value={money(goods + freight)} />
          <Num label="Landed $/bf" value={bf ? `$${((goods + freight) / bf).toFixed(3)}` : "n/a"} />
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 pb-6">
        <Btn onClick={() => setEmailOpen(true)} disabled={live.length === 0}><Mail size={15} /> Email to {broker.name || "broker"}</Btn>
        <Btn kind="primary" onClick={() => setPoOpen(true)} disabled={live.length === 0 || live.some((r) => !(Number(r.price) > 0)) || (t.po_ids || []).length > 0}>
          <FileText size={15} /> {(t.po_ids || []).length ? `${t.po_ids.length} POs created` : "Create POs"}
        </Btn>
      </div>

      {emailOpen && <BrokerEmail t={t} order={order} live={live} shop={shop} broker={broker} lbs={lbs} units={units} onClose={() => setEmailOpen(false)}
        onBooked={async () => { await persist({ status: t.status === "planning" ? "booked" : t.status }); setT((c) => ({ ...c, status: c.status === "planning" ? "booked" : c.status })); }} />}
      {poOpen && <CreatePOs t={t} order={order} live={live} products={products} freight={freight} bf={bf} onClose={() => setPoOpen(false)}
        onCreate={async () => {
          const drafts = order.map((s) => {
            const lines = live.filter((r) => r.supplierId === s.id);
            const vbf = lines.reduce((x, r) => x + r.bf, 0);
            return {
              supplierId: s.id, date: t.date || today(), shipVia: "3PL",
              shippingCost: bf ? Math.round((freight * vbf / bf) * 100) / 100 : 0,
              lines: lines.map((r) => {
                const m = skuFor(r.size, products);
                const isDF = r.size === "DF";
                const perUnit = isDF ? Number(r.bfPerUnit) || sizeOf("DF").bfPerUnit : Number(r.perUnit) || sizeOf(r.size).boardsPerUnit;
                return { sizeLabel: m.sku, productId: m.productId, boardCount: perUnit, copies: Number(r.units), cost: Math.round(r.cost * 100) / 100, finish: r.finish };
              }),
              totalCost: Math.round(lines.reduce((x, r) => x + r.cost, 0) * 100) / 100,
              note: `Truckload ${t.number}. ${lines.map((r) => `${r.units} x ${r.size} ${finishLabel(r.finish).toLowerCase()}`).join(", ")}`,
              truckloadNumber: t.number,
            };
          });
          const made = await createPOs(drafts);
          await persist({ po_ids: made.map((p) => p.id) });
          setT((c) => ({ ...c, po_ids: made.map((p) => p.id) }));
          setPoOpen(false);
          setFlash(`Created ${made.map((p) => p.number).join(", ")}. They show in Office and Ops as ordered.`);
        }} />}
    </div>
  );
}

const Num = ({ label, value }) => (
  <div><div className="text-[11px] font-mono text-kraft-dark uppercase">{label}</div><div className="text-xl font-extrabold">{value}</div></div>
);

function TruckGauge({ units, lbs, truck, overSpots, overWeight }) {
  const bar = (val, max, over) => (
    <div className="h-2.5 rounded-full bg-kraft overflow-hidden"><div className={`h-full ${over ? "bg-warn" : "bg-moss"}`} style={{ width: `${Math.min(100, (val / max) * 100)}%` }} /></div>
  );
  const limit = lbs / truck.maxLbs >= units / truck.spots ? "weight" : "space";
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="card p-4">
        <div className="flex justify-between text-sm mb-2"><span className="font-semibold">Weight</span><span className={overWeight ? "text-warn font-bold" : "text-faint"}>{num(lbs)} / {num(truck.maxLbs)} lbs</span></div>
        {bar(lbs, truck.maxLbs, overWeight)}
        <div className="text-xs mt-1.5 text-faint">{overWeight ? `${num(lbs - truck.maxLbs)} lbs over` : `${num(truck.maxLbs - lbs)} lbs of room`}{limit === "weight" && units > 0 ? " · weight is the limit" : ""}</div>
      </div>
      <div className="card p-4">
        <div className="flex justify-between text-sm mb-2"><span className="font-semibold">Spots</span><span className={overSpots ? "text-warn font-bold" : "text-faint"}>{units} / {truck.spots} units</span></div>
        {bar(units, truck.spots, overSpots)}
        <div className="text-xs mt-1.5 text-faint">{overSpots ? `${units - truck.spots} units won't fit` : `${truck.spots - units} spots open`}{limit === "space" && units > 0 ? " · space is the limit" : ""}</div>
      </div>
    </div>
  );
}

/* 8 courses down the trailer, each 2 units wide and 2 high. Shown from the
   side as columns, with the two widths stacked as pairs. */
function TruckPicture({ spots, truck, colorOf }) {
  const courses = truck.courses || 8;
  const per = truck.perCourse || 4;
  return (
    <div className="rounded-lg border-2 border-ink p-1.5 flex gap-2 overflow-x-auto">
      {Array.from({ length: courses }, (_, c) => (
        <div key={c} className="grid grid-cols-2 grid-rows-2 gap-0.5 flex-1 min-w-10">
          {Array.from({ length: per }, (_, i) => {
            const s = spots[c * per + i];
            return (
              <div key={i} className="h-9 rounded-sm flex items-center justify-center text-[10px] font-bold text-white" style={{ background: s ? colorOf(s.sid) : "#ece6d9" }}>
                {s ? s.label : ""}
              </div>
            );
          })}
        </div>
      ))}
      {spots.length > courses * per && <div className="self-center text-xs font-bold text-warn px-1">+{spots.length - courses * per}</div>}
    </div>
  );
}

function BrokerEmail({ t, order, live, shop, broker, lbs, units, onClose, onBooked }) {
  const [copied, setCopied] = useState(false);
  const lines = [];
  lines.push(`Hi ${broker.name || "there"},`);
  lines.push("");
  lines.push(`Looking to book a full truckload${t.date ? ` for pickup ${longDate(t.date)}` : ""}. ${order.length} pickup${order.length === 1 ? "" : "s"}, delivering to our shop in North San Juan.`);
  lines.push("");
  order.forEach((s, i) => {
    const v = s.v;
    const mine = live.filter((r) => r.supplierId === s.id);
    const w = mine.reduce((x, r) => x + r.lbs, 0);
    lines.push(`PICKUP ${i + 1}: ${v?.name}`);
    lines.push(`Address: ${v?.pv.pickup_address || "TBD"}`);
    if (v?.contact || v?.phone) lines.push(`Contact: ${[v?.contact, formatPhone(v?.phone)].filter(Boolean).join(" ")}`);
    if (v?.pv.hours) lines.push(`Hours: ${v.pv.hours}`);
    lines.push(`Load: ${mine.map((r) => `${r.units} units ${r.size}`).join(", ")}, about ${num(w)} lbs`);
    if (v?.pv.dock_notes) lines.push(`Notes: ${v.pv.dock_notes}`);
    lines.push("");
  });
  lines.push(`DELIVER TO: ${shop.address}`);
  lines.push("");
  lines.push(`Total: ${units} units, about ${num(lbs)} lbs. Lumber on standard units, double stacked, 53 ft trailer.`);
  if (t.notes) lines.push(t.notes);
  lines.push("");
  lines.push("Let me know the rate and timing.");
  lines.push("");
  lines.push("Thanks");
  const body = lines.join("\n");
  const subject = `Truckload ${t.number}${t.date ? ` pickup ${shortDate(t.date)}` : ""}, ${order.length} stop${order.length === 1 ? "" : "s"}`;
  const mailto = `mailto:${broker.email || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <Modal title={`Email to ${broker.name || "broker"}`} onClose={onClose} wide>
      {!broker.email && <div className="rounded-md bg-warn-light text-warn text-xs px-3 py-2 mb-3">No email saved for {broker.name || "the broker"} yet. Add it in Settings, or type it in your mail app.</div>}
      <div className="text-xs text-faint mb-1">Subject</div>
      <div className="font-semibold mb-3">{subject}</div>
      <pre className="whitespace-pre-wrap text-sm bg-paper rounded-lg p-4 max-h-[50vh] overflow-auto font-sans">{body}</pre>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Btn onClick={async () => { await navigator.clipboard.writeText(`${subject}\n\n${body}`); setCopied(true); }}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}</Btn>
        <a href={mailto} onClick={() => onBooked()}><Btn kind="primary"><Mail size={14} /> Open in mail</Btn></a>
      </div>
      <div className="text-xs text-faint mt-2 text-right">Opening it in mail marks the truck as booked.</div>
    </Modal>
  );
}

function CreatePOs({ order, live, products, freight, bf, onClose, onCreate }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Create ${order.length} purchase order${order.length === 1 ? "" : "s"}?`} onClose={onClose} wide>
      <div className="text-sm text-faint mb-3">One per vendor, placed as ordered. Nothing counts into inventory until the shop receives it in Ops. Freight is split by board feet.</div>
      <div className="space-y-3">
        {order.map((s) => {
          const mine = live.filter((r) => r.supplierId === s.id);
          const vbf = mine.reduce((x, r) => x + r.bf, 0);
          return (
            <div key={s.id} className="rounded-lg border border-kraft p-3">
              <div className="flex justify-between font-semibold">
                <span>{s.name}</span>
                <span>{money(mine.reduce((x, r) => x + r.cost, 0))}{freight ? <span className="text-faint font-normal"> + {money(bf ? freight * vbf / bf : 0)} freight</span> : ""}</span>
              </div>
              {mine.map((r) => {
                const m = skuFor(r.size, products);
                return (
                  <div key={r.key} className="flex justify-between text-sm mt-1">
                    <span>{r.units} × {m.sku} <span className="text-faint">{finishLabel(r.finish).toLowerCase()}</span>{!m.productId && <span className="text-warn"> (no matching SKU in inventory)</span>}</span>
                    <span className="font-mono">${Number(r.price).toFixed(2)} · {money(r.cost)}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Btn onClick={onClose}>Back</Btn>
        <Btn kind="primary" disabled={busy} onClick={async () => { setBusy(true); try { await onCreate(); } finally { setBusy(false); } }}><Check size={15} /> Create</Btn>
      </div>
    </Modal>
  );
}
