import { X } from "lucide-react";

export const Field = ({ label, children, className = "" }) => (
  <label className={`block ${className}`}>
    {label && <span className="label">{label}</span>}
    {children}
  </label>
);

export const Btn = ({ children, kind = "ghost", className = "", ...rest }) => {
  const styles = {
    primary: "bg-redwood text-white border-redwood-dark hover:bg-redwood-dark",
    dark: "bg-ink text-white border-ink hover:bg-ink-2",
    ghost: "bg-white text-ink border-kraft-dark hover:bg-paper",
    soft: "bg-paper text-ink border-transparent hover:bg-kraft",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${styles[kind]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

export const Pill = ({ children, tone = "plain", className = "" }) => {
  const tones = {
    plain: "bg-paper text-ink-2",
    moss: "bg-moss-light text-moss",
    warn: "bg-warn-light text-warn",
    red: "bg-redwood text-white",
    dark: "bg-ink text-white",
    gold: "bg-[#f3e6c8] text-[#7a5a17]",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${tones[tone]} ${className}`}>{children}</span>;
};

export const TierBadge = ({ tier }) => {
  if (!tier) return <Pill>No tier</Pill>;
  const tone = tier === 1 ? "red" : tier === 2 ? "gold" : "plain";
  return <Pill tone={tone}>Tier {tier}</Pill>;
};

export const Stat = ({ label, value, sub, tone }) => (
  <div className="card p-4">
    <div className="label">{label}</div>
    <div className={`text-2xl font-extrabold tracking-tight ${tone === "warn" ? "text-warn" : ""}`}>{value}</div>
    {sub && <div className="text-xs text-faint mt-0.5">{sub}</div>}
  </div>
);

export const Section = ({ title, action, children, className = "" }) => (
  <section className={`card p-4 sm:p-5 ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-bold text-[15px]">{title}</h2>
        {action}
      </div>
    )}
    {children}
  </section>
);

export const PageHeader = ({ title, sub, children }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {sub && <p className="text-sm text-faint mt-0.5">{sub}</p>}
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-ink/60 p-4" onClick={onClose}>
      <div className={`card mx-auto my-8 w-full ${wide ? "max-w-3xl" : "max-w-lg"} p-5`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-paper" aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Empty = ({ children }) => <div className="text-sm text-faint py-6 text-center">{children}</div>;
