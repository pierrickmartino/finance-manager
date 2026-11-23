import { redirect } from 'next/navigation';

/**
 * The landing page is Analytics, over its default Period (Rolling 12 months; ADR-0016). It no
 * longer seeds the starter Dashboard: setup and the Dashboards page still do.
 */
export default function HomePage() {
  redirect('/analytics');
}
