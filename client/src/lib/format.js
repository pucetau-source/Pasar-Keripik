// Money: whole Rupiah, id-ID grouping. Date-times: WIB strings, never converted.
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 });

export const rupiah = (n) => (n == null || n === '' || Number.isNaN(Number(n)) ? '-' : 'Rp\u00a0' + nf.format(Math.round(Number(n))));
export const num = (n) => (n == null || n === '' ? '-' : nf2.format(Number(n)));
export const int = (n) => (n == null || n === '' ? '-' : nf.format(Number(n)));
export const digits = (s) => String(s ?? '').replace(/[^\d]/g, '');

const MONTHS = {
  id: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

// 'YYYY-MM-DD HH:MM:SS' -> '24 Okt 2026, 14:30 WIB' (pure string work)
export function fmtWib(s, lang = 'id', withSeconds = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s || '');
  if (!m) return s || '-';
  const mon = MONTHS[lang][Number(m[2]) - 1] || m[2];
  return `${Number(m[3])} ${mon} ${m[1]}, ${m[4]}:${m[5]}${withSeconds ? ':' + (m[6] || '00') : ''} WIB`;
}

// WIB string <-> <input type="datetime-local"> value, by string manipulation only
export const wibToInput = (s) => (s ? String(s).slice(0, 16).replace(' ', 'T') : '');
export const inputToWib = (v) => (v ? v.replace('T', ' ').slice(0, 16) + ':00' : '');
