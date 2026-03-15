'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/post-job', label: 'Post Job' },
  { href: '/deals', label: 'Deals' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar-minimal">
        <div className="brand-block">
          <p className="eyebrow">DealForge</p>
          <h1>Command center</h1>
        </div>

        <nav className="nav-minimal">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href ? 'nav-link active' : 'nav-link'}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-note">
          <p className="eyebrow">Agent</p>
          <strong>task.agent.eth</strong>
          <span>Base relay online</span>
        </div>
      </aside>

      <div className="content-shell">{children}</div>
    </div>
  );
}
