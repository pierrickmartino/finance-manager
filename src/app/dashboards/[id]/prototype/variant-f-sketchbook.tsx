'use client';

/**
 * PROTOTYPE (throwaway) — Variant F "Sketchbook" (light only). The Dashboard as a notebook
 * spread on grid paper: hand-drawn rough.js charts that sketch themselves stroke by stroke,
 * a highlighter swipe under the net worth, sticky notes pointing at what matters, and a
 * "Sketch again" button that redraws everything with a new hand.
 */
import '@fontsource-variable/caveat';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import { motion, useReducedMotion } from 'motion/react';
import rough from 'roughjs';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  heroKpisOf,
  insightsOf,
  savingsRateOf,
  seriesOf,
  slicesOf,
  splitPath,
  type ProtoProps,
  type ProtoWidget,
} from './data';
import { useMoney, type Money } from './money';

const PAPER = '#fdfdf7';
const GRAPHITE = '#2d2a26';
const BLUE = '#2f62d0';
const RED = '#df3b3b';
const GREEN = '#1f9d55';
const HIGHLIGHT = '#ffe45c';
const PENS = [BLUE, RED, GREEN, '#f08c00', '#8e44ad', '#0b8a8a', '#c2185b', '#6d6d6d'];
const HAND = '"Caveat Variable", "Kalam", cursive';
const BODY = '"Kalam", "Caveat Variable", cursive';

type RoughSvg = ReturnType<typeof rough.svg>;
type Draw = (rc: RoughSvg, svg: SVGSVGElement, width: number, height: number, seed: number) => void;

function text(
  svg: SVGSVGElement,
  x: number,
  y: number,
  value: string,
  opts: { size?: number; color?: string; anchor?: string; rotate?: number } = {},
) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  node.setAttribute('x', String(x));
  node.setAttribute('y', String(y));
  node.setAttribute('fill', opts.color ?? GRAPHITE);
  node.setAttribute('font-size', String(opts.size ?? 20));
  node.setAttribute('text-anchor', opts.anchor ?? 'middle');
  node.setAttribute('font-family', HAND);
  if (opts.rotate) node.setAttribute('transform', `rotate(${opts.rotate} ${x} ${y})`);
  node.textContent = value;
  svg.appendChild(node);
}

/** Draws with rough.js, then animates every stroke as if a pen were drawing it. */
function Sketch({
  draw,
  height,
  seed,
  label,
}: {
  draw: Draw;
  height: number;
  seed: number;
  label: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  const isReduced = useReducedMotion();

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry!.contentRect.width)),
    );
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || width === 0) return;
    svg.replaceChildren();
    draw(rough.svg(svg, { options: { seed } }), svg, width, height, seed);
    if (isReduced) return;
    const paths = [...svg.querySelectorAll('path')];
    paths.forEach((path, index) => {
      const length = path.getTotalLength();
      path.style.strokeDasharray = `${length}`;
      path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
        duration: 500 + Math.min(900, length * 0.6),
        delay: index * (1800 / Math.max(1, paths.length)),
        easing: 'ease-out',
        fill: 'both',
      });
    });
    svg.querySelectorAll('text').forEach((node, index) =>
      node.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 400,
        delay: 900 + index * 40,
        fill: 'both',
      }),
    );
  }, [draw, width, height, seed, isReduced]);

  return (
    <svg
      ref={ref}
      role="img"
      aria-label={label}
      className="block w-full overflow-visible"
      style={{ height }}
    />
  );
}

function barsDraw(widget: ProtoWidget, money: Money): Draw {
  return (rc, svg, width, height) => {
    const chart = seriesOf(widget);
    if (!chart) return;
    const top = 16;
    const bottom = height - 30;
    const values = chart.points.map((point) =>
      chart.series.map((series) => point.values[series.key] ?? 0),
    );
    const max = Math.max(...values.flat().map(Math.abs));
    const mid = top + (bottom - top) / 2;
    const scale = (bottom - top) / 2 / max;
    const step = width / chart.points.length;
    svg.appendChild(
      rc.line(0, mid, width, mid, { stroke: GRAPHITE, strokeWidth: 1.5, roughness: 1.5 }),
    );
    values.forEach((row, i) => {
      row.forEach((value, s) => {
        if (value === 0) return;
        const h = Math.abs(value) * scale;
        const y = value > 0 ? mid - h : mid;
        svg.appendChild(
          rc.rectangle(i * step + step * 0.2, y, step * 0.6, h, {
            stroke: value > 0 ? BLUE : RED,
            fill: value > 0 ? BLUE : RED,
            fillStyle: s % 2 ? 'cross-hatch' : 'hachure',
            hachureGap: 5,
            fillWeight: 1,
            roughness: 1.6,
          }),
        );
      });
      text(svg, i * step + step / 2, height - 6, chart.points[i]!.label.slice(0, 3), { size: 18 });
    });
    text(svg, 4, top + 12, `+${money.compact(max)}`, { size: 18, anchor: 'start', color: BLUE });
    text(svg, 4, bottom, `−${money.compact(max)}`, { size: 18, anchor: 'start', color: RED });
  };
}

function lineDraw(widget: ProtoWidget, money: Money): Draw {
  return (rc, svg, width, height) => {
    const chart = seriesOf(widget);
    if (!chart) return;
    const values = chart.points.map((point) =>
      Object.values(point.values).reduce<number>((sum, value) => sum + (value ?? 0), 0),
    );
    const min = Math.min(0, ...values);
    const max = Math.max(...values);
    const pad = 30;
    const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = (v: number) => 20 + (1 - (v - min) / (max - min || 1)) * (height - 60);
    svg.appendChild(
      rc.line(pad, y(0), width - pad, y(0), { stroke: '#9a958c', strokeWidth: 1, roughness: 2 }),
    );
    const points = values.map((value, i) => [x(i), y(value)] as [number, number]);
    svg.appendChild(rc.curve(points, { stroke: GRAPHITE, strokeWidth: 2.5, roughness: 1.2 }));
    const best = values.indexOf(max);
    points.forEach(([px, py], i) =>
      svg.appendChild(
        rc.circle(px, py, i === best ? 34 : 9, {
          stroke: i === best ? RED : GRAPHITE,
          strokeWidth: i === best ? 2 : 1.5,
          fill: i === best ? undefined : PAPER,
          fillStyle: 'solid',
        }),
      ),
    );
    const [bx, by] = points[best]!;
    const toLeft = bx > width / 2;
    svg.appendChild(
      rc.curve(
        [
          [bx + (toLeft ? -20 : 20), by + 6],
          [bx + (toLeft ? -70 : 70), by + 40],
          [bx + (toLeft ? -110 : 110), by + 46],
        ],
        { stroke: RED, strokeWidth: 1.5 },
      ),
    );
    text(svg, bx + (toLeft ? -118 : 118), by + 58, `best month! ${money.compact(max)}`, {
      size: 24,
      color: RED,
      anchor: toLeft ? 'end' : 'start',
      rotate: -4,
    });
    chart.points.forEach((point, i) =>
      text(svg, x(i), height - 6, point.label.slice(0, 3), { size: 18 }),
    );
  };
}

function pieDraw(widget: ProtoWidget, money: Money): Draw {
  return (rc, svg, width, height) => {
    const chart = seriesOf(widget);
    const items =
      chart && chart.series.length > 1
        ? chart.series.map((series) => ({
            label: splitPath(series.label)[1],
            value: Math.abs(
              chart.points.reduce((sum, point) => sum + (point.values[series.key] ?? 0), 0),
            ),
          }))
        : slicesOf(widget).map((slice) => ({ label: slice.label, value: slice.value }));
    const sorted = items
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    const total = sorted.reduce((sum, item) => sum + item.value, 0);
    const cx = width / 2;
    const cy = height / 2;
    // rough.js arcs take a diameter; leave room around it for the hand-written labels.
    const r = Math.max(120, Math.min(width - 260, height - 50));
    let angle = -Math.PI / 2;
    sorted.forEach((item, i) => {
      const sweep = (item.value / total) * Math.PI * 2;
      svg.appendChild(
        rc.arc(cx, cy, r, r, angle, angle + sweep, true, {
          stroke: GRAPHITE,
          strokeWidth: 1.2,
          fill: PENS[i % PENS.length],
          fillStyle: ['hachure', 'zigzag', 'cross-hatch', 'dots'][i % 4],
          hachureGap: 6,
          roughness: 1.4,
        }),
      );
      const mid = angle + sweep / 2;
      const lx = cx + Math.cos(mid) * (r / 2 + 16);
      const ly = cy + Math.sin(mid) * (r / 2 + 16) + 6;
      if (item.value / total >= 0.05)
        text(svg, lx, ly, `${item.label} ${Math.round((item.value / total) * 100)}%`, {
          size: 20,
          anchor: Math.cos(mid) > 0.2 ? 'start' : Math.cos(mid) < -0.2 ? 'end' : 'middle',
          color: PENS[i % PENS.length],
        });
      angle += sweep;
    });
    text(svg, cx, height - 4, `${money.compact(total)} in all`, { size: 22, color: GRAPHITE });
  };
}

function balancesDraw(widget: ProtoWidget, money: Money): Draw {
  return (rc, svg, width, height) => {
    const slices = slicesOf(widget).sort((a, b) => b.value - a.value);
    const max = Math.max(...slices.map((slice) => slice.value));
    const row = height / slices.length;
    slices.forEach((slice, i) => {
      const y = i * row + 8;
      text(svg, 0, y + 22, slice.label.split(' · ').pop() ?? slice.label, {
        size: 22,
        anchor: 'start',
      });
      const barW = (width - 90) * (slice.value / max);
      svg.appendChild(
        rc.rectangle(0, y + 32, barW, row - 48, {
          stroke: GRAPHITE,
          fill: PENS[(i + 2) % PENS.length],
          fillStyle: 'zigzag',
          hachureGap: 7,
          roughness: 1.5,
        }),
      );
      text(svg, barW + 10, y + row - 20, money.compact(slice.value), {
        size: 24,
        anchor: 'start',
        color: PENS[(i + 2) % PENS.length],
      });
    });
  };
}

function Sticky({
  children,
  color = '#fff3a3',
  rotate = -2,
}: {
  children: ReactNode;
  color?: string;
  rotate?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -30, rotate: rotate - 8 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={{ type: 'spring', stiffness: 120, damping: 12, delay: 2.2 }}
      className="relative w-full max-w-[15rem] p-4 pt-6 text-lg leading-snug shadow-[2px_6px_14px_rgba(60,50,20,0.18)]"
      style={{ background: color, fontFamily: BODY }}
    >
      <span
        className="absolute -top-2 left-1/2 h-5 w-16 -translate-x-1/2 rotate-2 bg-white/60"
        aria-hidden
      />
      {children}
    </motion.div>
  );
}

function Page({ children, side }: { children: ReactNode; side: 'left' | 'right' }) {
  return (
    <div
      className="relative px-8 py-10 md:px-12"
      style={{
        backgroundColor: PAPER,
        backgroundImage:
          'linear-gradient(rgba(47,98,208,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(47,98,208,0.09) 1px, transparent 1px)',
        backgroundSize: '26px 26px',
        boxShadow:
          side === 'left'
            ? 'inset -24px 0 30px -24px rgba(60,50,20,0.25)'
            : 'inset 24px 0 30px -24px rgba(60,50,20,0.25)',
      }}
    >
      {side === 'left' && (
        <span aria-hidden className="absolute inset-y-0 left-6 w-px bg-red-300 md:left-9" />
      )}
      {children}
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-4xl" style={{ fontFamily: HAND, fontWeight: 700 }}>
      {children}
    </h2>
  );
}

export function VariantSketchbook(props: ProtoProps) {
  const money = useMoney();
  const [seed, setSeed] = useState(7);
  const { widgets } = props;
  const balances = widgets.find((widget) => widget.source === 'account_balances');
  const flowWidget = widgets.find((widget) => savingsRateOf(widget) !== null);
  const line = widgets.find((widget) => widget.visualisation === 'line');
  const split = widgets.find(
    (widget) => widget !== flowWidget && (seriesOf(widget)?.series.length ?? 0) > 2,
  );
  const worth = heroKpisOf(widgets).find((kpi) => kpi.label === 'Net worth');
  const rate = flowWidget ? savingsRateOf(flowWidget) : null;
  const splitInsight = split ? insightsOf(split, money.whole)[0] : null;

  // Builders depend on data only, so the same drawing is replayed until the seed changes.
  const [draws] = useState(() => ({
    bars: flowWidget ? barsDraw(flowWidget, money) : null,
    line: line ? lineDraw(line, money) : null,
    pie: split ? pieDraw(split, money) : null,
    balances: balances ? balancesDraw(balances, money) : null,
  }));

  return (
    <div className="-mx-2 md:-mx-4" style={{ colorScheme: 'light', color: GRAPHITE }}>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-500">Our money, drawn by hand.</p>
        <button
          type="button"
          onClick={() => setSeed((value) => value + 1)}
          className="rounded-full border-2 border-zinc-800 bg-white px-4 py-1.5 text-lg text-zinc-900 shadow-[3px_3px_0_#27272a] transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          style={{ fontFamily: HAND, fontWeight: 700 }}
        >
          Sketch again
        </button>
      </div>
      <div className="grid overflow-hidden rounded-md shadow-[0_30px_60px_-30px_rgba(60,50,20,0.45)] lg:grid-cols-2">
        <Page side="left">
          <h1 className="text-6xl leading-none" style={{ fontFamily: HAND, fontWeight: 700 }}>
            {props.dashboardName}
          </h1>
          {worth && (
            <div className="mt-6">
              <p className="text-xl" style={{ fontFamily: BODY }}>
                We own, all accounts together,
              </p>
              <p
                className="relative mt-1 inline-block text-7xl"
                style={{ fontFamily: HAND, fontWeight: 700 }}
              >
                <motion.span
                  key={seed}
                  aria-hidden
                  className="absolute -inset-x-3 bottom-1 top-6 -z-0 origin-left -rotate-1 rounded-sm"
                  style={{ background: HIGHLIGHT, opacity: 0.85 }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
                />
                <span className="relative">{money.whole(worth.value)}</span>
              </p>
            </div>
          )}
          {draws.bars && flowWidget && (
            <section className="mt-10">
              <Heading>{flowWidget.name}</Heading>
              <Sketch
                key={`bars-${seed}`}
                draw={draws.bars}
                height={260}
                seed={seed}
                label={`${flowWidget.name}, hand-drawn bars`}
              />
            </section>
          )}
          {draws.line && line && (
            <section className="mt-10">
              <Heading>{line.name}</Heading>
              <Sketch
                key={`line-${seed}`}
                draw={draws.line}
                height={260}
                seed={seed}
                label={`${line.name}, hand-drawn line`}
              />
            </section>
          )}
        </Page>
        <Page side="right">
          {draws.pie && split && (
            <section>
              <Heading>{split.name}</Heading>
              <div className="flex flex-col gap-6">
                <Sketch
                  key={`pie-${seed}`}
                  draw={draws.pie}
                  height={340}
                  seed={seed}
                  label={`${split.name}, hand-drawn pie`}
                />
                <div className="flex flex-wrap justify-center gap-6">
                  {splitInsight && (
                    <Sticky>
                      {splitInsight.headline}: <b>{splitInsight.detail.replace('-', '')}</b> over
                      the year.
                    </Sticky>
                  )}
                  {rate !== null && (
                    <Sticky color="#ffd1dc" rotate={3}>
                      We kept <b>{Math.round(rate * 100)}%</b> of what came in. Good year!
                    </Sticky>
                  )}
                </div>
              </div>
            </section>
          )}
          {draws.balances && balances && (
            <section className="mt-10">
              <Heading>{balances.name}</Heading>
              <Sketch
                key={`bal-${seed}`}
                draw={draws.balances}
                height={240}
                seed={seed}
                label={`${balances.name}, hand-drawn bars`}
              />
            </section>
          )}
        </Page>
      </div>
    </div>
  );
}
