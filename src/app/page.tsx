import { redirect } from 'next/navigation';

/**
 * The landing page is Analytics, in its default Period view (Month; ADR-0015). It no longer seeds
 * the starter Dashboard: setup and the Dashboards page still do.
 */
export default function HomePage() {
  redirect('/analytics');
}
