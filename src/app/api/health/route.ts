import { getPublicServiceContext } from '@/server/app-context';
import { checkHealth } from '@/server/services/health';

/**
 * Liveness and database check, used by Railway's healthcheck and the E2E web server probe.
 * Public: it needs no session and reveals nothing.
 */
export async function GET(): Promise<Response> {
  try {
    await checkHealth(await getPublicServiceContext());
    return Response.json({ status: 'ok' });
  } catch (error: unknown) {
    console.error('Health check failed', error);
    return Response.json({ status: 'error' }, { status: 503 });
  }
}
