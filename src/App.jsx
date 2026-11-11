import { lazy, Suspense, useEffect, useState } from "react";
import { LayoutGrid, Users, Container, History as HistoryIcon, FileCheck2, PieChart as PieIcon, Settings as SettingsIcon, RefreshCw, Undo2, Redo2 } from "lucide-react";
import { useData, useMe } from "./store.jsx";
import Home from "./screens/Home.jsx";
import Vendors from "./screens/Vendors.jsx";
import Truckloads from "./screens/Truckloads.jsx";
import History from "./screens/History.jsx";
import Checks from "./screens/Checks.jsx";
import Settings from "./screens/Settings.jsx";
// Charts are a big download, so Reports loads only when opened.
const Reports = lazy(() => import("./screens/Reports.jsx"));

const NAV = [
  { id: "home", label: "Supply", icon: LayoutGrid },
  { id: "vendors", label: "Vendors", icon: Users },
  { id: "truckloads", label: "Truckloads", icon: Container },
  { id: "history", label: "History", icon: HistoryIcon },
  { id: "checks", label: "Checks", icon: FileCheck2 },
  { id: "reports", label: "Reports", icon: PieIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];
const TEAM = ["Ero", "Leo", "Allison", "Will"];

/* Routes live in the URL hash (#/vendors/v34) so the back button works and
   a link to a vendor or truck can be shared. */
function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => { setParts(read()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}

/* Undo and redo, with Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z. Inside a text box the
   keys keep their normal job of undoing typing. */
// Only one copy listens for the keys; the phone and desktop bars are both mounted.
function UndoRedo({ dark, shortcuts }) {
  const { undo, redo, canUndo, canRedo, undoLabel, redoLabel, historyBusy } = useData();
  useEffect(() => {
    if (!shortcuts) return undefined;
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const t = document.activeElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, shortcuts]);
  const cls = dark
    ? "flex-1 flex items-center justify-center gap-1.5 rounded-md border border-white/10 py-1.5 text-xs font-semibold text-kraft-dark hover:text-white hover:bg-white/6 disabled:opacity-30 disabled:hover:bg-transparent"
    : "p-1.5 rounded text-kraft-dark hover:text-white disabled:opacity-30";
  return (
    <div className={dark ? "flex gap-1.5" : "flex gap-0.5"}>
      <button className={cls} disabled={!canUndo || historyBusy} onClick={undo} title={canUndo ? `Undo ${undoLabel}` : "Nothing to undo"}>
        <Undo2 size={dark ? 13 : 17} />{dark && " Undo"}
      </button>
      <button className={cls} disabled={!canRedo || historyBusy} onClick={redo} title={canRedo ? `Redo ${redoLabel}` : "Nothing to redo"}>
        <Redo2 size={dark ? 13 : 17} />{dark && " Redo"}
      </button>
    </div>
  );
}

export default function App() {
  const { status, error, reload } = useData();
  const [me, setMe] = useMe();
  const [section = "home", id, sub] = useRoute();

  if (status === "loading") {
    return <div className="h-full flex items-center justify-center text-faint font-mono text-sm">Loading purchasing data…</div>;
  }
  if (status === "error") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="font-bold">Couldn't reach the database</div>
        <div className="text-sm text-faint max-w-md">{error}</div>
        <button className="underline" onClick={reload}>Try again</button>
      </div>
    );
  }

  const screen = {
    home: <Home me={me} />,
    vendors: <Vendors id={id} me={me} />,
    truckloads: <Truckloads id={id} sub={sub} />,
    history: <History />,
    checks: <Checks id={id} />,
    reports: <Suspense fallback={<div className="text-faint text-sm font-mono">Loading reports…</div>}><Reports /></Suspense>,
    settings: <Settings />,
  }[section] || <Home me={me} />;

  return (
    <div className="min-h-full flex">
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-ink text-white sticky top-0 h-screen">
        <div className="px-5 pt-6 pb-4">
          <div className="text-[11px] tracking-[0.2em] text-kraft-dark font-mono">GNWS</div>
          <div className="text-xl font-extrabold tracking-tight">Purchasing</div>
          <div className="mt-4"><UndoRedo dark shortcuts /></div>
        </div>
        <nav className="flex-1 px-2 space-y-0.5">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = section === n.id;
            return (
              <a key={n.id} href={`#/${n.id}`}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-white/12 text-white" : "text-kraft-dark hover:bg-white/6 hover:text-white"}`}>
                <Icon size={17} /> {n.label}
              </a>
            );
          })}
        </nav>
        <div className="p-4 space-y-2 border-t border-white/10">
          <label className="block text-[11px] font-mono tracking-wider text-kraft-dark">YOU ARE</label>
          <select className="w-full rounded-md bg-ink-2 border border-white/10 px-2 py-1.5 text-sm" value={me} onChange={(e) => setMe(e.target.value)}>
            <option value="">Pick your name</option>
            {TEAM.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button onClick={reload} className="flex items-center gap-1.5 text-xs text-kraft-dark hover:text-white"><RefreshCw size={12} /> Refresh data</button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden sticky top-0 z-30 bg-ink text-white px-4 py-3 flex items-center justify-between">
          <div className="font-extrabold tracking-tight">GNWS Purchasing</div>
          <div className="ml-auto mr-2"><UndoRedo /></div>
          <select className="rounded bg-ink-2 border border-white/10 px-2 py-1 text-xs" value={me} onChange={(e) => setMe(e.target.value)}>
            <option value="">Who are you?</option>
            {TEAM.map((t) => <option key={t}>{t}</option>)}
          </select>
        </header>
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-10">{screen}</main>
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-kraft grid grid-cols-7">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = section === n.id;
            return (
              <a key={n.id} href={`#/${n.id}`} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${active ? "text-redwood" : "text-faint"}`}>
                <Icon size={19} /> {n.label}
              </a>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
