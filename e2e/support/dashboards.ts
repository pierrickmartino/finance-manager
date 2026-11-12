/**
 * Helpers for a Dashboard's board (ADR-0010): finding a Widget's card, and dragging or resizing
 * it in Edit mode at `lg` and above. Steps are whole grid cells, measured from the board.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** Mirrors the board's gap and row height (BOARD_GAP_PX, BOARD_ROW_HEIGHT_PX). */
const GAP_PX = 20;
const ROW_HEIGHT_PX = 40;
const COLUMNS = 12;

/** A Widget's card: the region labelled by its name. */
export function widgetCard(page: Page, name: string): Locator {
  return page.getByRole('region', { name, exact: true });
}

/** Waits until no card is still sliding into place (the grid animates every move). */
export async function boardIsStill(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

/** Where a Widget's card is drawn, from the board's top-left corner (so scrolling doesn't count). */
export async function cardBox(page: Page, name: string) {
  await boardIsStill(page);
  const [box, board] = [
    await widgetCard(page, name).boundingBox(),
    await page.locator('.dashboard-board').boundingBox(),
  ];
  if (!box || !board) throw new Error(`No card for ${name}`);
  return { ...box, x: box.x - board.x, y: box.y - board.y };
}

/** How far one grid cell is, across and down, in px. */
async function cellStep(page: Page): Promise<{ x: number; y: number }> {
  const board = await page.locator('.dashboard-board').boundingBox();
  if (!board) throw new Error('No board');
  const columnWidth = (board.width - GAP_PX * (COLUMNS - 1)) / COLUMNS;
  return { x: columnWidth + GAP_PX, y: ROW_HEIGHT_PX + GAP_PX };
}

/** Waits for the next server action (a POST) to answer. */
export function nextAction(page: Page) {
  return page.waitForResponse((response) => response.request().method() === 'POST');
}

/** Presses at `from`, moves by whole cells in small steps, and lets go once the save answers. */
async function dragBy(page: Page, from: Locator, columns: number, rows: number): Promise<void> {
  const box = await from.boundingBox();
  if (!box) throw new Error('Nothing to drag');
  const step = await cellStep(page);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + columns * step.x, start.y + rows * step.y, { steps: 12 });
  const saved = nextAction(page);
  await page.mouse.up();
  expect((await saved).ok()).toBe(true);
}

/** In Edit mode: drags a card by its handle, by whole cells (positive is right and down). */
export async function dragCard(page: Page, name: string, columns: number, rows: number) {
  const handle = page.getByRole('button', { name: `Move ${name}`, exact: true });
  await dragBy(page, handle, columns, rows);
}

/** In Edit mode at `lg` and up: the card itself, focused to move it with the keyboard. */
export function arrangeCard(page: Page, name: string): Locator {
  return page.getByRole('group', { name: `Arrange ${name}`, exact: true });
}

/** Presses a key on the focused card and waits for the board's save to answer. */
export async function stepWithKey(page: Page, key: string): Promise<void> {
  const saved = nextAction(page);
  await page.keyboard.press(key);
  expect((await saved).ok()).toBe(true);
}

/** In Edit mode: resizes a card from its bottom-right corner, by whole cells. */
export async function resizeCard(page: Page, name: string, columns: number, rows: number) {
  const handle = page
    .locator('.react-grid-item', { has: widgetCard(page, name) })
    .locator('.react-resizable-handle-se');
  await widgetCard(page, name).hover();
  await dragBy(page, handle, columns, rows);
}
