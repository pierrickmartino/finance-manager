import Link from 'next/link';
import { historyHref } from '@/app/history/history-table';
import { ActionForm } from '@/components/action-form';
import {
  CARD_CLASS,
  DANGER_BUTTON_CLASS,
  GHOST_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
} from '@/components/surface';
import type { ActionResult } from '@/server/actions';
import type { RuleActionPart, RuleSummary } from './view';

export type BoundAction = (
  previous: ActionResult<unknown> | null,
) => Promise<ActionResult<unknown>>;

export interface RuleDetailRule extends RuleSummary {
  enabled: boolean;
  matchCount: number;
  toggle: BoundAction;
  remove: BoundAction;
}

interface RuleDetailProps {
  rule: RuleDetailRule;
  /** 0-based place in the run order. */
  position: number;
  total: number;
  isPending: boolean;
  moveBy: (id: string, delta: -1 | 1) => void;
}

const CHIP = 'inline-flex rounded-md px-2 py-0.5 text-xs font-medium break-words';
const ACTION_TONES: Record<RuleActionPart['kind'], string> = {
  payee: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  category: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  tag: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
};

/** The selected Rule spelled out: when it matches, what it sets, and everything to do with it. */
export function RuleDetail({ rule, position, total, isPending, moveBy }: RuleDetailProps) {
  return (
    <article aria-label={rule.name} className={`${CARD_CLASS} flex flex-col gap-5 p-5`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Rule {position + 1} of {total}
          </p>
          <h2 className="break-words text-xl font-semibold">{rule.name}</h2>
        </div>
        <EnabledSwitch rule={rule} />
      </header>

      <dl className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="Matches now" value={rule.matchCount} />
        <Stat label="Conditions" value={rule.conditions.length} />
        <Stat label="Sets" value={rule.actions.length} />
      </dl>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">When a Transaction matches all of</h3>
        <ul aria-label="Conditions" className="flex flex-col items-start gap-1.5">
          {rule.conditions.map((condition, i) => (
            <li
              key={i}
              className={`${CHIP} bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200`}
            >
              {condition}
            </li>
          ))}
        </ul>
        <h3 className="text-sm font-semibold">Then set</h3>
        {rule.actions.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing</p>
        ) : (
          <ul aria-label="Sets" className="flex flex-wrap gap-1">
            {rule.actions.map((part, i) => (
              <li key={i} className={`${CHIP} ${ACTION_TONES[part.kind]}`}>
                {part.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <Link href={`/rules/${rule.id}`} className={PRIMARY_BUTTON_CLASS}>
          Edit Rule
        </Link>
        <Link
          href={`/rules/apply?ruleId=${rule.id}`}
          aria-label={`Apply ${rule.name} to existing Transactions`}
          className={GHOST_BUTTON_CLASS}
        >
          Apply to existing…
        </Link>
        <button
          type="button"
          className={GHOST_BUTTON_CLASS}
          aria-label={`Move ${rule.name} up`}
          disabled={position === 0 || isPending}
          onClick={() => moveBy(rule.id, -1)}
        >
          Run earlier ↑
        </button>
        <button
          type="button"
          className={GHOST_BUTTON_CLASS}
          aria-label={`Move ${rule.name} down`}
          disabled={position === total - 1 || isPending}
          onClick={() => moveBy(rule.id, 1)}
        >
          Run later ↓
        </button>
        <span className="flex-1" />
        <ActionForm
          action={rule.remove}
          label={`Delete ${rule.name}`}
          confirmMessage={`Delete the Rule "${rule.name}"? Transactions it classified keep their classification.`}
        >
          <button type="submit" className={DANGER_BUTTON_CLASS}>
            Delete
          </button>
        </ActionForm>
      </div>

      <p className="text-xs text-zinc-500">
        Editing changes future imports and Manual transactions only; use Apply to reclassify past
        ones.{' '}
        <Link href={historyHref({ entityType: 'rule', entityId: rule.id })} className="underline">
          Rule History
        </Link>
        {' · '}
        <Link href={historyHref({ actorType: 'rule', actorId: rule.id })} className="underline">
          Changes made by this Rule
        </Link>
      </p>
    </article>
  );
}

function EnabledSwitch({ rule }: { rule: RuleDetailRule }) {
  return (
    <ActionForm action={rule.toggle} label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`}>
      <button
        type="submit"
        role="switch"
        aria-checked={rule.enabled}
        className="flex items-center gap-2 text-sm"
      >
        {rule.enabled ? 'Enabled' : 'Disabled'}
        <span
          aria-hidden
          className={`relative h-5 w-9 rounded-full transition-colors ${rule.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${rule.enabled ? 'left-4' : 'left-0.5'}`}
          />
        </span>
      </button>
    </ActionForm>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
