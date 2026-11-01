/*
 * PROTOTYPE — throwaway. Rename, merge and delete one Tag behind a menu, shared by the variants
 * (the existing server actions; the prototype adds no mutations).
 */

import { ActionForm } from '@/components/action-form';
import { Menu } from '@/components/menu';
import { INPUT_CLASS } from '@/components/named-list';
import {
  DANGER_BUTTON_CLASS,
  GHOST_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
} from '@/components/surface';
import type { Tag } from '@/server/services/tags';
import { createTagAction, deleteTagAction, mergeTagAction, renameTagAction } from './actions';

interface TagMenuProps {
  tag: Tag;
  tags: Tag[];
  trigger?: string;
}

export function TagMenu({ tag, tags, trigger = 'Edit Tag' }: TagMenuProps) {
  const { id, name, transactionCount } = tag;
  const others = tags.filter((other) => other.id !== id);
  return (
    <Menu trigger={trigger} label={`Edit ${name}`} triggerClassName={GHOST_BUTTON_CLASS}>
      <ActionForm action={renameTagAction.bind(null, id)} label={`Rename ${name}`}>
        <input
          name="name"
          aria-label={`Name of ${name}`}
          defaultValue={name}
          required
          maxLength={100}
          className={`${INPUT_CLASS} min-w-0 flex-1`}
        />
        <button type="submit" className={GHOST_BUTTON_CLASS}>
          Rename
        </button>
      </ActionForm>
      {others.length > 0 && (
        <ActionForm
          action={mergeTagAction.bind(null, id)}
          label={`Merge ${name}`}
          confirmMessage={`Give every Transaction of "${name}" the chosen Tag instead, and delete "${name}"?`}
        >
          <select
            name="targetId"
            aria-label={`Merge ${name} into`}
            required
            className={`${INPUT_CLASS} min-w-0 flex-1`}
          >
            <option value="">Merge into…</option>
            {others.map((other) => (
              <option key={other.id} value={other.id}>
                {other.name}
              </option>
            ))}
          </select>
          <button type="submit" className={GHOST_BUTTON_CLASS}>
            Merge
          </button>
        </ActionForm>
      )}
      <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <ActionForm
          action={deleteTagAction.bind(null, id)}
          label={`Delete ${name}`}
          confirmMessage={`Delete "${name}"? It is removed from ${transactionCount} Transaction${transactionCount === 1 ? '' : 's'}.`}
        >
          <button type="submit" className={DANGER_BUTTON_CLASS}>
            Delete Tag
          </button>
        </ActionForm>
      </div>
    </Menu>
  );
}

/** The "+ New Tag" form, inline. */
export function NewTagForm({ className }: { className?: string }) {
  return (
    <ActionForm action={createTagAction} label="New Tag" className={className}>
      <input
        name="name"
        aria-label="Tag name"
        placeholder="New Tag…"
        required
        maxLength={100}
        className={`${INPUT_CLASS} min-w-0 flex-1`}
      />
      <button type="submit" className={PRIMARY_BUTTON_CLASS}>
        Add
      </button>
    </ActionForm>
  );
}
