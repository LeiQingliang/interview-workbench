import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';

const builtFile = fileURLToPath(new URL('../dist/index.html', import.meta.url));

async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('.qa').first()).toBeAttached();
}

async function openFirstQuestion(page) {
  const question = page.locator('.qa').first();
  await question.evaluate((element) => {
    element.open = true;
  });
  await question.scrollIntoViewIfNeeded();
  return question;
}

async function firstNote(page) {
  const note = page.locator('[data-note]').first();
  await note.evaluate((element) => {
    const question = element.closest('details');
    if (question) question.open = true;
  });
  return note;
}

test('the page has unique IDs, no uncaught errors, and no horizontal overflow', async ({
  page,
  isMobile,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openApp(page);
  const ids = await page
    .locator('[id]')
    .evaluateAll((elements) => elements.map((element) => element.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  if (isMobile) {
    await page.locator('#menu').click();
    await expect(page.locator('#sidebar')).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('search finds a real question and can be cleared', async ({ page }) => {
  await openApp(page);
  const title = (await page.locator('.qa summary').first().innerText()).trim();
  // A source substring exercises indexing without depending on demo copy.
  const term = title.replace(/^\d+[\s｜|.、-]*/, '').slice(0, 8);
  await page.locator('#search').fill(term);
  await expect(page.locator('#searchList')).toBeVisible();
  await expect(page.locator('#searchList')).toContainText(term);
  await page.locator('#clearSearch').click();
  await expect(page.locator('#search')).toHaveValue('');
});

test('favorites, completed questions, and personal notes survive a reload', async ({ page }) => {
  await openApp(page);
  const question = await openFirstQuestion(page);
  const questionId = await question.getAttribute('id');
  await question.locator('.qa-tools button').nth(0).click();
  await question.locator('.qa-tools button').nth(1).click();
  const note = await firstNote(page);
  const noteId = await note.getAttribute('data-note');
  await note.fill('A private rehearsal note, saved locally.');
  await page.reload();
  const restored = page.locator(`[id="${questionId}"]`);
  await restored.evaluate((element) => {
    element.open = true;
  });
  await expect(restored.locator('.qa-tools button').nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(restored.locator('.qa-tools button').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`[data-note="${noteId}"]`)).toHaveValue(
    'A private rehearsal note, saved locally.',
  );
  await page.locator('#filter').selectOption('favorite');
  await expect(page.locator('#searchList .search-hit')).toHaveCount(1);
  await page.locator('#searchList .search-hit button').click();
  await expect(restored).toBeVisible();
  await expect(page.locator('#filter')).toHaveValue('all');
});

test('mock practice reveals an answer, advances, and runs the countdown', async ({ page }) => {
  await page.clock.install();
  await openApp(page);
  await page.locator('#startQuiz').click();
  await expect(page.locator('#quiz')).toBeVisible();
  await expect(page.locator('#quizQuestion')).not.toHaveText('');
  await page.locator('#showAnswer').click();
  await expect(page.locator('#quizAnswer')).toBeVisible();
  await expect(page.locator('#quizAnswer')).not.toHaveText('');
  const before = await page.locator('#timer').textContent();
  await page.locator('#timerStart').click();
  await page.clock.fastForward(1_100);
  await expect(page.locator('#timer')).not.toHaveText(before);
  await page.locator('#nextQuestion').click();
  await expect(page.locator('#quizQuestion')).not.toHaveText('');
  await page.locator('#quizClose').click();
  await expect(page.locator('#quiz')).toBeHidden();
});

test('the calculator reflects unit economics and handles a zero redemption rate', async ({
  page,
}) => {
  await openApp(page);
  for (const [id, value] of Object.entries({
    calcPrice: '49',
    calcCost: '25',
    calcOrders: '2000',
    calcRate: '60',
    calcFee: '3',
    calcMarket: '5000',
    calcOps: '1000',
  })) {
    await page.locator(`#${id}`).fill(value);
  }
  await expect(page.locator('#rContribution')).toContainText(/21[,.\s]?036/);
  await expect(page.locator('#rBreak')).toContainText('444');
  await page.locator('#calcRate').fill('0');
  await expect(page.locator('#rContribution')).toContainText(/[-−]\s*¥?\s*6[,.\s]?000/);
  await expect(page.locator('#rBreak')).not.toContainText('444');
  await expect(page.locator('#rBreak')).not.toContainText(/NaN|Infinity/);
});

test('export downloads the user-written notes as a Markdown file', async ({ page }) => {
  await openApp(page);
  const marker = 'Export fixture: a specific example and next action.';
  await (await firstNote(page)).fill(marker);
  const question = await openFirstQuestion(page);
  await question.locator('.qa-tools button').nth(0).click();
  await question.locator('.qa-tools button').nth(1).click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const content = await readFile(downloadPath, 'utf8');
  expect(content).toContain(marker);
  expect(content).toMatch(/重点|收藏|favorite/i);
  expect(content).toMatch(/已练|完成|done|completed/i);
});

test('reset requires confirmation and preserves unrelated browser data', async ({
  page,
  isMobile,
}) => {
  await openApp(page);
  await (await firstNote(page)).fill('Delete only this app note.');
  await page.evaluate(() => localStorage.setItem('unrelated-app-fixture', 'keep-me'));
  if (isMobile) await page.locator('#menu').click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#resetData').click();
  await expect(page.locator('[data-note]').first()).toHaveValue('Delete only this app note.');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#resetData').click();
  await expect(page.locator('[data-note]').first()).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('unrelated-app-fixture'))).toBe('keep-me');
});

test('print mode expands the answers for a complete printed guide', async ({ page }) => {
  await openApp(page);
  await page.locator('.qa').evaluateAll((questions) => {
    for (const question of questions) question.open = false;
  });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const expanded = await page
    .locator('.qa')
    .evaluateAll((questions) => questions.every((question) => question.open));
  expect(expanded).toBe(true);
  await expect(page.locator('.qa .answer').first()).toBeVisible();
});

test('the single HTML file works offline without external network requests', async ({
  page,
  context,
}) => {
  const externalRequests = [];
  const errors = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) externalRequests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await context.setOffline(true);
  await page.goto(pathToFileURL(builtFile).href);
  await expect(page.locator('.qa').first()).toBeAttached();
  const question = await openFirstQuestion(page);
  await question.locator('.qa-tools button').nth(0).click();
  await expect(question.locator('.qa-tools button').nth(0)).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#calcPrice').fill('49');
  await expect(page.locator('#rContribution')).not.toContainText(/NaN|Infinity/);
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});
