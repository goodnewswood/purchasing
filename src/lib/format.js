export const money = (n) => (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const num = (n, d = 0) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
export const shortDate = (d) => {
  if (!d) return "";
  const dt = new Date(`${String(d).slice(0, 10)}T12:00:00`);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
export const longDate = (d) => {
  if (!d) return "";
  const dt = new Date(`${String(d).slice(0, 10)}T12:00:00`);
  return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
export const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null);
export const daysUntil = (d) => (d ? Math.ceil((new Date(`${String(d).slice(0, 10)}T12:00:00`).getTime() - Date.now()) / 86400000) : null);

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function under1000(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r >= 20) parts.push(TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ""));
  else if (r) parts.push(ONES[r]);
  return parts.join(" ");
}

// "One Thousand Two Hundred Fifty and 50/100", the way a check spells it.
export function amountInWords(amount) {
  const cents = Math.round((Number(amount) || 0) * 100);
  let dollars = Math.floor(cents / 100);
  const c = String(cents % 100).padStart(2, "0");
  if (dollars === 0) return `Zero and ${c}/100`;
  const scales = ["", "Thousand", "Million"];
  const chunks = [];
  let i = 0;
  while (dollars > 0) {
    const part = dollars % 1000;
    if (part) chunks.unshift(`${under1000(part)}${scales[i] ? ` ${scales[i]}` : ""}`);
    dollars = Math.floor(dollars / 1000);
    i++;
  }
  return `${chunks.join(" ")} and ${c}/100`;
}
