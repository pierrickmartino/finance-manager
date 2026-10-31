import { redirect } from 'next/navigation';
import { getServiceContext } from '@/server/app-context';
import { listDashboards, seedStarterDashboard } from '@/server/services/dashboards';

/** The landing page is the first Dashboard (the starter one, unless the user reordered). */
export default async function HomePage() {
  const ctx = await getServiceContext();
  await seedStarterDashboard(ctx);
  const [first] = await listDashboards(ctx);
  redirect(first ? `/dashboards/${first.id}` : '/dashboards');
}
