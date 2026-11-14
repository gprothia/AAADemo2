# AGENTS.md: the one rulebook for coding agents

Antigravity, Claude Code, Gemini CLI and other agents read this file first. Every rule for
this repo is here, once. The two saved commands in `.agents/workflows/` only list steps;
when they say "follow the rules", they mean this file.

## The cycle

```
feature request (GitHub issue, plain language)
  → spec (specs/*.md, approved by a person)          /write-spec #<issue>
  → tests → code → local run
  → GKE sandbox: stage the app as pods, run ALL tests (new + regression)
  → evidence posted to GitHub → pull request          /build-spec specs/<file>
  → CI re-checks independently → a person reviews and merges
```

## Never
- Commit to `main`, merge, approve, force-push, or delete branches you didn't create.
- Change a spec's acceptance criteria, or weaken a test, to make something pass.
- Take a business decision the issue doesn't contain. Ask, or list it as an open question.
- Overwrite a GitHub issue's description. Add a comment instead.
- Post an issue, comment or PR before showing the user its text.
- Open a PR without a green GKE sandbox run for the exact commit being proposed.

---

## 1. Feature requests (GitHub issues)

A feature request says **what someone wants and why**, in plain words. It is not a spec.
- Use the "Feature request" form's sections (`.github/ISSUE_TEMPLATE/feature-request.yml`):
  `### Why`, `### Who`, `### What they want`, `### Example`, `### Open questions`.
- No Given/When/Then, no rule IDs, no status codes. Those belong in the spec.
- Title `[Request] <plain description>`, label `request`.
- Agents: draft to `.tmp/feature-request.md`, show the user, then
  `gh issue create --title ... --label request --body-file .tmp/feature-request.md`.

## 2. Specs

The spec is the agreement and the source of truth. `scripts/check_spec.py` enforces the
mechanical rules; CI runs it on every PR.

**File and header**
- `specs/<ID>-<short-kebab-name>.md`, e.g. `specs/ORD-002-cancel-order.md`. Copy
  `specs/_TEMPLATE.md` and keep every section.
- IDs: area prefix + 3 digits (`CAT-`, `ORD-`, …). Next free number in the area; never reuse one.
- Front matter `id` (matches the file name), `title`, `status`, `owner` (`@handle`),
  `issue` (`"#<n>"`). Heading `# <ID>: <title>`.

**Status**
- `draft` while questions are open. `approved` only when a person says so.
  `implemented` in the PR that ships it.
- `approved`/`implemented` specs have no unticked `- [ ]` questions. A ticked question
  carries its answer: `- [x] Dialog? → Yes (#6)`.

**Acceptance criteria**
- `### <ID>-AC<n> [api]`, `[ui]` or `[api,ui]`. Numbered from 1, unique, never renumbered;
  retire with `### ~~<ID>-AC<n> [tag]~~`.
- **Given** and **Then** (and **When** if there's an action). Every Then is checkable:
  exact status codes, error codes, field names, visible text, URLs. Tolerances are written
  in the spec ("within 2 seconds"), not only in tests.
- Decisions come from the issue and its comments only. When the spec is written, comment on
  the issue with a link to it and a summary of the decisions.

## 3. Tests

- API: `tests/api/test_<id-lower>.py`, pytest + httpx, each test
  `@pytest.mark.ac("<AC-ID>")`, using the `api` fixture from `tests/api/conftest.py`.
- UI: `tests/ui/<id-lower>.spec.ts`, Playwright, each test `{ tag: '@<AC-ID>' }`.
- Every non-retired criterion has at least one test per tag. Given/When/Then maps to
  arrange/act/assert. Assert the exact values the spec names.
- Base URLs from `API_BASE_URL` / `WEB_BASE_URL` only. Tests create their own data, run in
  any order and in parallel, and never call real third-party services.
- Playwright: `getByRole` / `getByLabel` / `getByTestId`; no CSS paths, no fixed sleeps.
- The **whole** suite is the regression suite: every run executes all tests, old and new.

## 4. The app

- `services/api`: FastAPI. In-memory storage, seeded at start (`SEED_TEST_DATA=true`).
  Errors are JSON `{"code": "...", "message": "..."}`. The caller is the `X-User` header
  (demo stand-in for real login).
- **Test-only endpoints** (e.g. forcing an order to `shipped`) go under `/test/...`, are
  registered only `if TEST_HOOKS:` (env `ENABLE_TEST_HOOKS`, **off by default**), and are
  hidden from the API schema. Only `deploy/app/api.yaml` (sandboxes) turns them on.
- `services/web`: FastAPI-rendered pages; browser calls go to `/api/*`, proxied to the API.

## 5. Delivery

**Branches and commits**
- `feat/<id-lower>-<short-name>` from an up-to-date `main`. Commit messages
  `<ID>: <what changed>`. Spec, tests and code for one spec travel together.

**Gates before a PR, in order**
1. `python scripts/check_spec.py` and `python scripts/check_traceability.py` pass.
2. Local run: both suites green against the app on this machine.
3. Commit everything (the sandbox refuses uncommitted changes, so the evidence matches a commit).
4. `scripts/sandbox.sh all`: Cloud Build images → app staged as pods in `dev-<branch>` on
   GKE → test pod runs **all** tests → reports in `reports/<namespace>/`. Must be green.
5. `git push -u origin HEAD`, open the PR, then `scripts/sandbox.sh publish`: posts the
   result as a commit status and a PR comment listing every test with its criterion.
6. `scripts/sandbox.sh down`.

**Pull request**
- `gh pr create --base main` with a body following `.github/pull_request_template.md`:
  spec link, `Closes #<issue>`, criteria covered, the sandbox result line.
- Print the PR URL. A person reviews: spec diff, then tests, then code.
