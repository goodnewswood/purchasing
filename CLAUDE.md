# GNWS Purchasing

The buying side of Good News Wood Salvation (reclaimed redwood, Nevada City, CA): vendors and
their tiers, the activity log, the supply board, truckloads and pickup routing, purchase history,
and vendor checks. Sister apps: GNWS Office (`goodnewswood/office`, sales) and GNWS Ops
(`goodnewswood/operations`, shop floor). All three share one Supabase project.

## Who you're working for

- Ero runs the business and isn't a developer. Explain every change in plain language: what
  changed, what he'll see, and anything he has to do.
- Never use em dashes in anything you write: replies, UI text, comments, commit messages.
- Several people and Claude sessions push here. Expect `origin/main` to move under you.

## Stack

- React 19, Vite, Tailwind v4, lucide-react. `src/App.jsx` is the shell and hash router;
  screens are in `src/screens/`, shared logic in `src/lib/`, data in `src/store.jsx`.
- Short plain-language "why" comments, like the code around them.

## Data

- Purchasing's own tables are `pur_*`: `pur_vendors` (profile per vendor: tier, crews, zone,
  pickup address and coordinates, hours, dock notes, contacts, price grid), `pur_zones`,
  `pur_activities`, `pur_purchases` (the old Purchase Tracking sheet), `pur_truckloads`,
  `pur_checks`, `pur_settings` (shop, truck, broker, checks).
- Shared with Office and Ops through the `kv` table, one JSON array per row:
  vendors `gnws-shared-suppliers-v1` (keyed by supplier id, which `pur_vendors.supplier_id`
  points at), POs `gnws-shared-pos-v1`, products `gnws-shared-products-v1`.
  Always write kv through `kvUpdate` in `src/lib/db.js`: read fresh, change only what you
  mean to, write right away. A stale whole-array write erases other people's edits.
- POs created here are `status: "ordered"` and never touch inventory. Ops receives them.
  Lines use the RAW SKU (`185RAW`) and carry a `finish` (natural, painted, endtrim).
- Prices live in `pur_vendors.prices` as `"<size>:<finish>": price per board` (per bf for DF).

## Truck rules (nominal)

- 48,000 lbs, 32 spots (8 courses of 4, double stacked), 53 ft. 1.5 lbs per board foot.
- 165/185 units are 1,000 bf, 166/186 are 1,200 bf. Weight usually runs out before space.
- All of this is editable in Settings and stored in `pur_settings.truck`.

## Working on it

- Local: `npm install`, then `npm run dev` (http://localhost:5175). Needs a `.env` (never
  committed) with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Before committing: `git fetch origin && git merge --ff-only origin/main`, and `npm run build`
  must pass. Commit and push straight to `main`.
- There is no staging. Local dev reads and writes production data. Don't change live records
  unless asked, and put back anything you change while testing.
