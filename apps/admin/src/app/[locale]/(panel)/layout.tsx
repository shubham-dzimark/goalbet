import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin-shell';

export default function PanelLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
