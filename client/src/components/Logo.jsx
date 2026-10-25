import { useSettings } from '../lib/settings.jsx';

// Default leaf mark, used whenever no logo is uploaded.
export function LeafMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <path d="M8 31C6 18 14 7 33 6c1 16-7 27-21 26" style={{ fill: 'rgb(var(--brand-600))' }} />
      <path d="M12 33c1-9 6-16 16-21" stroke="#fff" strokeOpacity=".8" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M9 34c0-5 2-9 6-12" style={{ stroke: 'rgb(var(--brand-700))' }} strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function Logo({ size = 36 }) {
  const { logoUrl } = useSettings();
  if (logoUrl) return <img src={logoUrl} alt="" width={size} height={size} className="shrink-0 object-contain rounded-lg" style={{ width: size, height: size }} />;
  return <LeafMark size={size} />;
}
