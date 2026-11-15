// UI tests generated from specs/ORD-002-my-orders.md
import { test, expect, type APIRequestContext } from '@playwright/test';
import { API, apiHeaders } from './helpers';

// Every UI test acts as the single user `demo`. AC12 adds 21 orders, which could push another
// test's order off page 1, so the tests in this file run one after another.
test.describe.configure({ mode: 'serial' });

type Item = { sku: string; quantity: number };

async function placeOrder(request: APIRequestContext, items: Item[] = [{ sku: 'TEST-SKU-1', quantity: 1 }]) {
  const r = await request.post(`${API}/orders`, { headers: apiHeaders(), data: { items } });
  expect(r.status()).toBe(201);
  return (await r.json()) as { id: string };
}

function todayUtc(): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date());
}

test('my orders lists a new order with its summary', { tag: '@ORD-002-AC9' }, async ({ page, request }) => {
  const order = await placeOrder(request, [
    { sku: 'TEST-SKU-1', quantity: 2 },
    { sku: 'TEST-SKU-2', quantity: 1 },
  ]);
  await page.goto('/orders');

  await expect(page.getByRole('heading', { name: 'My orders' })).toBeVisible();
  const table = page.getByRole('table', { name: 'My orders' });
  const header = table.getByRole('row').first();
  for (const col of ['Date', 'Status', 'Items', 'Products', 'Total']) {
    await expect(header.getByRole('columnheader', { name: col })).toBeVisible();
  }

  const row = table.getByRole('row').filter({ has: page.getByRole('link', { name: order.id }) });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('cell').nth(1)).toHaveText(todayUtc());
  await expect(row.getByRole('cell').nth(2)).toHaveText('Pending');
  await expect(row.getByRole('cell').nth(3)).toHaveText('3');
  await expect(row.getByRole('cell').nth(4)).toHaveText('Blue Mug, Notebook');
  await expect(row.getByRole('cell').nth(5)).toHaveText('$24.50');
});

test('order link opens the order details', { tag: '@ORD-002-AC10' }, async ({ page, request }) => {
  const order = await placeOrder(request);
  await page.goto('/orders');
  await page.getByRole('link', { name: order.id }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
});

test('header and confirmation page link to my orders', { tag: '@ORD-002-AC11' }, async ({ page, request }) => {
  await page.goto('/products');
  await page.getByRole('navigation').getByRole('link', { name: 'My orders' }).click();
  await expect(page).toHaveURL(/\/orders$/);

  const order = await placeOrder(request);
  await page.goto(`/orders/${order.id}`);
  await page.getByRole('link', { name: 'View all my orders' }).click();
  await expect(page).toHaveURL(/\/orders$/);
});

test('more than 20 orders are paged', { tag: '@ORD-002-AC12' }, async ({ page, request }) => {
  for (let i = 0; i < 21; i++) await placeOrder(request);
  await page.goto('/orders');

  const table = page.getByRole('table', { name: 'My orders' });
  await expect(table.getByRole('row')).toHaveCount(21); // header + 20 orders
  await expect(page.getByRole('link', { name: 'Next' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Previous' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/orders\?page=2$/);
  const previous = page.getByRole('link', { name: 'Previous' });
  await expect(previous).toBeVisible();
  await previous.click();
  await expect(page).toHaveURL(/\/orders\?page=1$/);
});

test('status filter shows only cancelled orders', { tag: ['@ORD-002-AC13', '@needs-test-hooks'] }, async ({ page, request }) => {
  await placeOrder(request);
  const cancelled = await placeOrder(request);
  const r = await request.post(`${API}/test/orders/${cancelled.id}/status`, {
    headers: apiHeaders(), data: { status: 'cancelled' },
  });
  expect(r.status()).toBe(200);

  await page.goto('/orders');
  const filter = page.getByLabel('Status');
  for (const option of ['All', 'Pending', 'Shipped', 'Cancelled']) {
    await expect(filter.getByRole('option', { name: option })).toHaveCount(1);
  }
  await filter.selectOption({ label: 'Cancelled' });

  await expect(page).toHaveURL(/\/orders\?status=cancelled$/);
  await expect(page.getByRole('link', { name: cancelled.id })).toBeVisible();
  for (const status of await page.getByTestId('order-status').all()) {
    await expect(status).toHaveText('Cancelled');
  }
});

test('no orders shows the empty state', { tag: '@ORD-002-AC14' }, async ({ page }) => {
  // `demo` always has orders from other tests, so the list call is stubbed (see spec).
  await page.route(/\/api\/orders(\?.*)?$/, (route) =>
    route.fulfill({ json: { orders: [], page: 1, page_size: 20, total: 0 } }),
  );
  await page.goto('/orders');

  await expect(page.getByText("You haven't placed any orders yet.")).toBeVisible();
  const browse = page.getByRole('link', { name: 'Browse products' });
  await expect(browse).toHaveAttribute('href', '/products');
  await expect(page.getByRole('table', { name: 'My orders' })).toHaveCount(0);
});
