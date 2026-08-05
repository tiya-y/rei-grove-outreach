'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/prospects', label: 'Prospects' },
  { href: '/prospects/new', label: 'Add Prospect' },
  { href: '/settings', label: 'Settings' },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-grove-dark">REI Grove</span>
          <span className="text-sm text-gray-400">Outreach</span>
        </div>
        <div className="flex gap-4 text-sm">
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
        </div>
      </div>
    </nav>
  );
}
