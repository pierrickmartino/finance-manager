'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { INPUT_CLASS } from '@/components/named-list';
import { SMALL_BUTTON_CLASS } from '@/components/surface';
import type { CategoryGroup } from '@/server/services/categories';
import { MAX_PAYEE_NAME_LENGTH } from '@/server/services/payees/model';
import type { BulkChanges } from '@/server/services/transactions/bulk-edit';
import {
  filterCategoryGroups,
  matchesQuery,
  nameChoices,
  tagOptions,
  type TagOption,
} from './dock-options';

/** One edit, ready to send: the change, and what the result message calls it. */
export interface DockEdit {
  changes: BulkChanges;
  /** The action in words, e.g. "Set Groceries". */
  label: string;
}

const OPTION_CLASS =
  'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sunken focus-visible:bg-sunken';
const LIST_CLASS = 'flex max-h-72 flex-col overflow-y-auto';
const EMPTY_CLASS = 'px-2 py-1.5 text-sm text-muted';

interface SearchFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** Enter: applies the first option. */
  onEnter: () => void;
  maxLength?: number;
}

function SearchField({
  label,
  placeholder,
  value,
  onChange,
  onEnter,
  maxLength,
}: SearchFieldProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    onEnter();
  };
  return (
    <input
      // The picker opens on purpose (a click or its key), so the search box takes the focus.
      autoFocus
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      maxLength={maxLength}
      autoComplete="off"
      className={`${INPUT_CLASS} w-full`}
    />
  );
}

function NewOption({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={OPTION_CLASS}>
      <span className="truncate">{children}</span>
      <span className="text-xs text-muted">New</span>
    </button>
  );
}

interface PickerProps {
  onApply: (edit: DockEdit) => void;
}

/** Set Category: type to narrow the Categories, click one (or Enter for the first) to set it. */
export function CategoryPicker({ groups, onApply }: PickerProps & { groups: CategoryGroup[] }) {
  const [query, setQuery] = useState('');
  const filtered = filterCategoryGroups(groups, query);
  const set = ({ id, name }: { id: string; name: string }): void =>
    onApply({ changes: { categoryId: id }, label: `Set ${name}` });
  const first = filtered[0]?.categories[0];
  return (
    <>
      <SearchField
        label="Find a Category"
        placeholder="Find a Category"
        value={query}
        onChange={setQuery}
        onEnter={() => first && set(first)}
      />
      <div className={LIST_CLASS}>
        {filtered.length === 0 && <p className={EMPTY_CLASS}>No Category matches.</p>}
        {filtered.map((group) => (
          <div key={group.id} role="group" aria-label={group.name} className="mt-1">
            <p aria-hidden className="px-2 pt-1 text-xs text-muted">
              {group.name}
            </p>
            {group.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => set(category)}
                className={OPTION_CLASS}
              >
                <span className="truncate">{category.name}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Set Payee: an existing Payee, or the typed name as a new one. Enter takes the first match,
 * so it only creates a Payee when no existing name holds what was typed.
 */
export function PayeePicker({ payeeNames, onApply }: PickerProps & { payeeNames: string[] }) {
  const [query, setQuery] = useState('');
  const { matches, newName } = nameChoices(payeeNames, query);
  const set = (payeeName: string): void =>
    onApply({ changes: { payeeName }, label: `Set ${payeeName}` });
  const first = matches[0] ?? newName;
  return (
    <>
      <SearchField
        label="Find or create a Payee"
        placeholder="Find or type a new Payee"
        value={query}
        onChange={setQuery}
        onEnter={() => first && set(first)}
        maxLength={MAX_PAYEE_NAME_LENGTH}
      />
      <div className={LIST_CLASS}>
        {matches.map((name) => (
          <button key={name} type="button" onClick={() => set(name)} className={OPTION_CLASS}>
            <span className="truncate">{name}</span>
          </button>
        ))}
        {newName && <NewOption onClick={() => set(newName)}>Create “{newName}”</NewOption>}
        {!first && <p className={EMPTY_CLASS}>Type a name for a new Payee.</p>}
      </div>
    </>
  );
}

interface TagPickerProps extends PickerProps {
  tags: { id: string; name: string }[];
  /** Each ticked Transaction's Tags; null when the selection reaches beyond the page. */
  selectedTags: { id: string; name: string }[][] | null;
}

const add = ({ id, name }: TagOption): DockEdit => ({
  changes: { addTagIds: [id] },
  label: `Added ${name}`,
});
const remove = ({ id, name }: TagOption): DockEdit => ({
  changes: { removeTagIds: [id] },
  label: `Removed ${name}`,
});
/** A ticked box removes the Tag from all; an empty or mixed one adds it to all. */
const toggle = (option: TagOption): DockEdit =>
  option.state === 'all' ? remove(option) : add(option);

const ARIA_CHECKED = { all: true, some: 'mixed', none: false } as const;

/**
 * Tags: each Tag as a box that is ticked when every selected Transaction carries it and mixed
 * when some do. Ticking adds it to all, unticking removes it from all; a mixed one can also be
 * removed from the ones that carry it. Beyond the page, who carries what is unknown, so each
 * Tag offers Add and Remove instead. A typed name that is no Tag yet is created and added.
 */
export function TagPicker({ tags, selectedTags, onApply }: TagPickerProps) {
  const [query, setQuery] = useState('');
  const options = tagOptions(
    tags.filter((tag) => matchesQuery(tag.name, query)),
    selectedTags,
  );
  const { newName } = nameChoices(
    tags.map((tag) => tag.name),
    query,
  );
  const addNew = (name: string): void =>
    onApply({ changes: { addTagNames: [name] }, label: `Added ${name}` });
  const onEnter = (): void => {
    const first = options[0];
    if (first && first.state !== 'unknown') onApply(toggle(first));
    else if (first) onApply(add(first));
    else if (newName) addNew(newName);
  };
  return (
    <>
      <SearchField
        label="Find or create a Tag"
        placeholder="Find or type a new Tag"
        value={query}
        onChange={setQuery}
        onEnter={onEnter}
      />
      <div className={LIST_CLASS}>
        {options.map((option) =>
          option.state === 'unknown' ? (
            <UnknownTagRow key={option.id} option={option} onApply={onApply} />
          ) : (
            <TagRow
              key={option.id}
              option={option}
              total={selectedTags?.length ?? 0}
              onApply={onApply}
            />
          ),
        )}
        {newName && <NewOption onClick={() => addNew(newName)}>Add new Tag #{newName}</NewOption>}
        {options.length === 0 && !newName && <p className={EMPTY_CLASS}>No Tags yet.</p>}
      </div>
    </>
  );
}

interface TagRowProps extends PickerProps {
  option: TagOption;
  /** How many Transactions are selected. */
  total: number;
}

function TagRow({ option, total, onApply }: TagRowProps) {
  const state = option.state as keyof typeof ARIA_CHECKED;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={ARIA_CHECKED[state]}
        onClick={() => onApply(toggle(option))}
        className={OPTION_CLASS}
      >
        <span className="flex min-w-0 items-center gap-2">
          <CheckMark state={state} />
          <span className="truncate">#{option.name}</span>
        </span>
        {option.carriers > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {option.carriers} of {total}
          </span>
        )}
      </button>
      {state === 'some' && (
        <button
          type="button"
          onClick={() => onApply(remove(option))}
          aria-label={`Remove #${option.name} from the ${option.carriers} that have it`}
          className={SMALL_BUTTON_CLASS}
        >
          Remove
        </button>
      )}
    </div>
  );
}

function UnknownTagRow({ option, onApply }: PickerProps & { option: TagOption }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <span className="flex-1 truncate text-sm">#{option.name}</span>
      <button
        type="button"
        onClick={() => onApply(add(option))}
        aria-label={`Add #${option.name}`}
        className={SMALL_BUTTON_CLASS}
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => onApply(remove(option))}
        aria-label={`Remove #${option.name}`}
        className={SMALL_BUTTON_CLASS}
      >
        Remove
      </button>
    </div>
  );
}

/** The drawn box of a Tag's checkbox: ticked, mixed or empty. Decorative: the row is the checkbox. */
function CheckMark({ state }: { state: keyof typeof ARIA_CHECKED }) {
  const isFilled = state !== 'none';
  return (
    <span
      aria-hidden
      className={`grid size-4 shrink-0 place-items-center rounded border text-[10px] leading-none ${isFilled ? 'border-accent-ink bg-accent-ink text-paper' : 'border-rule-strong'}`}
    >
      {state === 'all' ? '✓' : state === 'some' ? '–' : ''}
    </span>
  );
}
