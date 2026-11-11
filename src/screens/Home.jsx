import { useMemo } from "react";
import { Phone, CalendarClock, PackageOpen, AlertTriangle, ArrowRight, Check } from "lucide-react";
import { useData } from "../store.jsx";
import { MAIN_SIZES, sizeOf } from "../lib/catalog";
import { shortDate, daysSince, daysUntil, num } from "../lib/format";
import { today } from "../lib/db";
import { go } from "../lib/nav";
import { PageHeader, Section, Stat, TierBadge, Pill, Empty, Btn } from "../ui.jsx";

/* The supply board: what vendors say they have right now, who's due to
   restock, and who needs a call. This is the screen that keeps us from
   running short. */
export default function Home() {
  const { vendors, activities, zones, pos, updateActivity } = useData();
  const t = today();
  const zoneName = (id) => zones.find((z) => z.id === id)?.name || "No zone";
  const active = vendors.filter((v) => !v.hidden);

  // Latest reported stock per vendor, counted only if reported in the last 30 days.
  const stock = useMemo(() => active
    .filter((v) => v.lastStock && daysSince(v.lastStock.at) <= 30)
    .map((v) => ({ v, at: v.lastStock.at, s: v.lastStock.stock })), [active]);
  const totals = MAIN_SIZES.map((size) => ({
    // Painted counts toward its size too: 185 and 185P are both 185.
    size, units: stock.reduce((sum, r) => sum + Object.entries(r.s || {}).filter(([k]) => k.startsWith(size)).reduce((x, [, n]) => x + (Number(n) || 0), 0), 0),
  }));
  const totalUnits = totals.reduce((s, x) => s + x.units, 0);

  const followUps = activities
    .filter((a) => a.follow_up && !a.follow_up_done && a.follow_up <= addDays(t, 2))
    .sort((a, b) => a.follow_up.localeCompare(b.follow_up));
  const restocks = activities
    .filter((a) => a.restock_date && a.restock_date >= addDays(t, -3) && a.restock_date <= addDays(t, 21))
    .filter((a, i, arr) => arr.findIndex((x) => x.supplier_id === a.supplier_id) === i)
    .sort((a, b) => a.restock_date.localeCompare(b.restock_date));
  // Tier 1 and 2 vendors nobody has talked to in two weeks.
  const quiet = active
    .filter((v) => v.pv.tier && v.pv.tier <= 2)
    .filter((v) => !v.lastActivity || daysSince(v.lastActivity.at) > 14);
  const inbound = pos.filter((p) => p.status === "ordered" && !p.archived);
  const inboundUnits = inbound.reduce((s, p) => s + (p.lines || []).reduce((x, l) => x + (Number(l.copies) || 0), 0), 0);

  const vName = (id) => vendors.find((v) => v.id === id)?.name || "Unknown vendor";

  return (
    <div className="space-y-5">
      <PageHeader title="Supply board" sub="What's out there, what's coming, and who to call">
        <Btn kind="primary" onClick={() => go("truckloads/new")}>Build a truckload <ArrowRight size={15} /></Btn>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Units reported available" value={num(totalUnits)} sub={`${stock.length} vendor${stock.length === 1 ? "" : "s"}, last 30 days`} />
        <Stat label="Ordered, on the way" value={num(inboundUnits)} sub={`${inbound.length} open PO${inbound.length === 1 ? "" : "s"}`} />
        <Stat label="Follow ups due" value={followUps.length} tone={followUps.length ? "warn" : undefined} sub="today and next 2 days" />
        <Stat label="Key vendors gone quiet" value={quiet.length} tone={quiet.length ? "warn" : undefined} sub="Tier 1 and 2, 14+ days" />
      </div>

      <Section title="Available by size">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {totals.map((x) => (
            <div key={x.size} className="rounded-lg bg-paper p-3">
              <div className="flex items-baseline justify-between">
                <span className="font-extrabold text-lg">{x.size}</span>
                <span className="text-xs text-faint">{sizeOf(x.size).label}</span>
              </div>
              <div className="text-3xl font-extrabold mt-1">{x.units}</div>
              <div className="text-xs text-faint">units</div>
            </div>
          ))}
        </div>
        {stock.length > 0 ? (
          <div className="mt-4 divide-y divide-kraft">
            {stock.map(({ v, at, s }) => (
              <button key={v.id} onClick={() => go(`vendors/${v.id}`)} className="w-full flex flex-wrap items-center gap-2 py-2.5 text-left hover:bg-paper/60 rounded px-1">
                <span className="font-semibold min-w-40">{v.name}</span>
                <TierBadge tier={v.pv.tier} />
                <span className="text-xs text-faint">{zoneName(v.pv.zone_id)} · reported {shortDate(at)}</span>
                <span className="ml-auto flex gap-1.5">
                  {Object.entries(s || {}).filter(([, n]) => Number(n) > 0).map(([k, n]) => <Pill key={k}>{n} × {k}</Pill>)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Empty>No stock reported yet. Log a call on a vendor to fill this in.</Empty>
        )}
      </Section>

      <div className="grid lg:grid-cols-2 gap-5">
        <Section title={<span className="flex items-center gap-2"><Phone size={16} /> Follow ups</span>}>
          {followUps.length ? (
            <div className="divide-y divide-kraft">
              {followUps.map((a) => {
                const due = daysUntil(a.follow_up);
                return (
                  <div key={a.id} className="flex items-center gap-3 py-2.5">
                    <button onClick={() => updateActivity(a.id, { follow_up_done: true })} title="Mark done" className="h-6 w-6 shrink-0 rounded-full border border-kraft-dark hover:bg-moss hover:text-white flex items-center justify-center"><Check size={13} /></button>
                    <button onClick={() => go(`vendors/${a.supplier_id}`)} className="text-left min-w-0 flex-1">
                      <div className="font-semibold truncate">{vName(a.supplier_id)}</div>
                      <div className="text-xs text-faint truncate">{a.summary || "Follow up"}</div>
                    </button>
                    <Pill tone={due < 0 ? "warn" : due === 0 ? "red" : "plain"}>{due < 0 ? `${-due}d late` : due === 0 ? "Today" : shortDate(a.follow_up)}</Pill>
                  </div>
                );
              })}
            </div>
          ) : <Empty>Nothing due. Nice.</Empty>}
        </Section>

        <Section title={<span className="flex items-center gap-2"><CalendarClock size={16} /> Restocks coming</span>}>
          {restocks.length ? (
            <div className="divide-y divide-kraft">
              {restocks.map((a) => (
                <button key={a.id} onClick={() => go(`vendors/${a.supplier_id}`)} className="w-full flex items-center gap-3 py-2.5 text-left">
                  <PackageOpen size={16} className="text-faint shrink-0" />
                  <span className="font-semibold flex-1 truncate">{vName(a.supplier_id)}</span>
                  <Pill tone={a.restock_date < t ? "warn" : "moss"}>{a.restock_date < t ? "Was due " : ""}{shortDate(a.restock_date)}</Pill>
                </button>
              ))}
            </div>
          ) : <Empty>No restock dates logged for the next three weeks.</Empty>}
        </Section>
      </div>

      <Section title={<span className="flex items-center gap-2"><AlertTriangle size={16} /> Key vendors to check in with</span>}>
        {quiet.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {quiet.map((v) => (
              <button key={v.id} onClick={() => go(`vendors/${v.id}`)} className="rounded-lg border border-kraft p-3 text-left hover:border-kraft-dark">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold truncate">{v.name}</span>
                  <TierBadge tier={v.pv.tier} />
                </div>
                <div className="text-xs text-faint mt-1">
                  {v.lastActivity ? `Last contact ${daysSince(v.lastActivity.at)} days ago` : "No contact logged yet"}
                  {v.phone ? ` · ${v.phone}` : ""}
                </div>
              </button>
            ))}
          </div>
        ) : <Empty>Every Tier 1 and 2 vendor has been contacted in the last two weeks.</Empty>}
      </Section>
    </div>
  );
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
