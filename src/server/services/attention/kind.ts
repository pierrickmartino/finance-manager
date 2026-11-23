import type { z } from 'zod';
import type { ServiceContext } from '../context';

/** How strongly an item asks for attention; the bell draws it as a badge of that tone. */
export type AttentionTone = 'warning';

/** What every Attention item has, whatever its kind. */
export interface AttentionItemBase {
  kind: string;
  /** What the item is about (an Account, a Recurring payment), or null for no one subject. */
  subject: string | null;
  /** Where the item is fixed. */
  href: string;
  tone: AttentionTone;
}

/**
 * One kind of Attention item, as it plugs into the bell's unread mechanism (ADR-0019): how to
 * list its current items, and its "form", what defines "got worse" for it. The kind plus the
 * subject is the item's identity; the form is stored for it when the bell is opened.
 */
export interface AttentionKindDefinition<I extends AttentionItemBase, F> {
  /** The current items of this kind, in display order. */
  list(ctx: ServiceContext, today: string): Promise<I[]>;
  /** The item's form: a JSON value, as stored in the seen set. */
  form(item: I): F;
  /** Reads a stored form back. One that no longer parses counts as not seen: unread. */
  formSchema: z.ZodType<F>;
  /** Whether the item, now in form `now`, got worse since it was seen in form `seen`. */
  gotWorse(now: F, seen: F): boolean;
}

/** A current item with its form, and how to tell whether it is unread against a stored form. */
export interface FormedAttentionItem<I extends AttentionItemBase> {
  item: I;
  form: unknown;
  /** Whether the item is unread when the seen set held it in `stored` (any JSON value). */
  isUnreadAgainst(stored: unknown): boolean;
}

/** An Attention kind with its form type hidden, so kinds of every form list side by side. */
export interface AttentionKind<I extends AttentionItemBase> {
  list(ctx: ServiceContext, today: string): Promise<FormedAttentionItem<I>[]>;
}

/** Makes a kind from its definition: each kind's file exports one. */
export function attentionKind<I extends AttentionItemBase, F>(
  definition: AttentionKindDefinition<I, F>,
): AttentionKind<I> {
  return {
    async list(ctx, today) {
      const items = await definition.list(ctx, today);
      return items.map((item) => {
        const form = definition.form(item);
        return {
          item,
          form,
          isUnreadAgainst(stored) {
            const seen = definition.formSchema.safeParse(stored);
            return !seen.success || definition.gotWorse(form, seen.data);
          },
        };
      });
    },
  };
}
