'use client';

import { MotionConfig, Reorder, useDragControls } from 'motion/react';
import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { FieldError } from '@/components/form';
import { ACCENT_BUTTON_CLASS } from '@/components/surface';
import { isSameOrder, moveBy } from '@/lib/reporting/order';
import { storyHero, type StoryHero } from '@/lib/reporting/story';
import type { WidgetPickerOption } from '@/lib/reporting/widget-picker';
import { reorderWidgetsAction } from '../../actions';
import { Chapter, type StoryChapter } from '../story/chapter';
import { Hero } from '../story/hero';
import { STORY } from '../story/palette';
import { StoryStillness } from '../story/stillness';
import { AddSlot } from './add-slot';
import { EditBar, moveButtonId } from './edit-bar';

export interface EditorChapter extends StoryChapter {
  /** The Widget editor, opened on this Widget. */
  editHref: string;
}

interface StoryEditorProps {
  dashboardId: string;
  dashboardName: string;
  storyHref: string;
  chapters: EditorChapter[];
  savedWidgets: WidgetPickerOption[];
}

/** Which Widgets the hero's number and its flow sentence come from. */
function HeroNote({ hero }: { hero: StoryHero | null }) {
  if (!hero) {
    return (
      <p className="pt-8 text-sm" style={{ color: STORY.muted }}>
        No hero yet: add a Number or Account balances Widget.
      </p>
    );
  }
  return (
    <p className="pt-8 text-sm" style={{ color: STORY.muted }}>
      Hero: number from <i style={{ color: STORY.ink }}>{hero.sources.value}</i>
      {hero.sources.flow && (
        <>
          {' · '}flow line from <i style={{ color: STORY.ink }}>{hero.sources.flow}</i>
        </>
      )}
    </p>
  );
}

interface EditableChapterProps {
  chapter: EditorChapter;
  index: number;
  count: number;
  onMove: (id: string, delta: -1 | 1) => void;
  onDragEnd: () => void;
  addSlot: React.ReactNode;
}

function EditableChapter({
  chapter,
  index,
  count,
  onMove,
  onDragEnd,
  addSlot,
}: EditableChapterProps) {
  const dragControls = useDragControls();
  return (
    <Reorder.Item
      as="li"
      value={chapter.id}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      className="relative list-none"
      style={{ background: STORY.paper }}
    >
      <EditBar
        widgetId={chapter.id}
        name={chapter.name}
        editHref={chapter.editHref}
        isFirst={index === 0}
        isLast={index === count - 1}
        onMove={(delta) => onMove(chapter.id, delta)}
        dragControls={dragControls}
      />
      <Chapter chapter={chapter} index={index} isUnruled />
      {addSlot}
    </Reorder.Item>
  );
}

/**
 * Edit mode: the Dashboard's Story, still, with each chapter's actions above it and a place to
 * add a chapter between every two. A move saves the new order at once (without History).
 */
export function StoryEditor({
  dashboardId,
  dashboardName,
  storyHref,
  chapters,
  savedWidgets,
}: StoryEditorProps) {
  const [order, setOrder] = useState(() => chapters.map((chapter) => chapter.id));
  const orderRef = useRef(order);
  const savedRef = useRef(order);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const ordered = order.flatMap((id) => byId.get(id) ?? []);
  const hero = storyHero(ordered);

  const reorder = (next: string[]) => {
    orderRef.current = next;
    setOrder(next);
  };
  const save = () => {
    const next = orderRef.current;
    if (isSameOrder(next, savedRef.current)) return;
    savedRef.current = next;
    startSaving(async () => {
      const result = await reorderWidgetsAction(dashboardId, next);
      setError(result.ok ? null : result.error);
    });
  };
  const move = (id: string, delta: -1 | 1) => {
    reorder(moveBy(orderRef.current, id, delta));
    save();
    // Keep focus on the arrow that moved the chapter, or the other one at either end.
    requestAnimationFrame(() => {
      const same = document.getElementById(moveButtonId(id, delta)) as HTMLButtonElement | null;
      const other = document.getElementById(moveButtonId(id, delta < 0 ? 1 : -1));
      (same && !same.disabled ? same : other)?.focus();
    });
  };
  const slot = (position: number) => (
    <AddSlot
      dashboardId={dashboardId}
      position={position}
      savedWidgets={savedWidgets}
      isOpen={ordered.length === 0}
    />
  );

  return (
    <MotionConfig reducedMotion="user">
      <StoryStillness isStill>
        <div
          className="px-1 md:px-2"
          style={{ background: STORY.paper, color: STORY.ink, colorScheme: 'light' }}
        >
          <header
            className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b py-3"
            style={{ background: STORY.paper, borderColor: STORY.rule }}
          >
            <div className="flex items-baseline gap-3">
              <h1 className="font-display text-3xl tracking-tight">{dashboardName}</h1>
              <span className="text-sm" style={{ color: STORY.muted }}>
                Editing
              </span>
            </div>
            <Link href={storyHref} className={ACCENT_BUTTON_CLASS}>
              Done
            </Link>
          </header>
          {error && <FieldError message={error} />}
          <p role="status" className="sr-only">
            {isSaving ? 'Saving the order…' : ''}
          </p>
          {ordered.length === 0 ? (
            <p className="pt-12 text-lg" style={{ color: STORY.muted }}>
              No Widgets yet. Add the first chapter.
            </p>
          ) : (
            <>
              <HeroNote hero={hero} />
              {hero && <Hero hero={hero} />}
            </>
          )}
          {slot(0)}
          <Reorder.Group as="ol" axis="y" values={order} onReorder={reorder} className="p-0">
            {ordered.map((chapter, index) => (
              <EditableChapter
                key={chapter.id}
                chapter={chapter}
                index={index}
                count={ordered.length}
                onMove={move}
                onDragEnd={save}
                addSlot={slot(index + 1)}
              />
            ))}
          </Reorder.Group>
        </div>
      </StoryStillness>
    </MotionConfig>
  );
}
