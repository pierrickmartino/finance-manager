'use client';

/** PROTOTYPE (widget editor redesign): the few client bits the variants need. Throwaway. */

import { useState, type ReactNode } from 'react';

/** A GET form that re-runs the preview on every change (variant A: live studio). */
export function AutoSubmitForm({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <form
      method="get"
      aria-label="Widget query"
      className={className}
      onChange={(event) => {
        const target = event.target as unknown as HTMLInputElement;
        // Typing a number or a date: wait for blur rather than reloading on each keystroke.
        if (target.type === 'number' || target.type === 'date') return;
        event.currentTarget.requestSubmit();
      }}
      onBlur={(event) => {
        const target = event.target as unknown as HTMLInputElement;
        if (target.type === 'number' || target.type === 'date') event.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}

export interface Step {
  title: string;
  summary: string;
  content: ReactNode;
}

/**
 * Variant B: one question at a time. Every step stays in the DOM (hidden), so the single GET
 * form still submits everything; only "See preview" reloads, landing on the last step.
 */
export function Stepper({
  steps,
  hiddenFields,
  review,
  initialStep,
}: {
  steps: Step[];
  hiddenFields: ReactNode;
  review: ReactNode;
  initialStep: number;
}) {
  const reviewIndex = steps.length;
  const [current, setCurrent] = useState(Math.min(initialStep, reviewIndex));
  const all = [
    ...steps.map((s) => ({ title: s.title, summary: s.summary })),
    { title: 'Name & save', summary: 'Check the preview' },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <ol className="flex flex-col gap-1" aria-label="Steps">
        {all.map((step, index) => {
          const state = index === current ? 'current' : index < current ? 'done' : 'todo';
          return (
            <li key={step.title}>
              <button
                type="button"
                onClick={() => setCurrent(index)}
                aria-current={state === 'current' ? 'step' : undefined}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left ${
                  state === 'current'
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <span
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    state === 'current'
                      ? 'bg-white text-zinc-900 dark:bg-zinc-900 dark:text-white'
                      : state === 'done'
                        ? 'bg-emerald-600 text-white'
                        : 'border border-zinc-300 text-zinc-500 dark:border-zinc-700'
                  }`}
                >
                  {state === 'done' ? '✓' : index + 1}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{step.title}</span>
                  <span
                    className={`text-xs ${state === 'current' ? 'opacity-80' : 'text-zinc-500'}`}
                  >
                    {step.summary}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="min-w-0">
        <form method="get" aria-label="Widget query" hidden={current === reviewIndex}>
          {hiddenFields}
          {steps.map((step, index) => (
            <section key={step.title} hidden={index !== current} className="flex flex-col gap-5">
              <header>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Step {index + 1} of {all.length}
                </p>
                <h2 className="text-xl font-semibold">{step.title}</h2>
              </header>
              {step.content}
              <div className="flex items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => setCurrent(index - 1)}
                    className="text-sm underline"
                  >
                    Back
                  </button>
                )}
                <span className="flex-1" />
                {index < steps.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setCurrent(index + 1)}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
                  >
                    Next
                  </button>
                )}
                <button
                  type="submit"
                  name="step"
                  value={reviewIndex}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
                >
                  See preview
                </button>
              </div>
            </section>
          ))}
        </form>
        {current === reviewIndex && review}
      </div>
    </div>
  );
}
