"""API tests generated from specs/ORD-002-my-orders.md."""
import uuid

import pytest

MUG = "TEST-SKU-1"  # Blue Mug, 10.00


def new_user() -> dict:
    return {"X-User": f"ord002-{uuid.uuid4().hex[:10]}"}


def place(api, user: dict, items=None) -> dict:
    items = items or [{"sku": MUG, "quantity": 2}]
    r = api.post("/orders", json={"items": items}, headers=user)
    assert r.status_code == 201
    return r.json()


def set_status(api, order_id: str, status: str) -> None:
    r = api.post(f"/test/orders/{order_id}/status", json={"status": status})
    assert r.status_code == 200


@pytest.mark.ac("ORD-002-AC1")
def test_lists_own_orders_newest_first_with_summary_fields(api):
    user = new_user()
    a = place(api, user)
    b = place(api, user)

    r = api.get("/orders", headers=user)
    assert r.status_code == 200
    body = r.json()
    assert body["page"] == 1
    assert body["page_size"] == 20
    assert body["total"] == 2
    assert [o["id"] for o in body["orders"]] == [b["id"], a["id"]]
    for o in body["orders"]:
        assert o["created_at"].endswith(("Z", "+00:00"))
        assert o["status"] == "pending"
        assert o["total"] == pytest.approx(20.0)
        assert o["item_count"] == 2
        assert o["item_names"] == ["Blue Mug"]


@pytest.mark.ac("ORD-002-AC2")
def test_lists_only_callers_orders(api):
    user_a, user_b = new_user(), new_user()
    place(api, user_a)
    mine = place(api, user_b)

    r = api.get("/orders", headers=user_b)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert [o["id"] for o in body["orders"]] == [mine["id"]]


@pytest.mark.ac("ORD-002-AC3")
def test_new_user_gets_empty_list(api):
    r = api.get("/orders", headers=new_user())
    assert r.status_code == 200
    body = r.json()
    assert body["orders"] == []
    assert body["total"] == 0


@pytest.mark.ac("ORD-002-AC4")
def test_pages_of_20_newest_first(api):
    user = new_user()
    ids = [place(api, user)["id"] for _ in range(21)]
    newest_first = list(reversed(ids))

    p1 = api.get("/orders", params={"page": 1}, headers=user)
    p2 = api.get("/orders", params={"page": 2}, headers=user)
    p3 = api.get("/orders", params={"page": 3}, headers=user)
    assert p1.status_code == p2.status_code == p3.status_code == 200
    assert p1.json()["total"] == 21
    assert p2.json()["total"] == 21
    assert [o["id"] for o in p1.json()["orders"]] == newest_first[:20]
    assert [o["id"] for o in p2.json()["orders"]] == [ids[0]]
    assert p3.json()["orders"] == []


@pytest.mark.ac("ORD-002-AC5")
@pytest.mark.parametrize("page", ["0", "abc"])
def test_rejects_invalid_page(api, page):
    r = api.get("/orders", params={"page": page}, headers=new_user())
    assert r.status_code == 422
    body = r.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert "page" in [e["field"] for e in body["errors"]]


@pytest.mark.ac("ORD-002-AC6")
@pytest.mark.needs_test_hooks
def test_filters_by_status(api):
    user = new_user()
    place(api, user)
    cancelled = place(api, user)
    set_status(api, cancelled["id"], "cancelled")

    r = api.get("/orders", params={"status": "cancelled"}, headers=user)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert [o["id"] for o in body["orders"]] == [cancelled["id"]]


@pytest.mark.ac("ORD-002-AC7")
@pytest.mark.needs_test_hooks
def test_unfiltered_list_includes_cancelled(api):
    user = new_user()
    pending = place(api, user)
    cancelled = place(api, user)
    set_status(api, cancelled["id"], "cancelled")

    r = api.get("/orders", headers=user)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    statuses = {o["id"]: o["status"] for o in body["orders"]}
    assert statuses == {pending["id"]: "pending", cancelled["id"]: "cancelled"}


@pytest.mark.ac("ORD-002-AC8")
def test_rejects_unknown_status(api):
    r = api.get("/orders", params={"status": "lost"}, headers=new_user())
    assert r.status_code == 422
    assert r.json()["code"] == "INVALID_STATUS"
