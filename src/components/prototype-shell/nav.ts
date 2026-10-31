/*
 * PROTOTYPE — app-shell redesign. Throwaway: see ./README.md.
 * Navigation data shared by the shell variants (data only; each variant owns its layout).
 */

export type IconName =
  | 'dashboard'
  | 'reports'
  | 'transactions'
  | 'inbox'
  | 'accounts'
  | 'categories'
  | 'payees'
  | 'tags'
  | 'rules'
  | 'banks'
  | 'history'
  | 'settings';

export interface NavLink {
  href: string;
  label: string;
  icon: IconName;
  hint: string;
}

export interface NavGroup {
  label: string;
  icon: IconName;
  links: NavLink[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    icon: 'dashboard',
    links: [
      {
        href: '/dashboards',
        label: 'Dashboards',
        icon: 'dashboard',
        hint: 'Your widgets at a glance',
      },
      {
        href: '/reports',
        label: 'Reports',
        icon: 'reports',
        hint: 'Pivot and drill into spending',
      },
    ],
  },
  {
    label: 'Money',
    icon: 'transactions',
    links: [
      {
        href: '/transactions',
        label: 'Transactions',
        icon: 'transactions',
        hint: 'Every movement',
      },
      { href: '/unclassified', label: 'Unclassified', icon: 'inbox', hint: 'Needs a category' },
      { href: '/accounts', label: 'Accounts', icon: 'accounts', hint: 'Balances and imports' },
    ],
  },
  {
    label: 'Organize',
    icon: 'categories',
    links: [
      {
        href: '/categories',
        label: 'Categories',
        icon: 'categories',
        hint: 'Income and expense tree',
      },
      { href: '/payees', label: 'Payees', icon: 'payees', hint: 'Who you pay' },
      { href: '/tags', label: 'Tags', icon: 'tags', hint: 'Cross-cutting labels' },
      { href: '/rules', label: 'Rules', icon: 'rules', hint: 'Auto-classification' },
      { href: '/banks', label: 'Banks', icon: 'banks', hint: 'Institutions' },
    ],
  },
  {
    label: 'System',
    icon: 'settings',
    links: [
      { href: '/history', label: 'History', icon: 'history', hint: 'What changed and when' },
      { href: '/settings', label: 'Settings', icon: 'settings', hint: 'Display and formats' },
    ],
  },
];

export const ALL_LINKS: NavLink[] = NAV_GROUPS.flatMap((group) => group.links);

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function activeGroup(pathname: string): NavGroup {
  return (
    NAV_GROUPS.find((group) => group.links.some((link) => isActive(pathname, link.href))) ??
    NAV_GROUPS[0]!
  );
}

export function activeLink(pathname: string): NavLink | undefined {
  return ALL_LINKS.find((link) => isActive(pathname, link.href));
}
