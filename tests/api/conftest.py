import os

import httpx
import pytest


def pytest_configure(config):
    config.addinivalue_line("markers", "ac(id): acceptance criterion this test verifies")
    config.addinivalue_line(
        "markers",
        "needs_test_hooks: uses /test/... endpoints; skipped in UAT, where test hooks are off",
    )


@pytest.fixture(scope="session")
def api():
    base = os.environ.get("API_BASE_URL", "http://localhost:8080")
    # UAT on Cloud Run: the API is private, so CI passes an identity token.
    token = os.environ.get("API_AUTH_TOKEN")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    with httpx.Client(base_url=base, timeout=15, headers=headers) as client:
        yield client


def pytest_collection_modifyitems(items):
    # Put the AC ID into the JUnit report so failures map straight back to the spec.
    for item in items:
        for mark in item.iter_markers("ac"):
            item.user_properties.append(("acceptance_criterion", mark.args[0]))
