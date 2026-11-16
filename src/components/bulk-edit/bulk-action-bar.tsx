'use client';

import { useId, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { FieldError } from '@/components/form';
import { INPUT_CLASS } from '@/components/named-list';
import {
  CARD_CLASS,
  GHOST_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
  SMALL_BUTTON_CLASS,
} from '@/components/surface';
import type { CategoryGroup } from '@/server/services/categories';
import type { BulkChanges, BulkEditResult } from '@/server/services/transactions/bulk-edit';
import { bulkEditAction, type BulkScope } from './actions';

/** A Tag as the bar lists it. */
export interface BulkTag {
  id: string;
  name: string;
}

export interface BulkActionBarProps {
  /** The Transactions an action applies to. */
  scope: BulkScope;
  /** How many Transactions the scope holds ("n selected"); the bar hides at 0. */
  count: number;
  /** For Set Category. */
  groups: CategoryGroup[];
  /** Existing Payees offered by Set Payee (a new name is accepted too). */
  payeeNames: string[];
  /** Existing Tags offered by Add Tag (a new name is accepted too). */
  tags: BulkTag[];
  /** The Tags Remove Tag offers: those on the selected Transactions. */
  removableTags: BulkTag[];
  /** Empties the selection: on Clear selection, and after an edit succeeds. */
  onClear: () => void;
}

type ActionKind = 'category' | 'payee' | 'addTag' | 'removeTag';

const ACTIONS: { kind: ActionKind; label: string }[] = [
  { kind: 'category', label: 'Set Category' },
  { kind: 'payee', label: 'Set Payee' },
  { kind: 'addTag', label: 'Add Tag' },
  { kind: 'removeTag', label: 'Remove Tag' },
];

/** One action, ready to send: the change and how the result message names it. */
interface Edit {
  changes: BulkChanges;
  message: (result: BulkEditResult) => string;
}

const transactions = (count: number): string => `${count} Transaction${count === 1 ? '' : 's'}`;

/** "· 2 split or Transfer left out", or nothing. */
const leftOutNote = (leftOut: number): string =>
  leftOut > 0 ? ` · ${leftOut} split or Transfer left out` : '';

/**
 * The Bulk edit action bar: while Transactions are selected, "n selected", Set Category,
 * Set Payee, Add Tag, Remove Tag and Clear selection. Each action applies at once as one Bulk
 * edit, reports what it changed (and what it left out), then clears the selection. Above the
 * list from `lg` up; below, it sticks to the bottom of the screen. Its parent is a flex column.
 */
export function BulkActionBar({
  scope,
  count,
  groups,
  payeeNames,
  tags,
  removableTags,
  onClear,
}: BulkActionBarProps) {
  const panelId = useId();
  const [open, setOpen] = useState<ActionKind | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const apply = (edit: Edit): void => {
    setError('');
    startTransition(async () => {
      const result = await bulkEditAction(scope, edit.changes);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(`${edit.message(result.data)}.`);
      setOpen(null);
      onClear();
    });
  };

  const clear = (): void => {
    setOpen(null);
    setMessage('');
    setError('');
    onClear();
  };

  const isShown = count > 0 || message !== '' || error !== '';

  return (
    <section
      aria-label="Bulk edit"
      className={`${CARD_CLASS} sticky bottom-0 z-10 order-last flex-col gap-3 p-3 lg:static lg:order-first ${isShown ? 'flex' : 'hidden'}`}
    >
      {count > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm font-medium tabular-nums">{count} selected</span>
          {ACTIONS.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              aria-expanded={open === kind}
              aria-controls={open === kind ? panelId : undefined}
              onClick={() => setOpen(open === kind ? null : kind)}
              className={`${SMALL_BUTTON_CLASS} ${open === kind ? 'bg-accent-tint' : ''}`}
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={clear} className={`${GHOST_BUTTON_CLASS} ml-auto`}>
            Clear selection
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end">
          <button type="button" onClick={clear} className={GHOST_BUTTON_CLASS}>
            Dismiss
          </button>
        </div>
      )}
      {count > 0 && open && (
        <div id={panelId}>
          <ActionPanel
            kind={open}
            groups={groups}
            payeeNames={payeeNames}
            tags={tags}
            removableTags={removableTags}
            isPending={isPending}
            onApply={apply}
          />
        </div>
      )}
      <p role="status" className="text-sm text-muted empty:hidden">
        {message}
      </p>
      {error && <FieldError message={error} />}
    </section>
  );
}

interface ActionPanelProps extends Pick<
  BulkActionBarProps,
  'groups' | 'payeeNames' | 'tags' | 'removableTags'
> {
  kind: ActionKind;
  isPending: boolean;
  onApply: (edit: Edit) => void;
}

/** The open action's picker and its Apply button; each opens blank. */
function ActionPanel({ kind, ...props }: ActionPanelProps) {
  switch (kind) {
    case 'category':
      return <CategoryPanel {...props} />;
    case 'payee':
      return <PayeePanel {...props} />;
    case 'addTag':
      return <AddTagPanel {...props} />;
    case 'removeTag':
      return <RemoveTagPanel {...props} />;
  }
}

type PanelProps = Omit<ActionPanelProps, 'kind'>;

interface PanelFormProps {
  isPending: boolean;
  /** The Edit to apply, or null while nothing is picked. */
  edit: Edit | null;
  onApply: (edit: Edit) => void;
  children: ReactNode;
}

function PanelForm({ isPending, edit, onApply, children }: PanelFormProps) {
  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (edit) onApply(edit);
  };
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      {children}
      <button type="submit" disabled={isPending || !edit} className={PRIMARY_BUTTON_CLASS}>
        Apply
      </button>
    </form>
  );
}

const LABEL_CLASS = 'flex flex-col gap-1 text-sm font-medium';

function CategoryPanel({ groups, isPending, onApply }: PanelProps) {
  const [categoryId, setCategoryId] = useState('');
  const category = groups.flatMap((group) => group.categories).find((c) => c.id === categoryId);
  const edit: Edit | null = category
    ? {
        changes: { categoryId: category.id },
        message: ({ count, leftOut }) =>
          `Set ${category.name} on ${transactions(count)}${leftOutNote(leftOut)}`,
      }
    : null;
  return (
    <PanelForm isPending={isPending} edit={edit} onApply={onApply}>
      <label className={LABEL_CLASS}>
        Category
        <select
          autoFocus
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">Choose a Category</option>
          {groups.map((group) => (
            <optgroup key={group.id} label={group.name}>
              {group.categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </PanelForm>
  );
}

function PayeePanel({ payeeNames, isPending, onApply }: PanelProps) {
  const listId = useId();
  const [name, setName] = useState('');
  const payeeName = name.trim();
  const edit: Edit | null = payeeName
    ? {
        changes: { payeeName },
        message: ({ count }) => `Set ${payeeName} on ${transactions(count)}`,
      }
    : null;
  return (
    <PanelForm isPending={isPending} edit={edit} onApply={onApply}>
      <label className={LABEL_CLASS}>
        Payee
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          list={listId}
          maxLength={100}
          autoComplete="off"
          placeholder="Pick or type a new name"
          className={INPUT_CLASS}
        />
        <datalist id={listId}>
          {payeeNames.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </label>
    </PanelForm>
  );
}

function AddTagPanel({ tags, isPending, onApply }: PanelProps) {
  const listId = useId();
  const [name, setName] = useState('');
  const tagName = name.trim();
  const edit: Edit | null = tagName
    ? {
        changes: { addTagNames: [tagName] },
        message: ({ count }) => `Added ${tagName} to ${transactions(count)}`,
      }
    : null;
  return (
    <PanelForm isPending={isPending} edit={edit} onApply={onApply}>
      <label className={LABEL_CLASS}>
        Tag
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          list={listId}
          autoComplete="off"
          placeholder="Pick or type a new Tag"
          className={INPUT_CLASS}
        />
        <datalist id={listId}>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.name} />
          ))}
        </datalist>
      </label>
    </PanelForm>
  );
}

function RemoveTagPanel({ removableTags, isPending, onApply }: PanelProps) {
  const [tagId, setTagId] = useState(removableTags[0]?.id ?? '');
  if (removableTags.length === 0) {
    return <p className="text-sm text-muted">The selected Transactions have no Tags.</p>;
  }
  // The selection can change while the panel is open: then the first Tag is the one shown.
  const tag = removableTags.find((option) => option.id === tagId) ?? removableTags[0];
  const edit: Edit | null = tag
    ? {
        changes: { removeTagIds: [tag.id] },
        message: ({ count }) => `Removed ${tag.name} from ${transactions(count)}`,
      }
    : null;
  return (
    <PanelForm isPending={isPending} edit={edit} onApply={onApply}>
      <label className={LABEL_CLASS}>
        Tag
        <select
          autoFocus
          value={tag?.id}
          onChange={(event) => setTagId(event.target.value)}
          className={INPUT_CLASS}
        >
          {removableTags.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
    </PanelForm>
  );
}
