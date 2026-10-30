import { getServiceContext } from '@/server/app-context';
import { checkHealth } from '@/server/services/health';

/** Liveness and database check, used by Railway's healthcheck and the E2E web server probe. */
export async function GET(): Promise<Response> {
  try {
    await checkHealth(await getServiceContext());
    return Response.json({ status: 'ok' });
  } catch (error: unknown) {
    console.error('Health check failed', error);
    return Response.json({ status: 'error' }, { status: 503 });
  }
}
