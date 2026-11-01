import Link from 'next/link';
import { INPUT_CLASS } from '@/components/named-list';
import { CARD_CLASS, GHOST_BUTTON_CLASS } from '@/components/surface';
import type { RuleOrder } from './use-rule-order';
import { ruleHref } from './view';

export interface RuleListItem {
  id: string;
  name: string;
  enabled: boolean;
  matchCount: number;
  /** 1-based place in the run order. */
  position: number;
}

interface RuleListProps {
  /** The Rules the filter shows, in run order. */
  rules: RuleListItem[];
  total: number;
  selectedId: string | undefined;
  query: string;
  drag: Pick<RuleOrder, 'dragged' | 'isPending' | 'handleProps' | 'dropProps'>;
}

/**
 * The master list: a filter (`?q=`) and the Rules in run order with their status and match
 * counts. Drag a Rule by its handle to move it.
 */
export function RuleList({ rules, total, selectedId, query, drag }: RuleListProps) {
  return (
    <nav aria-label="Rules list" className={`${CARD_CLASS} flex flex-col gap-3 p-3`}>
      {/* A GET form: the filter lives in the URL (?q=), like the selected Rule (?rule=). */}
      <form role="search" action="/rules" className="flex items-center gap-1">
        {selectedId && <input type="hidden" name="rule" value={selectedId} />}
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Filter Rules, conditions, Categories…"
          aria-label="Filter Rules"
          className={`${INPUT_CLASS} min-w-0 flex-1`}
        />
        {query && (
          <Link
            href={selectedId ? ruleHref(selectedId, '') : '/rules'}
            className={GHOST_BUTTON_CLASS}
          >
            Clear
          </Link>
        )}
      </form>

      <ol
        aria-label="Rules"
        aria-busy={drag.isPending}
        className="flex max-h-[65vh] flex-col gap-0.5 overflow-y-auto"
      >
        {rules.map((rule) => (
          <li
            key={rule.id}
            data-rule-id={rule.id}
            {...drag.dropProps(rule.id)}
            className={`flex items-center gap-1 ${drag.dragged === rule.id ? 'opacity-50' : ''}`}
          >
            <span
              {...drag.handleProps(rule.id)}
              aria-label={`Drag ${rule.name}`}
              role="img"
              title="Drag to change the run order"
              className="cursor-grab select-none px-1 text-zinc-400"
            >
              ⠿
            </span>
            <RuleLink rule={rule} isActive={rule.id === selectedId} query={query} />
          </li>
        ))}
      </ol>
      {rules.length === 0 && (
        <p className="px-2 text-sm text-zinc-400">
          {total === 0 ? 'No Rules yet.' : `No Rule matches "${query}".`}
        </p>
      )}
    </nav>
  );
}

function RuleLink({
  rule,
  isActive,
  query,
}: {
  rule: RuleListItem;
  isActive: boolean;
  query: string;
}) {
  return (
    <Link
      href={ruleHref(rule.id, query)}
      scroll={false}
      aria-current={isActive ? 'page' : undefined}
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
        isActive
          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      <span className={`w-5 text-right text-xs tabular-nums ${isActive ? '' : 'text-zinc-500'}`}>
        {rule.position}
      </span>
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${rule.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
      />
      <span className={`min-w-0 flex-1 break-words ${rule.enabled ? 'font-medium' : ''}`}>
        {rule.name}
        {!rule.enabled && <span className="ml-1 text-xs">(Disabled)</span>}
      </span>
      <span className={`text-xs tabular-nums ${isActive ? '' : 'text-zinc-500'}`}>
        <span className="sr-only">Matches: </span>
        {rule.matchCount}
      </span>
    </Link>
  );
}
