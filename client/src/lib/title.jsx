import { createContext, useContext, useEffect } from 'react';

// The shell topbar owns the single page title. Pages without a nav entry (product form, audit)
// publish a record-specific title here; it is cleared again when the page unmounts.
export const TitleCtx = createContext(() => {});
export function usePageTitle(title) {
  const set = useContext(TitleCtx);
  useEffect(() => { set(title || null); return () => set(null); }, [title, set]);
}
