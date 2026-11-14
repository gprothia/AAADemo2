# AAADemo2: spec-driven development with Antigravity and GKE

A small online store, built and extended the spec-driven way. An agent (Antigravity, Claude
Code, …) turns an agreed spec into tests and code, **stages the app as pods on GKE and runs
the full regression suite before any pull request exists**, then posts the evidence to GitHub.

```
Feature request (issue)  →  /write-spec #<n>  →  spec approved by a person
                         →  /build-spec specs/<file>:
                              tests (fail) → code (pass) → commit
                              → GKE: app as pods in dev-<branch>, ALL tests in a test pod
                              → push → PR → evidence on the PR (status + per-test table)
                         →  CI re-checks independently  →  a person merges
```

## What's where

| Path | Purpose |
|---|---|
| `AGENTS.md` | **The one rulebook** every agent follows: requests, specs, tests, app conventions, delivery |
| `.agents/workflows/` | Two saved Antigravity commands: `/write-spec`, `/build-spec` (`.agent` is an alias) |
| `specs/` | What the app must do. `_TEMPLATE.md` is the blank form; one file per feature |
| `services/api`, `services/web` | The app: FastAPI back end and server-rendered storefront |
| `tests/api`, `tests/ui` | pytest and Playwright suites; every test tagged with its spec rule ID. The whole suite is the regression suite |
| `deploy/app` | How the app runs on GKE (API + web pods) |
| `deploy/sandbox` | Per-branch / per-PR namespace, test-runner pod, your GCP settings (`sandbox.env`) |
| `scripts/check_spec.py` | Spec format checker |
| `scripts/check_traceability.py` | Every approved rule has a test |
| `scripts/sandbox.sh` (+ `sandbox_report.py`) | Pre-PR GKE run: build → stage → test → report → publish to GitHub |
| `.github/workflows/pr-checks.yml` | CI on every PR: spec format + coverage, Gemini review, build, PR sandbox |
| `.github/workflows/cleanup.yml` | Deletes sandboxes: on PR close, and stale ones every 6 h |
| `.github/ISSUE_TEMPLATE/` | Plain-language **Feature request** form (blank issues off) |

## The app today

| Feature | Spec | Status |
|---|---|---|
| Browse the product catalog | `specs/CAT-001-browse-catalog.md` | implemented |
| Create an order | `specs/ORD-001-create-order.md` | implemented |

## Running a feature cycle in Antigravity

1. **Request**: open an issue with the *Feature request* form (plain words: why, who, what, example).
   Discuss open questions in comments.
2. **Spec**: `/write-spec #<issue>`. Antigravity drafts `specs/<ID>-....md` on a new branch, runs the
   checker and asks the open questions. You approve it.
3. **Build**: `/build-spec specs/<file>`. You approve the plan. Antigravity writes failing tests, builds
   the feature until every test passes, commits, then runs `scripts/sandbox.sh all`:
   - Cloud Build packages this commit's images,
   - the app is staged as pods in `dev-<branch>` on GKE,
   - a test pod runs **all** tests, new and regression,
   - it prints e.g. `Sandbox result: PASSED - 20/20 tests passed`.
4. **PR**: it pushes, opens the PR and runs `scripts/sandbox.sh publish`. The PR gets a
   **"GKE sandbox (pre-PR)"** commit status and a comment listing every test with its rule.
   The evidence is tied to the exact commit; a new push makes it stale until re-run.
5. **Review and merge**: CI repeats the checks independently. Review the spec diff, then tests, then code.

Laptop prerequisites: `git`, `gh` (`gh auth login`), `gcloud` (`gcloud auth login`), `kubectl`
(`gcloud components install kubectl gke-gcloud-auth-plugin`), Python 3.12, Node 22.

## Run locally

```bash
pip install -r services/web/requirements.txt -r tests/requirements.txt
(cd services/api && ENABLE_TEST_HOOKS=true uvicorn app:app --port 8080 &)
(cd services/web && API_URL=http://localhost:8080 uvicorn app:app --port 3000 &)
API_BASE_URL=http://localhost:8080 pytest tests/api -q
cd tests/ui && npm install && npx playwright install chromium \
  && WEB_BASE_URL=http://localhost:3000 API_BASE_URL=http://localhost:8080 npx playwright test
```

## Google Cloud setup

`deploy/sandbox/sandbox.env` points at project `bold-kit-384717`, region `us-central1`,
cluster `pr-sandboxes` and Artifact Registry repo `pr-sandbox` (already created for AAADemo,
reused here). Your laptop needs Cloud Build and GKE access to that project.

To let **CI** run its own GKE check as well, connect GitHub to Google Cloud once:

```bash
PROJECT_ID=bold-kit-384717; REGION=us-central1; GH_REPO=gprothia/AAADemo2
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com aiplatform.googleapis.com --project $PROJECT_ID

gcloud iam service-accounts create gh-pr-sandbox --project $PROJECT_ID
SA=gh-pr-sandbox@$PROJECT_ID.iam.gserviceaccount.com
for role in roles/container.developer roles/artifactregistry.writer roles/aiplatform.user; do
  gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA" --role=$role
done

gcloud iam workload-identity-pools create github --location=global --project $PROJECT_ID
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github --project $PROJECT_ID \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='$GH_REPO'"
gcloud iam service-accounts add-iam-policy-binding $SA --project $PROJECT_ID \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$GH_REPO"
```

Then set these **repository variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | `bold-kit-384717` |
| `GCP_REGION` | `us-central1` |
| `GKE_CLUSTER` | `pr-sandboxes` |
| `AR_REPO` | `pr-sandbox` |
| `WIF_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/github` |
| `CI_SERVICE_ACCOUNT` | `gh-pr-sandbox@bold-kit-384717.iam.gserviceaccount.com` |

Until they're set, CI runs only the spec-format and coverage checks; the GKE evidence comes
from the pre-PR run. Then, in **Settings → Branches**, protect `main`: require a PR, the
`traceability` check and the `GKE sandbox (pre-PR)` status.

## Known limits (demo)
- No real login: the API trusts an `X-User` header.
- Storage is in memory; nothing is deployed permanently after merge.
