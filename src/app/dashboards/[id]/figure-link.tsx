import Link from 'next/link';
import type { ReactNode } from 'react';

interface FigureLinkProps {
  /** The figure's Drill-down; without one the figure is plain text. */
  href: string | null;
  className?: string;
  children: ReactNode;
}

/** A reported figure that opens its Drill-down (GLOSSARY), underlined on hover like the others. */
export function FigureLink({ href, className = '', children }: FigureLinkProps) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <Link href={href} className={`${className} hover:underline`}>
      {children}
    </Link>
  );
}
