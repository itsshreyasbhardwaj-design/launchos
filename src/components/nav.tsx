'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Grouped navigation.
 *
 * Modules are grouped rather than listed flat, and a group only appears when
 * the active preset actually uses it — a local bakery has no reason to see an
 * app-store module.
 */
const GROUPS: { group: string; items: { href: string; label: string; module?: string }[] }[] = [
  {
    group: 'Overview',
    items: [
      { href: '/', label: 'Command Center' },
      { href: '/opportunities', label: 'Opportunities' },
      { href: '/readiness', label: 'Launch readiness' },
      { href: '/projects', label: 'Projects' },
    ],
  },
  {
    group: 'Discovery',
    items: [
      { href: '/audit', label: 'Site audit', module: 'audit' },
      { href: '/seo', label: 'SEO Studio', module: 'seo' },
      { href: '/geo', label: 'GEO / AEO Studio', module: 'geo' },
      { href: '/keywords', label: 'Keywords', module: 'seo' },
      { href: '/search-engines', label: 'Search engines', module: 'seo' },
    ],
  },
  {
    group: 'Distribution',
    items: [
      { href: '/listings', label: 'Directories & listings', module: 'listings' },
      { href: '/launch', label: 'Launch Center', module: 'launch' },
      { href: '/campaigns', label: 'Campaigns', module: 'campaigns' },
      { href: '/communities', label: 'Communities', module: 'communities' },
      { href: '/outreach', label: 'Outreach', module: 'outreach' },
      { href: '/backlinks', label: 'Backlinks', module: 'outreach' },
    ],
  },
  {
    group: 'Marketing',
    items: [
      { href: '/content', label: 'Content Studio', module: 'content' },
      { href: '/social', label: 'Social Studio', module: 'social' },
      { href: '/aso', label: 'App store', module: 'aso' },
      { href: '/local', label: 'Local SEO', module: 'local_seo' },
    ],
  },
  {
    group: 'Intelligence',
    items: [
      { href: '/analytics', label: 'Analytics', module: 'analytics' },
      { href: '/cro', label: 'Conversion', module: 'cro' },
      { href: '/experiments', label: 'Experiments', module: 'experiments' },
      { href: '/reports', label: 'Reports' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { href: '/tools', label: 'Free tool registry' },
      { href: '/settings', label: 'Settings & privacy' },
    ],
  },
];

export function Nav({ modules, onNavigate }: { modules: string[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-5 text-sm">
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => !i.module || modules.includes(i.module));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <p className="mb-1.5 px-2 text-[0.625rem] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--text-dim)' }}>
              {g.group}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map((i) => {
                const active = pathname === i.href || (i.href !== '/' && pathname.startsWith(i.href));
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className="block rounded-md px-2 py-1.5 text-[0.8125rem] transition-colors"
                      style={active
                        ? { background: 'color-mix(in oklab, var(--accent) 16%, transparent)', color: 'var(--accent)', fontWeight: 600 }
                        : { color: 'var(--text-dim)' }}
                    >
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
