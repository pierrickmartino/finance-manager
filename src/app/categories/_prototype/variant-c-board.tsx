'use client';
/* PROTOTYPE — Variant C: a board with one column per type; Category chips open a side sheet. */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { INPUT_CLASS } from '@/components/named-list';
import type { Category, CategoryGroup, CategoryGroupType } from '@/server/services/categories';
import { CARD, GHOST_BUTTON, groupTotal, PRIMARY_BUTTON, TYPE_ORDER, TYPE_TONE } from './shared';
import { prototypeStubAction as stub } from './stub-action';

export const VARIANT_C_NAME = 'Board by type';

const COLUMN_COPY: Record<CategoryGroupType, { title: string; hint: string }> = {
  income: { title: 'Income', hint: 'Money coming in' },
  expense: { title: 'Expense', hint: 'Money going out' },
  capital: { title: 'Capital', hint: 'Transfers, savings, investments' },
};

export function VariantC({ groups }: { groups: CategoryGroup[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const categories = groups.flatMap((group) => group.categories);
  const open = categories.find((category) => category.id === openId) ?? null;

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-sm text-zinc-500">Click a Category to edit, move or merge it.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {TYPE_ORDER.map((type) => {
          const ofType = groups.filter((group) => group.type === type);
          return (
            <div
              key={type}
              className="flex flex-col gap-3 rounded-2xl bg-zinc-100/70 p-3 dark:bg-zinc-900/50"
            >
              <div className="flex items-baseline justify-between px-1">
                <h2 className="flex items-center gap-2 font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-full ${TYPE_TONE[type].dot}`} />
                  {COLUMN_COPY[type].title}
                </h2>
                <span className="text-xs text-zinc-400">{COLUMN_COPY[type].hint}</span>
              </div>
              {ofType.map((group) => (
                <article key={group.id} className={`${CARD} flex flex-col gap-3 p-3`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{group.name}</h3>
                    <span className="text-xs text-zinc-400 tabular-nums">
                      {groupTotal(group)} tx
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.categories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => setOpenId(category.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset hover:brightness-95 ${TYPE_TONE[type].chip}`}
                      >
                        {category.name}
                        <span className="opacity-60 tabular-nums">{category.transactionCount}</span>
                      </button>
                    ))}
                    <ActionForm action={stub} label={`New Category in ${group.name}`}>
                      <input
                        name="name"
                        placeholder="+ Add"
                        required
                        className="w-20 rounded-full border border-dashed border-zinc-300 bg-transparent px-2.5 py-1 text-xs focus:w-36 dark:border-zinc-700"
                      />
                    </ActionForm>
                  </div>
                </article>
              ))}
              <ActionForm action={stub} label={`New ${COLUMN_COPY[type].title} group`}>
                <input type="hidden" name="type" value={type} />
                <input
                  name="name"
                  placeholder={`+ New ${COLUMN_COPY[type].title.toLowerCase()} group`}
                  required
                  className="w-full rounded-xl border border-dashed border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                />
              </ActionForm>
            </div>
          );
        })}
      </div>

      {open && (
        <CategorySheet
          category={open}
          groups={groups}
          categories={categories}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}

interface SheetProps {
  category: Category;
  groups: CategoryGroup[];
  categories: Category[];
  onClose: () => void;
}

function CategorySheet({ category, groups, categories, onClose }: SheetProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/30 backdrop-blur-[1px]"
      />
      <aside
        role="dialog"
        aria-label={category.name}
        className="absolute inset-y-0 right-0 flex w-96 max-w-[90vw] flex-col gap-6 overflow-y-auto bg-white p-6 shadow-2xl dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-zinc-400">{category.groupName}</p>
            <h2 className="text-xl font-semibold">{category.name}</h2>
          </div>
          <button type="button" onClick={onClose} className={GHOST_BUTTON}>
            ✕
          </button>
        </div>

        <Link
          href={`/transactions?categoryId=${category.id}`}
          className={`${CARD} flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800`}
        >
          <span>
            <span className="block text-2xl font-semibold tabular-nums">
              {category.transactionCount}
            </span>
            <span className="text-sm text-zinc-500">Transactions</span>
          </span>
          <span className="text-zinc-400">→</span>
        </Link>

        <Field title="Name">
          <ActionForm action={stub} label="Rename">
            <input name="name" defaultValue={category.name} className={`${INPUT_CLASS} flex-1`} />
            <button type="submit" className={PRIMARY_BUTTON}>
              Save
            </button>
          </ActionForm>
        </Field>

        <Field title="Group">
          <ActionForm action={stub} label="Move">
            <select
              name="groupId"
              defaultValue={category.groupId}
              className={`${INPUT_CLASS} flex-1`}
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <button type="submit" className={GHOST_BUTTON}>
              Move
            </button>
          </ActionForm>
        </Field>

        <Field
          title="Merge"
          hint="Moves every Transaction to the chosen Category, then deletes this one."
        >
          <ActionForm action={stub} label="Merge">
            <select name="targetId" required className={`${INPUT_CLASS} flex-1`}>
              <option value="">Choose a Category…</option>
              {categories
                .filter((other) => other.id !== category.id)
                .map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.groupName} › {other.name}
                  </option>
                ))}
            </select>
            <button type="submit" className={GHOST_BUTTON}>
              Merge
            </button>
          </ActionForm>
        </Field>

        <div className="mt-auto border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <ActionForm action={stub} label="Delete">
            <button type="submit" className="text-sm font-medium text-rose-600 hover:underline">
              Delete this Category
            </button>
          </ActionForm>
        </div>
      </aside>
    </div>
  );
}

function Field({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">{title}</h3>
      {children}
      {hint && <p className="text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}
