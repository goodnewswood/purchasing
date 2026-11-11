/* Pickup routing. With at most a handful of vendors on a truck we can try
   every order and keep the shortest. Distances are straight-line miles with
   a road factor, which is plenty to get the order right; Google Maps gets
   the final route from the link. */

const ROAD_FACTOR = 1.25;

export function miles(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * ROAD_FACTOR;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

/* stops: [{id, lat, lng, ...}]. The truck comes in empty from wherever the
   broker sends it, so the start is free; it always ends at the shop.
   Stops missing coordinates go last in the order given and are flagged. */
export function bestRoute(stops, shop) {
  const located = stops.filter((s) => s.lat != null);
  const unknown = stops.filter((s) => s.lat == null);
  if (located.length === 0) return { order: stops, miles: null, legs: [], unknown };
  let best = null;
  const candidates = located.length <= 7 ? permutations(located) : [located];
  for (const order of candidates) {
    let total = 0;
    const legs = [];
    for (let i = 0; i < order.length - 1; i++) {
      const d = miles(order[i], order[i + 1]);
      legs.push(d);
      total += d;
    }
    const home = miles(order[order.length - 1], shop) || 0;
    legs.push(home);
    total += home;
    if (!best || total < best.miles) best = { order, miles: total, legs };
  }
  return { ...best, order: [...best.order, ...unknown], unknown };
}

export function mapsLink(addresses) {
  const parts = addresses.filter(Boolean).map((a) => encodeURIComponent(a));
  return `https://www.google.com/maps/dir/${parts.join("/")}`;
}

/* Address to coordinates through OpenStreetMap's free lookup. Called only
   when someone presses the button, never in a loop, which keeps us within
   their one-request-a-second rule. */
export async function geocode(address) {
  // The free map lookup can't place suite or unit numbers, so drop them.
  const clean = address.replace(/,?\s*(\b(ste|suite|unit)\b\.?|#)\s*[\w-]+/gi, "").replace(/\s+,/g, ",").trim();
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(clean)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  const hits = await res.json();
  if (!hits.length) return null;
  return { lat: Number(hits[0].lat), lng: Number(hits[0].lon), display: hits[0].display_name };
}

// Which zone an address falls in, by the city names each zone lists.
export function zoneForAddress(address, zones) {
  if (!address) return null;
  const a = address.toLowerCase();
  let hit = null;
  zones.forEach((z) => (z.cities || []).forEach((c) => {
    if (a.includes(c.toLowerCase()) && (!hit || c.length > hit.len)) hit = { id: z.id, len: c.length };
  }));
  return hit?.id || null;
}
