import type { NextRequest } from 'next/server';
import { getCurrentSession, getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { ServiceError } from '@/server/services/errors';
import { exportTransactionsCsv } from '@/server/services/export';
import { swissToday } from '@/server/services/fx/dates';
import { readTransactionSearch } from '@/app/transactions/search';

/**
 * Downloads every Transaction matching the Transaction list's filters (same URL parameters) as
 * CSV. Signed in only. The body streams batch by batch from the service, so a large ledger is
 * never held in memory.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!(await getCurrentSession())) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }
  const ctx = await getServiceContext();
  const fmt = await getFormatter();
  const search = readTransactionSearch(
    Object.fromEntries(request.nextUrl.searchParams),
    fmt.settings.numberFormat,
  );
  if (!search.query) return Response.json({ error: search.error }, { status: 400 });

  const { page: _page, ...filter } = search.query;
  let chunks: AsyncGenerator<string>;
  try {
    chunks = exportTransactionsCsv(ctx, filter);
  } catch (error: unknown) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  return new Response(toByteStream(chunks), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transactions-${swissToday()}.csv"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Pulls one chunk at a time, only when the client is ready for more. */
function toByteStream(chunks: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await chunks.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      } catch (error: unknown) {
        console.error('CSV export failed', error);
        controller.error(error);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}
