import { PageSkeleton } from '@/components/page-skeleton';

/**
 * Shown while a Dashboard opens. It sits above `[id]` (in this route group, not in `[id]`) so
 * it wraps the Dashboard as a whole: opening another Dashboard shows it, but moving between
 * the Story and Edit mode of the same one keeps the page on screen until the other is ready,
 * so the board crossfades between the two instead of passing through a skeleton (ADR-0012).
 */
export default function Loading() {
  return <PageSkeleton label="Loading the Dashboard" />;
}
