import { PLACEHOLDER_CLASS, TILE_CLASS } from './surface';

/** How many card blocks the skeleton's board shows, and how wide each is from `lg` up. */
const BOARD_BLOCKS = ['lg:col-span-8', 'lg:col-span-4', 'lg:col-span-4', 'lg:col-span-8'];

/**
 * A generic page skeleton, shown the moment a Dashboard, its Edit mode or a Standalone Widget is
 * opened, until the page's own shell renders: a title bar, an overview row and a few cards. It
 * can't know the real tabs or card sizes; the page takes over with placeholders that do.
 */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <section aria-label={label} aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-2">
        <div className={`${PLACEHOLDER_CLASS} h-8 w-64 max-w-full`} />
        <div className={`${PLACEHOLDER_CLASS} h-4 w-96 max-w-full`} />
      </div>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${TILE_CLASS} h-56`}>
            <div className={`${PLACEHOLDER_CLASS} h-full`} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12">
        {BOARD_BLOCKS.map((span, i) => (
          <div key={i} className={`${TILE_CLASS} h-72 ${span}`}>
            <div className={`${PLACEHOLDER_CLASS} h-full`} />
          </div>
        ))}
      </div>
    </section>
  );
}
