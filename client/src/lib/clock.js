import { useEffect, useState } from 'react';

const DAYS = { id: ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const MONTHS = {
  id: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', weekday: 'short' });
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Current WIB wall-clock, read straight from Intl with timeZone Asia/Jakarta (no manual offsets).
export function wibParts(d = new Date()) {
  const o = {};
  for (const p of dtf.formatToParts(d)) o[p.type] = p.value;
  return { wd: WD[o.weekday], day: Number(o.day), month: Number(o.month), year: o.year, hh: o.hour.padStart(2, '0'), mm: o.minute.padStart(2, '0') };
}

// id: 'Sen, 27 Okt 2025 · 14:32'   en: 'Mon, Oct 27, 2025 · 14:32'  (24h, WIB)
export function fmtNow(lang, d = new Date()) {
  const p = wibParts(d);
  const l = lang === 'en' ? 'en' : 'id';
  const date = l === 'en' ? `${DAYS.en[p.wd]}, ${MONTHS.en[p.month - 1]} ${p.day}, ${p.year}` : `${DAYS.id[p.wd]}, ${p.day} ${MONTHS.id[p.month - 1]} ${p.year}`;
  return { date, time: `${p.hh}:${p.mm}` };
}

export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let h;
    const tick = () => { setNow(new Date()); h = setTimeout(tick, 60000 - (Date.now() % 60000) + 50); }; // on the minute
    h = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    return () => clearTimeout(h);
  }, []);
  return now;
}
