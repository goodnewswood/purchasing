import { useState } from "react";
import { Check } from "lucide-react";
import { useData } from "../store.jsx";
import { PageHeader, Section, Field, Btn } from "../ui.jsx";

function SettingForm({ title, keyName, fields, help }) {
  const { settings, saveSetting } = useData();
  const [v, setV] = useState(settings[keyName] || {});
  const [saved, setSaved] = useState(false);
  const save = async () => {
    const out = { ...v };
    fields.forEach((f) => { if (f.type === "number" && out[f.key] !== "" && out[f.key] != null) out[f.key] = Number(out[f.key]); });
    await saveSetting(keyName, out);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  return (
    <Section title={title} action={<Btn kind="primary" onClick={save}>{saved ? <><Check size={14} /> Saved</> : "Save"}</Btn>}>
      {help && <p className="text-xs text-faint mb-3">{help}</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} className={f.wide ? "sm:col-span-2" : ""}>
            <input type={f.type || "text"} step={f.step} className="field" value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} placeholder={f.placeholder} />
          </Field>
        ))}
      </div>
    </Section>
  );
}

function Zones() {
  const { zones, saveZone, vendors } = useData();
  const [drafts, setDrafts] = useState({});
  const [newName, setNewName] = useState("");
  const count = (id) => vendors.filter((v) => !v.hidden && v.pv.zone_id === id).length;
  return (
    <Section title="Zones" action={null}>
      <p className="text-xs text-faint mb-3">A vendor lands in a zone when its pickup address names one of these cities. Truck costs are tracked by zone.</p>
      <div className="space-y-3">
        {zones.map((z) => {
          const d = drafts[z.id] ?? (z.cities || []).join(", ");
          const changed = d !== (z.cities || []).join(", ");
          return (
            <div key={z.id} className="rounded-lg border border-kraft p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold">{z.name}</span>
                <span className="text-xs text-faint">{count(z.id)} vendor{count(z.id) === 1 ? "" : "s"}</span>
              </div>
              <div className="flex gap-2">
                <input className="field text-sm" value={d} onChange={(e) => setDrafts({ ...drafts, [z.id]: e.target.value })} />
                {changed && <Btn kind="primary" onClick={async () => {
                  await saveZone({ ...z, cities: d.split(",").map((c) => c.trim()).filter(Boolean) });
                  setDrafts((x) => { const n = { ...x }; delete n[z.id]; return n; });
                }}>Save</Btn>}
              </div>
            </div>
          );
        })}
        <div className="flex gap-2">
          <input className="field" placeholder="New zone name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Btn disabled={!newName.trim()} onClick={async () => {
            const id = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
            await saveZone({ id, name: newName.trim(), cities: [], sort: zones.length + 1 });
            setNewName("");
          }}>Add zone</Btn>
        </div>
      </div>
    </Section>
  );
}

export default function Settings() {
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />
      <SettingForm title="Freight broker" keyName="broker" help="Who the truckload booking email goes to."
        fields={[{ key: "name", label: "Name" }, { key: "company", label: "Company" }, { key: "email", label: "Email", wide: true }, { key: "phone", label: "Phone" }]} />
      <SettingForm title="Truck" keyName="truck" help="Nominal limits for a 53 ft trailer. Wet factor multiplies the weight of any line marked wet, so 1.3 means 30% heavier."
        fields={[
          { key: "maxLbs", label: "Max weight (lbs)", type: "number" }, { key: "spots", label: "Unit spots", type: "number" },
          { key: "courses", label: "Courses", type: "number" }, { key: "perCourse", label: "Units per course", type: "number" },
          { key: "lbsPerBf", label: "Lbs per board foot", type: "number", step: "0.05" }, { key: "wetFactor", label: "Wet factor", type: "number", step: "0.05" },
        ]} />
      <SettingForm title="Shop (delivery)" keyName="shop" help="Where every truck delivers. The contact and phone print on bills of lading. Latitude and longitude place the shop for routing."
        fields={[{ key: "address", label: "Address", wide: true }, { key: "contact", label: "Receiving contact" }, { key: "phone", label: "Receiving phone" }, { key: "lat", label: "Latitude", type: "number", step: "0.0001" }, { key: "lng", label: "Longitude", type: "number", step: "0.0001" }]} />
      <SettingForm title="Checks" keyName="checks" help="Offsets nudge everything printed on the check, in inches. Positive moves right and down. Print the test page from the Checks screen to dial it in."
        fields={[{ key: "nextNumber", label: "Next check number", type: "number" }, { key: "offsetX", label: "Offset right (in)", type: "number", step: "0.01" }, { key: "offsetY", label: "Offset down (in)", type: "number", step: "0.01" }]} />
      <Zones />
    </div>
  );
}
