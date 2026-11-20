import type { ReactElement } from 'react';
import { PageSkeleton } from '@/components/page-skeleton';

/** Shown while Analytics opens, until its shell renders and each section streams in. */
export default function Loading(): ReactElement {
  return <PageSkeleton label="Loading Analytics" />;
}
