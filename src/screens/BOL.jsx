import { useState } from "react";
import { ChevronLeft, Printer } from "lucide-react";
import { useData } from "../store.jsx";
import { sizeOf, finishLabel, lineBf, lineBoards, lineLbs } from "../lib/catalog";
import { num, longDate, formatPhone } from "../lib/format";
import { Btn, Field } from "../ui.jsx";

/* Bill of lading for a truckload. One page per pickup, because each vendor
   signs for what they load. Carrier details can be typed in before printing
   or left blank and filled in by hand at the dock. */
export default function BOL({ id }) {
  const { truckloads, vendors, settings, pos } = useData();
  const t = truckloads.find((x) => x.id === id);
  const truck = settings.truck || { lbsPerBf: 1.5, wetFactor: 1 };
  const shop = settings.shop || {};
  const broker = settings.broker || {};
  const [f, setF] = useState({ carrier: "", trailer: "", seal: "", pro: "", terms: "Third party, bill to consignee", notes: "" });
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value }));

  if (!t) return <div className="text-faint">Truckload not found. <a className="underline" href="#/truckloads">Back</a></div>;

  const vOf = (sid) => vendors.find((v) => v.id === sid);
  const picks = (t.picks || []).filter((p) => p.supplierId && Number(p.units) > 0);
  // Pickup order is the saved route, then any vendor the route doesn't list yet.
  const routeIds = Array.isArray(t.route) ? t.route : t.route?.order || [];
  const ids = [...new Set([...routeIds.filter((r) => picks.some((p) => p.supplierId === r)), ...picks.map((p) => p.supplierId)])];
  const stops = ids.map((sid) => ({ v: vOf(sid), sid, lines: picks.filter((p) => p.supplierId === sid) }));
  const truckLbs = picks.reduce((s, p) => s + lineLbs(p, truck), 0);

  const describe = (p) => {
    const s = sizeOf(p.size);
    if (p.desc) return p.desc;
    if (s.code === "DF") return `Reclaimed Douglas fir, ${num(lineBf(p))} bf`;
    return `Reclaimed redwood fence boards, ${s.label} (${s.code}), ${finishLabel(p.finish).toLowerCase()}, ${num(lineBoards(p))} boards`;
  };
  const poFor = (sid) => pos.filter((p) => (t.po_ids || []).includes(p.id) && p.supplierId === sid).map((p) => p.number).join(", ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <a href={`#/truckloads/${id}`} className="inline-flex items-center gap-1 text-sm text-faint hover:text-ink mr-auto"><ChevronLeft size={15} /> Truckload {t.number}</a>
        <Btn kind="primary" onClick={() => window.print()} disabled={!stops.length}><Printer size={15} /> Print BOL</Btn>
      </div>

      <div className="card p-4 print:hidden">
        <div className="text-sm text-faint mb-3">
          {stops.length} page{stops.length === 1 ? "" : "s"}, one per pickup. Fill in what you know, leave the rest blank to write in at the dock.
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Carrier"><input className="field" value={f.carrier} onChange={set("carrier")} placeholder="Trucking company" /></Field>
          <Field label="Trailer #"><input className="field" value={f.trailer} onChange={set("trailer")} /></Field>
          <Field label="Seal #"><input className="field" value={f.seal} onChange={set("seal")} /></Field>
          <Field label="PRO / load #"><input className="field" value={f.pro} onChange={set("pro")} /></Field>
          <Field label="Freight terms" className="col-span-2"><input className="field" value={f.terms} onChange={set("terms")} /></Field>
          <Field label="Special instructions" className="col-span-2"><input className="field" value={f.notes} onChange={set("notes")} placeholder="Call before arrival, forklift on site…" /></Field>
        </div>
      </div>

      {!stops.length && <div className="text-faint text-sm">Add lines to the truckload first.</div>}

      <div className="overflow-auto print:overflow-visible">
        <div className="print-area">
          {stops.map((s, i) => {
            const lbs = s.lines.reduce((x, p) => x + lineLbs(p, truck), 0);
            const units = s.lines.reduce((x, p) => x + (Number(p.units) || 0), 0);
            return (
              <div key={s.sid} className="bg-white text-black mx-auto shadow print:shadow-none mb-6 print:mb-0"
                style={{ width: "8.5in", minHeight: "11in", padding: "0.5in", boxSizing: "border-box", fontSize: "9.5pt", breakAfter: i < stops.length - 1 ? "page" : "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #000", paddingBottom: "6pt" }}>
                  <div>
                    <div style={{ fontSize: "18pt", fontWeight: 800, letterSpacing: "-0.01em" }}>BILL OF LADING</div>
                    <div>Straight bill of lading, not negotiable</div>
                  </div>
                  <table style={{ borderCollapse: "collapse", fontSize: "9pt" }}>
                    <tbody>
                      <KV k="BOL #" v={`${t.number}-${i + 1}`} />
                      <KV k="Date" v={t.date ? longDate(t.date) : ""} />
                      <KV k="Stop" v={`${i + 1} of ${stops.length}`} />
                      <KV k="PO #" v={poFor(s.sid)} />
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8pt", marginTop: "8pt" }}>
                  <Box title="Ship from (shipper)">
                    <div style={{ fontWeight: 700 }}>{s.v?.name || "Unknown vendor"}</div>
                    <div>{s.v?.pv.pickup_address || <Blank />}</div>
                    <div>Contact: {[s.v?.contact, formatPhone(s.v?.phone)].filter(Boolean).join(", ") || <Blank />}</div>
                    {s.v?.pv.hours && <div>Hours: {s.v.pv.hours}</div>}
                  </Box>
                  <Box title="Ship to (consignee)">
                    <div style={{ fontWeight: 700 }}>Good News Wood Salvation</div>
                    <div>{shop.address || <Blank />}</div>
                    <div>Contact: {[shop.contact || "Ero", formatPhone(shop.phone || "5304606083")].join(", ")}</div>
                  </Box>
                  <Box title="Bill freight to">
                    <div style={{ fontWeight: 700 }}>Good News Wood Salvation</div>
                    <div>{shop.address}</div>
                    <div>Terms: {f.terms || <Blank />}</div>
                  </Box>
                  <Box title="Carrier">
                    <Row k="Carrier" v={f.carrier} />
                    <Row k="Broker" v={[broker.company || broker.name, broker.phone && formatPhone(broker.phone)].filter(Boolean).join(", ")} />
                    <Row k="Trailer #" v={f.trailer} />
                    <Row k="Seal #" v={f.seal} />
                    <Row k="PRO / load #" v={f.pro} />
                  </Box>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10pt" }}>
                  <thead>
                    <tr style={{ background: "#eee" }}>
                      <Th w="0.7in">Units</Th><Th w="0.8in">Type</Th><Th>Description</Th><Th w="0.9in" right>Board ft</Th><Th w="1in" right>Weight (lbs)</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.lines.map((p) => (
                      <tr key={p.key}>
                        <Td>{p.units}</Td>
                        <Td>{sizeOf(p.size).code === "DF" || p.desc ? "Bundle" : "Unit"}</Td>
                        <Td>{describe(p)}{p.wet ? " (wet)" : ""}</Td>
                        <Td right>{num(lineBf(p))}</Td>
                        <Td right>{num(lineLbs(p, truck))}</Td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700 }}>
                      <Td>{units}</Td><Td></Td><Td>Total this stop</Td>
                      <Td right>{num(s.lines.reduce((x, p) => x + lineBf(p), 0))}</Td>
                      <Td right>{num(lbs)}</Td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ fontSize: "8pt", marginTop: "3pt", color: "#444" }}>
                  Weights are estimates. Whole truck about {num(truckLbs)} lbs across {stops.length} stop{stops.length === 1 ? "" : "s"}: {stops.map((x, j) => `${j + 1}. ${x.v?.name || "?"}`).join("  ")}.
                </div>

                <Box title="Special instructions" style={{ marginTop: "10pt", minHeight: "0.6in" }}>
                  {f.notes}
                </Box>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8pt", marginTop: "14pt" }}>
                  <Sign title="Shipper" lines={["Printed name", "Signature", "Date / time", "Units loaded"]} />
                  <Sign title="Carrier / driver" lines={["Printed name", "Signature", "Date / time", "Units received"]} />
                  <Sign title="Consignee" lines={["Printed name", "Signature", "Date / time", "Received in good order"]} />
                </div>

                <div style={{ fontSize: "7.5pt", color: "#444", marginTop: "12pt", lineHeight: 1.35 }}>
                  Received, subject to the classifications and tariffs in effect on the date of issue, the property described above in apparent good order, except as noted. The carrier agrees to carry it to the destination shown. Shipper and carrier signatures confirm the count loaded; consignee signature confirms the count received.
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const KV = ({ k, v }) => (
  <tr><td style={{ padding: "1pt 6pt 1pt 0", fontWeight: 700 }}>{k}</td><td style={{ padding: "1pt 0", minWidth: "1.4in", borderBottom: "1px solid #999" }}>{v}</td></tr>
);
const Box = ({ title, children, style }) => (
  <div style={{ border: "1px solid #000", padding: "5pt 6pt", ...style }}>
    <div style={{ fontSize: "7.5pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3pt" }}>{title}</div>
    {children}
  </div>
);
const Row = ({ k, v }) => (
  <div style={{ display: "flex", gap: "4pt" }}><span style={{ minWidth: "0.85in" }}>{k}:</span><span style={{ flex: 1, borderBottom: "1px solid #999" }}>{v || " "}</span></div>
);
const Blank = () => <span style={{ display: "inline-block", width: "2in", borderBottom: "1px solid #999" }}>&nbsp;</span>;
const Th = ({ children, w, right }) => (
  <th style={{ border: "1px solid #000", padding: "3pt 5pt", textAlign: right ? "right" : "left", width: w, fontSize: "8.5pt" }}>{children}</th>
);
const Td = ({ children, right }) => (
  <td style={{ border: "1px solid #000", padding: "3pt 5pt", textAlign: right ? "right" : "left", verticalAlign: "top" }}>{children}</td>
);
const Sign = ({ title, lines }) => (
  <div style={{ border: "1px solid #000", padding: "5pt 6pt" }}>
    <div style={{ fontSize: "7.5pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
    {lines.map((l) => (
      <div key={l} style={{ marginTop: "16pt", borderTop: "1px solid #000", fontSize: "7pt", color: "#444", paddingTop: "1pt" }}>{l}</div>
    ))}
  </div>
);
