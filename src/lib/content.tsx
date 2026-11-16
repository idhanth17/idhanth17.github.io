import { createContext, useContext } from 'react';
import type { SiteContent } from './types';

export const ContentContext = createContext<SiteContent | null>(null);

export function useContent(): SiteContent {
  const c = useContext(ContentContext);
  if (!c) throw new Error('useContent used outside ContentContext');
  return c;
}
