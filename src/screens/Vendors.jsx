import { useMemo, useState } from "react";
import { Search, Plus, ChevronLeft, MapPin, Phone, Mail, Trash2, Check, Loader2, Navigation } from "lucide-react";
import { useData } from "../store.jsx";
import { SIZES, MAIN_SIZES, FINISHES, TIERS } from "../lib/catalog";
import { geocode, zoneForAddress } from "../lib/route";
import { money, shortDate, daysSince, num, formatPhone, telHref } from "../lib/format";
import { today } from "../lib/db";
import { go } from "../lib/nav";
import { PageHeader, Section, Field, Btn, Pill, TierBadge, Empty, Modal } from "../ui.jsx";

export default function Vendors({ id, me }) {
  return id ? <VendorDetail id={id} me={me} /> : <VendorList />;
}

function VendorList() {
  const { vendors, zones, addVendor } = useData();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("all");
  const [zone, setZone] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const zoneName = (zid) => zones.find((z) => z.id === zid)?.name;
  const list = vendors.filter((v) => {
    if (!showArchived && v.hidden) return false;
    if (tier !== "all" && String(v.pv.tier || "none") !== tier) return false;
    if (zone !== "all" && (v.pv.zone_id || "none") !== zone) return false;
    const hay = [v.name, v.contact, v.phone, v.code, v.pv.pickup_address].join(" ").toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  });
  const missingAddress = vendors.filter((v) => !v.hidden && v.pv.tier && v.pv.tier <= 2 && !v.pv.pickup_address);

  const create = async () => {
    if (!newName.trim()) return;
    const newId = await addVendor(newName.trim());
    setAdding(false);
    setNewName("");
    go(`vendors/${newId}`);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Vendors" sub={`${vendors.filter((v) => !v.hidden).length} active`}>
        <Btn kind="primary" onClick={() => setAdding(true)}><Plus size={15} /> New vendor</Btn>
      </PageHeader>

      {missingAddress.length > 0 && (
        <div className="rounded-lg bg-warn-light text-warn px-4 py-3 text-sm">
          <b>Missing pickup address:</b> {missingAddress.map((v) => v.name).join(", ")}. Routing and the broker email need these.
        </div>
      )}

      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input className="field pl-9" placeholder="Search name, contact, phone, address" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="field w-auto" value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="all">All tiers</option>
          {TIERS.map((t) => <option key={t.id} value={String(t.id)}>{t.label}</option>)}
          <option value="none">No tier</option>
        </select>
        <select className="field w-auto" value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value="all">All zones</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          <option value="none">No zone</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-faint px-1">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived
        </label>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left">
            <tr className="text-[11px] uppercase tracking-wider text-faint font-mono">
              <th className="px-4 py-2.5">Vendor</th>
              <th className="px-2 py-2.5 hidden sm:table-cell">Zone</th>
              <th className="px-2 py-2.5 hidden md:table-cell">Contact</th>
              <th className="px-2 py-2.5 hidden lg:table-cell">Prices ($/bd)</th>
              <th className="px-4 py-2.5 text-right">Last contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kraft">
            {list.map((v) => (
              <tr key={v.id} onClick={() => go(`vendors/${v.id}`)} className={`cursor-pointer hover:bg-paper/70 ${v.hidden ? "opacity-50" : ""}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{v.name}</span>
                    <TierBadge tier={v.pv.tier} />
                  </div>
                  {!v.pv.pickup_address && <div className="text-xs text-faint mt-0.5">No pickup address</div>}
                </td>
                <td className="px-2 py-3 hidden sm:table-cell text-ink-2">{zoneName(v.pv.zone_id) || <span className="text-faint">None</span>}</td>
                <td className="px-2 py-3 hidden md:table-cell">
                  <div>{v.contact || <span className="text-faint">None</span>}</div>
                  <div className="text-xs text-faint font-mono">{formatPhone(v.phone)}</div>
                </td>
                <td className="px-2 py-3 hidden lg:table-cell">
                  <div className="flex gap-1 flex-wrap">
                    {MAIN_SIZES.filter((s) => v.pv.prices?.[`${s}:natural`]).map((s) => (
                      <Pill key={s}>{s} ${Number(v.pv.prices[`${s}:natural`]).toFixed(2)}</Pill>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-xs text-faint whitespace-nowrap">
                  {v.lastActivity ? `${daysSince(v.lastActivity.at)}d ago` : "Never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <Empty>No vendors match.</Empty>}
      </div>

      {adding && (
        <Modal title="New vendor" onClose={() => setAdding(false)}>
          <Field label="Company name"><input autoFocus className="field" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} /></Field>
          <div className="text-xs text-faint mt-2">Adds them to the shared vendor list, so Office sees them too.</div>
          <div className="flex justify-end gap-2 mt-4">
            <Btn onClick={() => setAdding(false)}>Cancel</Btn>
            <Btn kind="primary" onClick={create} disabled={!newName.trim()}>Create</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* Text fields save when you leave them, so typing never waits on the network. */
function Blur({ value, onSave, className = "field", multiline, format, ...rest }) {
  const [v, setV] = useState(value ?? "");
  const [orig, setOrig] = useState(value ?? "");
  if ((value ?? "") !== orig) { setOrig(value ?? ""); setV(value ?? ""); }
  const commit = () => {
    const out = format ? format(v) : v;
    if (out !== v) setV(out);
    if (out !== (value ?? "")) onSave(out);
  };
  const Tag = multiline ? "textarea" : "input";
  return <Tag className={className} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} {...rest} />;
}

function VendorDetail({ id, me }) {
  const { vendors, zones, pos, purchases, activities, saveProfile, saveSupplier } = useData();
  const v = vendors.find((x) => x.id === id);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState("");
  if (!v) return <div className="text-faint">Vendor not found. <a className="underline" href="#/vendors">Back to vendors</a></div>;
  const pv = v.pv;

  const setPv = (changes, label) => saveProfile(v.id, changes, { label });
  const setCore = (changes) => saveSupplier(v.id, changes);

  /* A new address is looked up on the map straight away, then saved in one
     go with its zone and coordinates, so there's nothing to press after. */
  const saveAddress = async (addr) => {
    const clean = (addr || "").trim();
    const zone_id = zoneForAddress(clean, zones) || pv.zone_id || null;
    if (!clean) { await setPv({ pickup_address: null, lat: null, lng: null, geocoded_address: null }); return; }
    setLocating(true); setLocMsg("");
    let hit = null;
    try { hit = await geocode(clean); } catch (e) { setLocMsg(e.message); }
    if (!hit) setLocMsg((m) => m || "Couldn't find that address on the map. Check the street and city, then press Find on map.");
    await setPv({ pickup_address: clean, zone_id, lat: hit?.lat ?? null, lng: hit?.lng ?? null, geocoded_address: hit?.display ?? null }, "address");
    setLocating(false);
  };

  const theirPOs = pos.filter((p) => p.supplierId === v.id && !p.archived);
  const theirPurchases = purchases.filter((p) => p.supplier_id === v.id);
  const acts = activities.filter((a) => a.supplier_id === v.id);
  // Sheet rows plus POs, skipping sheet rows that were later entered as a PO.
  const poGoods = (p) => (p.lines || []).reduce((s, l) => s + (Number(l.cost) || 0), 0);
  const sheetOnly = theirPurchases.filter((p) => !theirPOs.some((po) => p.cost != null && Math.abs(poGoods(po) - Number(p.cost)) < 1));
  const boughtBoards = sheetOnly.reduce((s, p) => s + (Number(p.boards) || 0), 0)
    + theirPOs.reduce((s, p) => s + (p.lines || []).reduce((x, l) => x + (Number(l.boardCount) || 0) * (Number(l.copies) || 1), 0), 0);
  const spent = sheetOnly.reduce((s, p) => s + (Number(p.total) || 0), 0) + theirPOs.reduce((s, p) => s + poGoods(p) + (Number(p.shippingCost) || 0), 0);

  return (
    <div className="space-y-5">
      <a href="#/vendors" className="inline-flex items-center gap-1 text-sm text-faint hover:text-ink"><ChevronLeft size={15} /> All vendors</a>

      <div className="rounded-xl bg-ink text-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Blur value={v.name} onSave={(name) => setCore({ name })} className="bg-transparent text-2xl sm:text-3xl font-extrabold tracking-tight w-full outline-none border-b border-transparent focus:border-white/30" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-kraft-dark">
              {v.contact && <span>{v.contact}{v.contactRole ? `, ${v.contactRole}` : ""}</span>}
              {v.phone && <a href={telHref(v.phone)} className="flex items-center gap-1 hover:text-white"><Phone size={13} /> {formatPhone(v.phone)}</a>}
              {v.email && <a href={`mailto:${v.email}`} className="flex items-center gap-1 hover:text-white"><Mail size={13} /> {v.email}</a>}
            </div>
          </div>
          <div className="flex gap-1.5">
            {TIERS.map((t) => (
              <button key={t.id} onClick={() => setPv({ tier: pv.tier === t.id ? null : t.id })} title={t.blurb}
                className={`rounded-md px-3 py-1.5 text-sm font-bold border transition ${pv.tier === t.id ? "bg-redwood border-redwood text-white" : "border-white/20 text-kraft-dark hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-5 text-sm">
          <div><div className="text-[11px] font-mono text-kraft-dark">BOARDS BOUGHT</div><div className="text-lg font-bold">{num(boughtBoards)}</div></div>
          <div><div className="text-[11px] font-mono text-kraft-dark">SPENT</div><div className="text-lg font-bold">{money(spent)}</div></div>
          <div><div className="text-[11px] font-mono text-kraft-dark">OPEN POS</div><div className="text-lg font-bold">{theirPOs.filter((p) => p.status === "ordered").length}</div></div>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-5">
          <ActivityLog vendor={v} acts={acts} me={me} />
          <PriceGrid vendor={v} onSave={(prices) => setPv({ prices })} />
        </div>

        <div className="lg:col-span-2 space-y-5">
          <Section title="Pickup">
            <div className="space-y-3">
              <AddressField value={pv.pickup_address} onSave={saveAddress} locating={locating} located={pv.lat != null} />
              {locMsg && <div className="text-xs text-warn">{locMsg}</div>}
              {pv.geocoded_address && <div className="text-xs text-faint">{pv.geocoded_address}</div>}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Zone">
                  <select className="field" value={pv.zone_id || ""} onChange={(e) => setPv({ zone_id: e.target.value || null })}>
                    <option value="">No zone</option>
                    {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </Field>
                <Field label="Crews"><Blur type="number" value={pv.crews ?? ""} onSave={(x) => setPv({ crews: x === "" ? null : Number(x) })} /></Field>
              </div>
              <Field label="Pickup hours"><Blur value={pv.hours} onSave={(hours) => setPv({ hours })} placeholder="e.g. M-F 7am to 3pm" /></Field>
              <Field label="Dock and loading notes"><Blur multiline rows={2} value={pv.dock_notes} onSave={(dock_notes) => setPv({ dock_notes })} placeholder="Forklift on site? Gate code? Where the units sit" /></Field>
            </div>
          </Section>

          <Section title="Contacts">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Main contact"><Blur value={v.contact} onSave={(contact) => setCore({ contact })} /></Field>
                <Field label="Role"><Blur value={v.contactRole} onSave={(contactRole) => setCore({ contactRole })} placeholder="Owner, ops manager…" /></Field>
              </div>
              <Field label="Phone"><Blur value={formatPhone(v.phone)} format={formatPhone} onSave={(phone) => setCore({ phone })} placeholder="(408) 555-1234" /></Field>
              <Field label="Email"><Blur value={v.email} onSave={(email) => setCore({ email })} /></Field>
              <Contacts list={pv.contacts || []} onSave={(contacts) => setPv({ contacts })} />
            </div>
          </Section>

          <Section title="Paying them">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Pay method">
                  <select className="field" value={v.payMethod || ""} onChange={(e) => setCore({ payMethod: e.target.value })}>
                    <option value="">Not set</option>
                    {["Check", "Mail Check", "Cash", "Melio", "Zelle", "ACH"].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="1099 on file">
                  <select className="field" value={v.has1099 ? "yes" : "no"} onChange={(e) => setCore({ has1099: e.target.value === "yes" })}>
                    <option value="no">No</option><option value="yes">Yes</option>
                  </select>
                </Field>
              </div>
              <Field label="Make checks payable to"><Blur value={pv.check_payee} onSave={(check_payee) => setPv({ check_payee })} placeholder={v.name} /></Field>
              <Field label="Mailing address for checks"><Blur multiline rows={2} value={pv.mailing_address} onSave={(mailing_address) => setPv({ mailing_address })} placeholder="If different from pickup" /></Field>
            </div>
          </Section>

          <Section title="Purchases">
            {theirPOs.length + sheetOnly.length === 0 ? <Empty>Nothing bought yet.</Empty> : (
              <div className="divide-y divide-kraft text-sm">
                {theirPOs.slice(0, 8).map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2">
                    <span className="font-mono text-xs">{p.number}</span>
                    <span className="text-faint text-xs">{shortDate(p.date)}</span>
                    <Pill tone={p.status === "ordered" ? "warn" : "moss"}>{p.status === "ordered" ? "Ordered" : "Received"}</Pill>
                    <span className="font-semibold">{money((p.lines || []).reduce((s, l) => s + (Number(l.cost) || 0), 0))}</span>
                  </div>
                ))}
                {sheetOnly.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2">
                    <span className="text-xs text-faint">{p.date ? shortDate(p.date) : "No date"}</span>
                    <span className="text-xs">{p.boards ? `${num(p.boards)} bd` : ""}</span>
                    <span className="font-semibold">{money(p.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <div className="flex gap-2">
            <Btn onClick={() => setCore({ hidden: !v.hidden })}>{v.hidden ? "Restore vendor" : "Archive vendor"}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* The address box keeps what you type until you leave it or press the
   button. The button doesn't steal focus first, so it never races the save. */
function AddressField({ value, onSave, locating, located }) {
  const [v, setV] = useState(value ?? "");
  const [orig, setOrig] = useState(value ?? "");
  if ((value ?? "") !== orig) { setOrig(value ?? ""); setV(value ?? ""); }
  const changed = v.trim() !== (value ?? "");
  return (
    <div className="space-y-2">
      <Field label="Pickup address">
        <input className="field" value={v} placeholder="Street, city, zip" onChange={(e) => setV(e.target.value)}
          onBlur={() => { if (changed) onSave(v); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      </Field>
      <div className="flex items-center gap-2 text-xs">
        {locating
          ? <Pill><Loader2 size={11} className="animate-spin" /> Finding on map…</Pill>
          : located && !changed
            ? <Pill tone="moss"><MapPin size={11} /> On the map</Pill>
            : <Pill tone="warn"><MapPin size={11} /> Not on the map</Pill>}
        <Btn kind="soft" className="py-1 text-xs" disabled={!v.trim() || locating}
          onMouseDown={(e) => e.preventDefault()} onClick={() => onSave(v)}>
          <Navigation size={12} /> {located && !changed ? "Find again" : "Find on map"}
        </Btn>
      </div>
    </div>
  );
}

function Contacts({ list, onSave }) {
  const [draft, setDraft] = useState({ name: "", role: "", phone: "" });
  const add = () => {
    if (!draft.name.trim()) return;
    onSave([...list, { ...draft, phone: formatPhone(draft.phone) }]);
    setDraft({ name: "", role: "", phone: "" });
  };
  return (
    <div>
      <span className="label">Other people</span>
      {list.map((c, i) => (
        <div key={i} className="flex items-center gap-2 text-sm py-1">
          <span className="font-semibold">{c.name}</span>
          {c.role && <span className="text-faint">{c.role}</span>}
          {c.phone && <a className="font-mono text-xs ml-auto" href={telHref(c.phone)}>{formatPhone(c.phone)}</a>}
          <button onClick={() => onSave(list.filter((_, j) => j !== i))} className="text-faint hover:text-redwood"><Trash2 size={13} /></button>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 mt-1">
        <input className="field text-sm py-1.5" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input className="field text-sm py-1.5" placeholder="Role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
        <input className="field text-sm py-1.5" placeholder="Phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} onBlur={() => setDraft((d) => ({ ...d, phone: formatPhone(d.phone) }))} />
        <Btn kind="soft" className="px-2" onClick={add}><Plus size={14} /></Btn>
      </div>
    </div>
  );
}

function PriceGrid({ vendor, onSave }) {
  const prices = vendor.pv.prices || {};
  const set = (key, val) => {
    const next = { ...prices };
    if (val === "" || Number(val) === 0) delete next[key];
    else next[key] = Number(val);
    onSave(next);
  };
  return (
    <Section title="Prices per board">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-faint font-mono text-left">
              <th className="py-1.5 pr-2">Size</th>
              {FINISHES.map((f) => <th key={f.id} className="py-1.5 px-1">{f.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {SIZES.map((s) => (
              <tr key={s.code} className="border-t border-kraft">
                <td className="py-1.5 pr-2 whitespace-nowrap"><b>{s.code}</b> <span className="text-xs text-faint">{s.code === "DF" ? "per bf" : s.label}</span></td>
                {FINISHES.map((f) => (
                  <td key={f.id} className="py-1 px-1">
                    <Blur type="number" step="0.01" className="field py-1.5 text-sm font-mono" value={prices[`${s.code}:${f.id}`] ?? ""} onSave={(x) => set(`${s.code}:${f.id}`, x)} placeholder="" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-faint mt-2">Truckloads fill prices in from here. You can still change a price on the truck.</div>
    </Section>
  );
}

const KINDS = [{ id: "call", label: "Call" }, { id: "text", label: "Text" }, { id: "visit", label: "Visit" }, { id: "email", label: "Email" }, { id: "note", label: "Note" }];

function ActivityLog({ vendor, acts, me }) {
  const { logActivity, updateActivity, deleteActivity } = useData();
  const blank = () => ({ kind: "call", summary: "", stock: {}, restock_date: "", follow_up: "" });
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const hasStock = Object.values(f.stock).some((x) => Number(x) > 0);
  const canSave = f.summary.trim() || hasStock || f.restock_date || f.follow_up;

  const save = async () => {
    setSaving(true);
    const stock = Object.fromEntries(Object.entries(f.stock).filter(([, n]) => Number(n) > 0).map(([k, n]) => [k, Number(n)]));
    await logActivity({
      supplier_id: vendor.id, kind: f.kind, by: me || null, summary: f.summary.trim() || null,
      stock: Object.keys(stock).length ? stock : null,
      restock_date: f.restock_date || null, follow_up: f.follow_up || null,
    });
    setF(blank());
    setSaving(false);
  };

  const stockKeys = useMemo(() => ["165", "166", "185", "186", "185P", "186P"], []);

  return (
    <Section title="Activity">
      <div className="rounded-lg bg-paper p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => setF({ ...f, kind: k.id })}
              className={`rounded-full px-3 py-1 text-xs font-semibold border ${f.kind === k.id ? "bg-ink text-white border-ink" : "bg-white border-kraft-dark"}`}>{k.label}</button>
          ))}
          {!me && <span className="text-xs text-warn ml-auto self-center">Pick your name in the menu so entries show who logged them</span>}
        </div>
        <textarea className="field" rows={2} placeholder="What did they say?" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
        <div>
          <span className="label">Units they have now</span>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {stockKeys.map((k) => (
              <label key={k} className="block">
                <span className="text-[11px] font-mono text-faint">{k}</span>
                <input type="number" min="0" className="field py-1.5 text-sm" value={f.stock[k] ?? ""} onChange={(e) => setF({ ...f, stock: { ...f.stock, [k]: e.target.value } })} />
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Expect more by"><input type="date" className="field" value={f.restock_date} onChange={(e) => setF({ ...f, restock_date: e.target.value })} /></Field>
          <Field label="Follow up on"><input type="date" className="field" min={today()} value={f.follow_up} onChange={(e) => setF({ ...f, follow_up: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end">
          <Btn kind="primary" onClick={save} disabled={!canSave || saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Log it</Btn>
        </div>
      </div>

      <div className="mt-4 space-y-0 divide-y divide-kraft">
        {acts.length === 0 && <Empty>No activity yet. Log the first call above.</Empty>}
        {acts.map((a) => (
          <div key={a.id} className="py-3 group">
            <div className="flex items-center gap-2 text-xs text-faint">
              <Pill>{KINDS.find((k) => k.id === a.kind)?.label || a.kind}</Pill>
              <span>{new Date(a.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              {a.by && <span>· {a.by}</span>}
              <button onClick={() => { if (confirm("Delete this entry?")) deleteActivity(a.id); }} className="ml-auto opacity-0 group-hover:opacity-100 hover:text-redwood"><Trash2 size={13} /></button>
            </div>
            {a.summary && <div className="mt-1.5 text-sm whitespace-pre-wrap">{a.summary}</div>}
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {a.stock && Object.entries(a.stock).map(([k, n]) => <Pill key={k} tone="moss">{n} × {k}</Pill>)}
              {a.restock_date && <Pill tone="gold">More by {shortDate(a.restock_date)}</Pill>}
              {a.follow_up && (
                <button onClick={() => updateActivity(a.id, { follow_up_done: !a.follow_up_done })}>
                  <Pill tone={a.follow_up_done ? "plain" : "warn"}>{a.follow_up_done ? <><Check size={11} /> Followed up</> : `Follow up ${shortDate(a.follow_up)}`}</Pill>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
