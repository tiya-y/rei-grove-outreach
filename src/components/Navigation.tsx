'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from './Logo';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/search', label: 'Prospect Search' },
  { href: '/outreach', label: 'Outreach' },
  { href: '/history', label: 'History' },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2" aria-label="REI Grove home">
          <Logo />
          <span className="text-sm text-gray-400">Outreach</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={active ? 'font-semibold text-grove-dark' : 'text-gray-500 hover:text-grove-dark'}
              >
                {link.label}
              </Link>
            );
          })}
          <Link href="/settings" className="ml-2 text-xs text-gray-400 hover:text-grove-dark">
            Settings
          </Link>
        </div>
      </div>
    </nav>
  );
}
