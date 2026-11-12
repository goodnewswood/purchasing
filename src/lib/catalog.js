/* What we buy. Everything comes in as RAW; the finish is an option on the
   line, not a separate SKU. Size codes read thickness, width, length:
   185 = 1x8 at 5 ft. Board feet per board drive weight and truck fill. */

export const SIZES = [
  { code: "165", label: "1x6 x 5'", species: "redwood", boardsPerUnit: 400, bfPerBoard: 2.5 },
  { code: "166", label: "1x6 x 6'", species: "redwood", boardsPerUnit: 400, bfPerBoard: 3 },
  { code: "185", label: "1x8 x 5'", species: "redwood", boardsPerUnit: 300, bfPerBoard: 10 / 3 },
  { code: "186", label: "1x8 x 6'", species: "redwood", boardsPerUnit: 300, bfPerBoard: 4 },
  { code: "164", label: "1x6 x 4'", species: "redwood", boardsPerUnit: 400, bfPerBoard: 2 },
  { code: "184", label: "1x8 x 4'", species: "redwood", boardsPerUnit: 300, bfPerBoard: 8 / 3 },
  // Douglas fir varies by load, so the buyer types board feet per unit.
  { code: "DF", label: "Douglas fir", species: "douglas fir", boardsPerUnit: 0, bfPerBoard: 0, bfPerUnit: 1000 },
];
export const MAIN_SIZES = ["165", "166", "185", "186"];

export const FINISHES = [
  { id: "natural", label: "Natural", short: "N" },
  { id: "painted", label: "Painted", short: "P" },
  { id: "endtrim", label: "End trimmed", short: "ET" },
];

export const sizeOf = (code) => SIZES.find((s) => s.code === code) || SIZES[2];
export const finishLabel = (id) => FINISHES.find((f) => f.id === id)?.label || "Natural";

// Board feet in one line of a load: units x boards per unit x bf per board,
// or units x bf per unit for Douglas fir.
export function lineBf(line) {
  const s = sizeOf(line.size);
  const units = Number(line.units) || 0;
  if (s.code === "DF") return units * (Number(line.bfPerUnit) || s.bfPerUnit);
  const perUnit = Number(line.perUnit) || s.boardsPerUnit;
  return units * perUnit * s.bfPerBoard;
}

export function lineBoards(line) {
  const s = sizeOf(line.size);
  if (s.code === "DF") return 0;
  return (Number(line.units) || 0) * (Number(line.perUnit) || s.boardsPerUnit);
}

export function lineLbs(line, truck) {
  const wet = line.wet ? Number(truck?.wetFactor) || 1 : 1;
  return lineBf(line) * (Number(truck?.lbsPerBf) || 1.5) * wet;
}

// The vendor's price per board for a size and finish. Douglas fir is per bf.
export const priceFor = (pv, size, finish) => Number(pv?.prices?.[`${size}:${finish}`]) || 0;

export function lineCost(line) {
  const price = Number(line.price) || 0;
  if (line.size === "DF") return lineBf(line) * price;
  return lineBoards(line) * price;
}

// Inventory SKU a line receives into: the RAW SKU for the size.
export function skuFor(size, products) {
  if (size === "DF") {
    const df = products.find((p) => /doug/i.test(p.sku || "") && !p.archived);
    return { sku: df?.sku || "DOUG FIR", productId: df?.id || null };
  }
  const want = `${size}RAW`;
  const hit = products.find((p) => (p.sku || "").toUpperCase() === want && !p.archived);
  return { sku: want, productId: hit?.id || null };
}

export const TIERS = [
  { id: 1, label: "Tier 1", blurb: "Truckload producers" },
  { id: 2, label: "Tier 2", blurb: "A few units a pickup" },
  { id: 3, label: "Tier 3", blurb: "Small or occasional" },
  // Not a fence crew: salvage yards, deconstruction outfits, mills, one-off lots.
  { id: 4, label: "Other", blurb: "Not a fence company: yards, mills, one-off lots" },
];
export const tierLabel = (id) => TIERS.find((t) => t.id === id)?.label || "No tier";
