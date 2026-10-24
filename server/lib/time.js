// WIB (Asia/Jakarta, UTC+7, no DST) helpers. Never produce UTC strings.
// Computed from epoch + fixed offset so the result is correct even if TZ is not applied.
const WIB_OFFSET_MS = 7 * 3600 * 1000;

/** Current WIB time as 'YYYY-MM-DD HH:MM:SS'. */
export function nowWib(date = new Date()) {
  return new Date(date.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
}

/** WIB string shifted by `minutes` from now. */
export function wibFromNow(minutes) {
  return nowWib(new Date(Date.now() + minutes * 60000));
}

const MONTHS = {
  id: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const PARTS_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/;

/**
 * Human WIB time from a stored 'YYYY-MM-DD HH:MM[:SS]' string.
 * id: '24 Okt 2026 21.55', en: 'Oct 24, 2026 21:55'; `suffix` appends ' WIB'.
 */
export function formatWib(s, lang = 'id', { suffix = false } = {}) {
  const m = PARTS_RE.exec(String(s ?? ''));
  if (!m) return s ?? '';
  const [, y, mo, d, h, mi] = m;
  const mon = MONTHS[lang === 'en' ? 'en' : 'id'][Number(mo) - 1];
  const out = lang === 'en' ? `${mon} ${Number(d)}, ${y} ${h}:${mi}` : `${Number(d)} ${mon} ${y} ${h}.${mi}`;
  return suffix ? `${out} WIB` : out;
}

/** '24 Okt 2026 21.55 - 25 Okt 2026 08.00 WIB' / 'Oct 24, 2026 21:55 - Oct 25, 2026 08:00 WIB' */
export function formatWibRange(a, b, lang = 'id') {
  return `${formatWib(a, lang)} - ${formatWib(b, lang)} WIB`;
}

const DT_RE =/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Parse a WIB datetime input ('YYYY-MM-DD HH:MM[:SS]', 'T' separator accepted).
 * Returns the normalized 'YYYY-MM-DD HH:MM:SS' string or null when invalid.
 */
export function normalizeWib(input) {
  if (typeof input !== 'string') return null;
  const m = DT_RE.exec(input.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00'] = m;
  const n = [y, mo, d, h, mi, s].map(Number);
  const probe = new Date(Date.UTC(n[0], n[1] - 1, n[2], n[3], n[4], n[5]));
  if (
    probe.getUTCFullYear() !== n[0] || probe.getUTCMonth() !== n[1] - 1 || probe.getUTCDate() !== n[2] ||
    probe.getUTCHours() !== n[3] || probe.getUTCMinutes() !== n[4] || probe.getUTCSeconds() !== n[5]
  ) return null;
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}
