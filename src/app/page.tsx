import { redirect } from 'next/navigation';
import { getServiceContext } from '@/server/app-context';
import { homeDashboard, listDashboards, seedStarterDashboard } from '@/server/services/dashboards';

/** The landing page is the home Dashboard (the starter one, unless the user reordered). */
export default async function HomePage() {
  const ctx = await getServiceContext();
  await seedStarterDashboard(ctx);
  const home = homeDashboard(await listDashboards(ctx));
  redirect(home ? `/dashboards/${home.id}` : '/dashboards');
}
