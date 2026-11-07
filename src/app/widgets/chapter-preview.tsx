'use client';

import { Chapter, type StoryChapter } from '../dashboards/[id]/story/chapter';
import { STORY } from '../dashboards/[id]/story/palette';
import { StoryStillness } from '../dashboards/[id]/story/stillness';

/** The Widget as its Dashboard Story chapter, drawn still on the Story's paper. */
export function ChapterPreview({ chapter }: { chapter: StoryChapter }) {
  return (
    <StoryStillness isStill>
      <div
        className="rounded-lg px-4 md:px-6"
        style={{ background: STORY.paper, color: STORY.ink, colorScheme: 'light' }}
      >
        <Chapter chapter={chapter} index={0} isUnruled />
      </div>
    </StoryStillness>
  );
}
