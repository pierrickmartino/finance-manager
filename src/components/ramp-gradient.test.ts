import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RampFill } from '@/lib/color/ramp-fills';
import { gradientFill, RampGradient, useRampGradientIds } from './ramp-gradient';

const render = (fill: RampFill, id = 'g') =>
  renderToStaticMarkup(createElement(RampGradient, { id, fill }));

describe('RampGradient', () => {
  it('draws one stop per ramp stop, its colour the token and its opacity the alpha', () => {
    const markup = render({
      direction: 'down',
      stops: [
        { token: 'ramp-1', alpha: 0.45, at: 0 },
        { token: 'ramp-5', alpha: 0.08, at: 1 },
      ],
    });

    expect(markup).toBe(
      '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" style="stop-color:var(--color-ramp-1);stop-opacity:0.45"></stop>' +
        '<stop offset="1" style="stop-color:var(--color-ramp-5);stop-opacity:0.08"></stop>' +
        '</linearGradient>',
    );
  });

  it.each([
    ['up', 'x1="0" y1="1" x2="0" y2="0"'],
    ['down-right', 'x1="0" y1="0" x2="1" y2="1"'],
  ] as const)('runs an %s fill along its vector', (direction, vector) => {
    const markup = render({ direction, stops: [{ token: 'ramp-2', alpha: 1, at: 0 }] });

    expect(markup).toContain(`id="g" ${vector}>`);
  });
});

describe('useRampGradientIds', () => {
  /** Two drawings on one page, each naming its gradient "area". */
  function Drawing() {
    const idOf = useRampGradientIds();
    return createElement('i', { 'data-id': idOf('area'), 'data-fill': gradientFill(idOf('area')) });
  }

  it('gives each drawing its own ids, safe in a url(), and fills by reference to them', () => {
    const markup = renderToStaticMarkup(
      createElement('div', null, createElement(Drawing), createElement(Drawing)),
    );
    const ids = [...markup.matchAll(/data-id="([^"]+)"/g)].map((match) => match[1]!);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(id).toMatch(/^ramp[\w-]+-area$/);
      expect(markup).toContain(`data-fill="url(#${id})"`);
    }
  });
});
