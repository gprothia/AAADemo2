---
id: ORD-002
title: My orders page
status: implemented
owner: "@gprothia"
issue: "#3"
ui_routes: ["/orders"]
---

# ORD-002: My orders page

## Why
Customers can only see an order on the confirmation page they land on right after placing it.
If they lose that link they cannot check what they bought, what it cost or its status. They
want a "My orders" page that lists all their own orders and leads to each order's details.

## Scope
- In: an API listing the caller's own orders (newest first, 20 per page, optional status
  filter); a `created_at` time on every order; a `/orders` page with that list, paging, a
  status filter and an empty state; a "My orders" link in the site header and on the order
  confirmation page; a test-only endpoint to set an order's status.
- Out: search by text; filters other than status; cancelling or changing orders (customers
  can't yet cancel, see Open questions); changes to the order details page beyond the new link.

## Acceptance criteria

### ORD-002-AC1 [api]
- **Given** a user who created order A and then order B, each with 2 × `TEST-SKU-1`
- **When** the client sends `GET /orders` as that user (`X-User`)
- **Then** the response is `200` with `page: 1`, `page_size: 20`, `total: 2` and `orders`
  listing B first, then A. Each order has `id`, `created_at` (an ISO 8601 UTC timestamp),
  `status: "pending"`, `total: 20.0`, `item_count: 2` and `item_names: ["Blue Mug"]`

### ORD-002-AC2 [api]
- **Given** user `a` has one order and user `b` has one order
- **When** the client sends `GET /orders` as user `b`
- **Then** the response is `200` with `total: 1`, and `orders` contains only user `b`'s order

### ORD-002-AC3 [api]
- **Given** a user who has never placed an order
- **When** the client sends `GET /orders` as that user
- **Then** the response is `200` with `orders: []` and `total: 0`

### ORD-002-AC4 [api]
- **Given** a user with 21 orders
- **When** the client sends `GET /orders?page=1` and then `GET /orders?page=2` as that user
- **Then** both responses are `200` with `total: 21`. Page 1 has the 20 newest orders,
  newest first. Page 2 has 1 order, the oldest one. `GET /orders?page=3` returns `200` with
  `orders: []`

### ORD-002-AC5 [api]
- **Given** any user
- **When** the client sends `GET /orders?page=0` or `GET /orders?page=abc`
- **Then** the response is `422` with code `VALIDATION_ERROR` and the error names the field `page`

### ORD-002-AC6 [api]
- **Given** a user with one `pending` order and one order set to `cancelled` through the
  test endpoint
- **When** the client sends `GET /orders?status=cancelled` as that user
- **Then** the response is `200` with `total: 1` and `orders` contains only the cancelled order

### ORD-002-AC7 [api]
- **Given** a user with one `pending` order and one `cancelled` order
- **When** the client sends `GET /orders` (no filter) as that user
- **Then** the response is `200` with `total: 2` and both orders are listed, with their statuses

### ORD-002-AC8 [api]
- **Given** any user
- **When** the client sends `GET /orders?status=lost`
- **Then** the response is `422` with code `INVALID_STATUS`

### ORD-002-AC9 [ui]
- **Given** the user has just placed an order for 2 × `TEST-SKU-1` and 1 × `TEST-SKU-2`
- **When** they open `/orders`
- **Then** they see the heading "My orders" and a table labelled "My orders" with columns
  Date, Status, Items, Products and Total. That order's row shows today's date in the form
  "Nov 15, 2026", "Pending", "3", "Blue Mug, Notebook" and "$24.50"

### ORD-002-AC10 [ui]
- **Given** an order in the "My orders" table
- **When** the user clicks the link with the order's id in its row
- **Then** they land on `/orders/{id}` for that order

### ORD-002-AC11 [ui]
- **Given** a user on `/products`
- **When** they click **My orders** in the site header
- **Then** they land on `/orders`. The order confirmation page `/orders/{id}` also has a
  **View all my orders** link to `/orders`

### ORD-002-AC12 [ui]
- **Given** the user has more than 20 orders
- **When** they open `/orders`
- **Then** the table has 20 rows, there is a **Next** link and no **Previous** link. Clicking
  **Next** opens `/orders?page=2`, which has a **Previous** link back to `/orders?page=1`

### ORD-002-AC13 [ui]
- **Given** the user has a `pending` order and a `cancelled` order
- **When** they pick "Cancelled" in the **Status** filter (options: All, Pending, Shipped,
  Cancelled) on `/orders`
- **Then** the URL becomes `/orders?status=cancelled` and every row shows "Cancelled"

### ORD-002-AC14 [ui]
- **Given** a user who has never placed an order
- **When** they open `/orders`
- **Then** they see "You haven't placed any orders yet." and a **Browse products** link to
  `/products`, and no table

## Edge cases & errors
- A filter with no matching orders → `200` with `orders: []`. The page shows
  "No orders match this filter."
- `page` and `status` together: the filter is applied first, then paging (`total` counts the
  filtered orders).
- Orders created in the same instant keep their creation order (the later one comes first).
- `POST /test/orders/{id}/status` with body `{"status": "<status>"}` sets an order's status.
  It is registered only when `ENABLE_TEST_HOOKS=true` and hidden from the API schema. An
  unknown order → `404` `ORDER_NOT_FOUND`; an unknown status → `422` `INVALID_STATUS`.
- `item_names`: each product name once, in the order the line items were added.
- `created_at` is also returned by `POST /orders` and `GET /orders/{id}`.

## Test data
Seeded products: `TEST-SKU-1` Blue Mug $10.00, `TEST-SKU-2` Notebook $4.50.
API tests use a unique `X-User` per test (e.g. `ord002-<uuid>`) so lists don't overlap when
tests run in parallel. Tests for AC6, AC7 and AC13 use the test endpoint, so they are marked
`needs_test_hooks` / `@needs-test-hooks`.
The web app has a single user, `demo`. The AC14 UI test stubs `/api/orders` in the browser
with an empty list instead of relying on `demo` having no orders.

## Open questions
- [x] Sort order? → Newest first (#3)
- [x] Paging? → 20 orders per page (#3)
- [x] What each row shows? → Date, status, total, number of items, item names (#3)
- [x] Filter or search? → Filter by status only (#3)
- [x] Where is the page linked from? → Both the site header and the order confirmation page (#3)
- [x] Show cancelled orders? → Yes (#3)
- [x] Which statuses can be filtered on? → All, Pending, Shipped, Cancelled
- [x] "Number of items"? → Total quantity (2 mugs + 1 notebook = 3)
- [x] Date format and time zone? → "Nov 15, 2026", in UTC
- [x] Empty-state wording? → "You haven't placed any orders yet." with a **Browse products**
  link; for a filter with no matches, "No orders match this filter."
- [x] How many product names? → Show them all
- [x] Let UI tests act as a fresh user? → No. The web app keeps a single user, `demo`
- [x] How is AC14 (empty state) tested in the UI when `demo` always has orders? → The
  `/orders` page loads its list in the browser from `/api/orders`; the AC14 test stubs that
  call with an empty list (Playwright `page.route`)
