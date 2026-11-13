/**
 * Observes navigation View Transitions (ADR-0012) from a spec: which view-transition
 * animations ran while a step happened.
 */
import type { Page } from '@playwright/test';

/** One animation the browser ran on a view-transition pseudo-element. */
export interface ViewTransitionAnimation {
  /** e.g. `::view-transition-group(root)`, `::view-transition-new(dashboard-header)`. */
  pseudoElement: string;
  /** In milliseconds. */
  duration: number;
  /** The animation's timing function, e.g. `cubic-bezier(0.16, 1, 0.3, 1)`. */
  easing: string;
}

interface Recorder {
  pending: Promise<void>[];
  animations: ViewTransitionAnimation[];
}

declare global {
  interface Window {
    __viewTransitionRecorder?: Recorder;
  }
}

/**
 * Runs `action` (a click, a `goBack`, an `expect` on the new page…) and returns the
 * view-transition animations that ran meanwhile: empty when no view transition started, or
 * when one started but did not animate (reduced motion). Await the navigation's end inside
 * `action`. Records in the current document, so it sees client-side navigations, not full
 * page loads.
 */
export async function viewTransitionAnimationsDuring(
  page: Page,
  action: () => Promise<unknown>,
): Promise<ViewTransitionAnimation[]> {
  await page.evaluate(startRecording);
  await action();
  return page.evaluate(stopRecording);
}

/*
 * Runs in the page. The animations exist only between a transition's `ready` and `finished`,
 * so each `document.startViewTransition` call (React's, or a test's) is wrapped to read them
 * the moment it is ready.
 */
function startRecording(): void {
  const recorder: Recorder = { pending: [], animations: [] };
  window.__viewTransitionRecorder = recorder;

  const original = Document.prototype.startViewTransition;
  document.startViewTransition = function (this: Document, ...args) {
    const transition = original.apply(this, args);
    recorder.pending.push(
      transition.ready.then(
        () => {
          for (const animation of document.documentElement.getAnimations({ subtree: true })) {
            const effect = animation.effect;
            if (!(effect instanceof KeyframeEffect)) continue;
            const pseudoElement = effect.pseudoElement ?? '';
            if (!pseudoElement.startsWith('::view-transition')) continue;
            recorder.animations.push({
              pseudoElement,
              duration: Number(effect.getComputedTiming().duration),
              easing: effect.getKeyframes()[0]?.easing ?? effect.getTiming().easing ?? '',
            });
          }
        },
        // A skipped transition (e.g. superseded by the next navigation) ran no animation.
        () => undefined,
      ),
    );
    return transition;
  } as typeof document.startViewTransition;
}

async function stopRecording(): Promise<ViewTransitionAnimation[]> {
  const recorder = window.__viewTransitionRecorder;
  if (!recorder) throw new Error('viewTransitionAnimationsDuring: recording never started');
  await Promise.all(recorder.pending);
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  delete window.__viewTransitionRecorder;
  return recorder.animations;
}
