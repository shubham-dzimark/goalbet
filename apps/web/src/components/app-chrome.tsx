'use client';

import type { ReactNode } from 'react';
import { BottomNav } from './bottom-nav';
import { Header } from './header';

/** Persistent chrome around every page: header, content, mobile bottom nav. */
export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <div id="main" className="mx-auto w-full max-w-[1440px]">
        {children}
      </div>
      <BottomNav />
    </>
  );
}
