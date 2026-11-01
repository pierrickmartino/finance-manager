import type { IconName } from './icon';

export interface NavLink {
  href: string;
  label: string;
  icon: IconName;
}

export interface NavGroup {
  label: string;
  links: NavLink[];
}

export interface CurrentPage {
  group: NavGroup;
  link: NavLink;
}

/** Every signed-in destination, grouped as the sidebar shows them. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    links: [
      { href: '/dashboards', label: 'Dashboards', icon: 'dashboard' },
      { href: '/reports', label: 'Reports', icon: 'reports' },
    ],
  },
  {
    label: 'Money',
    links: [
      { href: '/transactions', label: 'Transactions', icon: 'transactions' },
      { href: '/unclassified', label: 'Unclassified', icon: 'inbox' },
      { href: '/accounts', label: 'Accounts', icon: 'accounts' },
    ],
  },
  {
    label: 'Organize',
    links: [
      { href: '/categories', label: 'Categories', icon: 'categories' },
      { href: '/payees', label: 'Payees', icon: 'payees' },
      { href: '/tags', label: 'Tags', icon: 'tags' },
      { href: '/rules', label: 'Rules', icon: 'rules' },
      { href: '/banks', label: 'Banks', icon: 'banks' },
    ],
  },
  {
    label: 'System',
    links: [
      { href: '/history', label: 'History', icon: 'history' },
      { href: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
];

/** True when `pathname` is the link's page or a page nested under it. */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The sidebar entry (and its group) that `pathname` belongs to, if any. */
export function findCurrentPage(pathname: string): CurrentPage | null {
  for (const group of NAV_GROUPS) {
    const link = group.links.find((candidate) => isActive(pathname, candidate.href));
    if (link) return { group, link };
  }
  return null;
}
