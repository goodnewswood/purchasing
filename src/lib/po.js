/* PO money in one place. Lines carry the cost before any discount; the
   discount is a percent off the whole order. Freight is recorded on the PO
   but billed separately, so it is never part of what the vendor is paid. */
export const poSubtotal = (p) => (p?.lines || []).reduce((s, l) => s + (Number(l.cost) || 0), 0);
export const poDiscountPct = (p) => Math.min(100, Math.max(0, Number(p?.discountPct) || 0));
export const poDiscount = (p) => Math.round(poSubtotal(p) * poDiscountPct(p)) / 100;
// What the vendor gets paid.
export const poGoods = (p) => Math.round((poSubtotal(p) - poDiscount(p)) * 100) / 100;
export const poBoards = (p) => (p?.lines || []).reduce((s, l) => s + (Number(l.boardCount) || 0) * (Number(l.copies) || 1), 0);
