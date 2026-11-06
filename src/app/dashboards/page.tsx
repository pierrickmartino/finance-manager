import type { Metadata } from 'next';
import { PAGE_TITLE_CLASS, SMALL_BUTTON_CLASS } from '@/components/surface';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { BUTTON_CLASS, INPUT_CLASS } from '@/components/named-list';
import { getServiceContext } from '@/server/app-context';
import { listDashboards, seedStarterDashboard } from '@/server/services/dashboards';
import {
  createDashboardAction,
  deleteDashboardAction,
  duplicateDashboardAction,
  renameDashboardAction,
  shiftDashboardAction,
} from './actions';
import { DashboardTabs } from './tabs';

export const metadata: Metadata = { title: 'Dashboards · Finance Manager' };

const SMALL_BUTTON = SMALL_BUTTON_CLASS;

/** Create, rename, reorder, duplicate and delete Dashboards (spec 104). */
export default async function DashboardsPage() {
  const ctx = await getServiceContext();
  // First run happens at setup; this covers a database set up before Dashboards existed.
  await seedStarterDashboard(ctx);
  const dashboards = await listDashboards(ctx);

  return (
    <section className="flex flex-col gap-6">
      <DashboardTabs dashboards={dashboards} currentId={null} />
      <h1 className={PAGE_TITLE_CLASS}>Dashboards</h1>
      <ActionForm action={createDashboardAction} label="New Dashboard">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Dashboard name
          <input name="name" required maxLength={100} className={INPUT_CLASS} />
        </label>
        <button type="submit" className={BUTTON_CLASS}>
          Create Dashboard
        </button>
      </ActionForm>
      {dashboards.length === 0 ? (
        <p className="text-sm text-muted">No Dashboards yet.</p>
      ) : (
        <ul aria-label="Dashboard list" className="flex flex-col divide-y divide-rule">
          {dashboards.map((dashboard, index) => (
            <li key={dashboard.id} className="flex flex-wrap items-end gap-3 py-3">
              <Link
                href={`/dashboards/${dashboard.id}`}
                className="w-40 truncate pb-1.5 font-medium underline"
              >
                {dashboard.name}
              </Link>
              <ActionForm
                action={renameDashboardAction.bind(null, dashboard.id)}
                label={`Rename ${dashboard.name}`}
              >
                <input
                  name="name"
                  aria-label={`New name for ${dashboard.name}`}
                  defaultValue={dashboard.name}
                  required
                  maxLength={100}
                  className={INPUT_CLASS}
                />
                <button type="submit" className={SMALL_BUTTON}>
                  Rename
                </button>
              </ActionForm>
              <ActionForm
                action={shiftDashboardAction.bind(null, dashboard.id, -1)}
                label={`Move ${dashboard.name} up`}
              >
                <button type="submit" disabled={index === 0} className={SMALL_BUTTON}>
                  Up
                </button>
              </ActionForm>
              <ActionForm
                action={shiftDashboardAction.bind(null, dashboard.id, 1)}
                label={`Move ${dashboard.name} down`}
              >
                <button
                  type="submit"
                  disabled={index === dashboards.length - 1}
                  className={SMALL_BUTTON}
                >
                  Down
                </button>
              </ActionForm>
              <ActionForm
                action={duplicateDashboardAction.bind(null, dashboard.id)}
                label={`Duplicate ${dashboard.name}`}
              >
                <button type="submit" className={SMALL_BUTTON}>
                  Duplicate
                </button>
              </ActionForm>
              <ActionForm
                action={deleteDashboardAction.bind(null, dashboard.id)}
                label={`Delete ${dashboard.name}`}
                confirmMessage={`Delete the Dashboard "${dashboard.name}" and its Widgets?`}
              >
                <button type="submit" className={`${SMALL_BUTTON} text-negative`}>
                  Delete
                </button>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
