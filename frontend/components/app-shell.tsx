'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/post-job', label: 'Post Job' },
  { href: '/deals', label: 'Deals' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('dealforge-theme');
    const nextTheme = savedTheme === 'light' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem('dealforge-theme', nextTheme);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar-minimal">
        <div className="sidebar-top">
          <div className="brand-block">
            <p className="eyebrow">DealForge</p>
            <h1>Workspace</h1>
            <span className="brand-mark-minimal">Agent-powered tasks</span>
          </div>

          <button type="button" className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>

        <nav className="nav-minimal">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href ? 'nav-link active' : 'nav-link'}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-note">
          <p className="eyebrow">Your Agent</p>
          <strong>task.agent.eth</strong>
          <span>Connected and ready</span>
        </div>
      </aside>

      <div className="content-shell">{children}</div>
    </div>
  );
}
