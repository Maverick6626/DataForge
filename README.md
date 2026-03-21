# DataForge

AutoML platform for regression and classification.
Runs entirely in Docker — no Python or Node.js required on your machine.

---

## Requirements

- **Docker Desktop** — download and install from https://www.docker.com/products/docker-desktop/
- That is all. Docker bundles everything else.

Tested on Windows 10/11, macOS, and Linux.

---

## Quick Start

Open a terminal (Command Prompt, PowerShell, or Terminal) in the project folder and run:

```
docker compose up --build
```

Then open your browser at:

```
http://localhost:8000
```

The first build takes 3–5 minutes while Docker downloads Python and installs packages.
Every subsequent start takes a few seconds.

Alternatively, Windows users can simply double-click the start.bat file to run the application

---

## Daily Use

**Start:**
```
docker compose up
```

**Start in background (no terminal window):**
```
docker compose up -d
```

**Stop:**
```
docker compose down
```

**View logs:**
```
docker compose logs -f
```

---

## After Changing Source Files

If you edit backend Python or frontend HTML/JS/CSS, rebuild the image:

```
docker compose up --build
```

To skip the rebuild and mount files live instead (useful during development):

```
docker compose --profile dev up dataforge-dev
```

This mounts `./backend` and `./frontend` directly into the container so your changes
are reflected immediately without rebuilding.

---

## URLs

| URL | Description |
|-----|-------------|
| http://localhost:8000 | Main application |
| http://localhost:8000/docs | Interactive API documentation |
| http://localhost:8000/health | API health check (JSON) |

---

## Project Structure

```
dataforge/
├── frontend/
│   ├── index.html              App shell — 9-step pipeline
│   ├── css/
│   │   └── style.css           Design system (dark amber theme)
│   └── js/
│       ├── state.js            Shared state and model lists
│       ├── utils.js            Toast, navigation, chart helpers
│       ├── import.js           Step 1 — Upload / paste / sample datasets
│       ├── eda.js              Step 3 — EDA, risks, drill-down, comparisons
│       ├── pipeline.js         Steps 2, 4, 5, 6 — Clean, Features, Models, Train
│       ├── results.js          Steps 7, 8 — Results and Predict
│       └── deploy.js           Step 9 — Deployments
├── backend/
│   ├── main.py                 FastAPI entry point (also serves frontend)
│   ├── requirements.txt        Core Python dependencies
│   ├── requirements-boosters.txt  XGBoost, LightGBM, CatBoost (optional)
│   ├── core/
│   │   ├── config.py           In-memory session store
│   │   ├── data.py             EDA, profiling, task detection, risk checks
│   │   └── models.py           Model registry, preprocessing, metrics
│   └── routers/
│       ├── data.py             /upload /sample /clean /eda/* endpoints
│       ├── train.py            /train/stream  (SSE live streaming)
│       └── predict.py          /predict /batch /download /deploy/* endpoints
├── Dockerfile                  Two-stage build (uv + python:3.11-slim)
├── docker-compose.yml          Production and dev profiles
├── .dockerignore               Build context exclusions
└── README.md
```

---

## Pipeline (9 Steps)

| Step | Page | What it does |
|------|------|--------------|
| 1 | Import | Upload CSV, paste data, or load a sample dataset |
| 2 | Clean | Impute missing values, remove outliers, drop bad columns |
| 3 | Explore | EDA: overview, risks, column inspector, 2-column comparisons, correlations |
| 4 | Features | Choose target column, select input features, configure preprocessing |
| 5 | Models | AutoSelect all models, or hand-pick which algorithms to train |
| 6 | Train | Live streaming console — watch models train in real time |
| 7 | Results | Leaderboard, score charts, feature importance, download model or dataset |
| 8 | Predict | Manual form or batch CSV prediction using any trained model |
| 9 | Deploy | Named deployments with custom titles — open as standalone page or use inline |

---

## Models

**Classification** (sklearn + optional boosters):
Logistic Regression, Decision Tree, Random Forest, Extra Trees, Gradient Boosting,
AdaBoost, SVM, K-Nearest Neighbors, Naive Bayes, XGBoost, LightGBM, CatBoost

**Regression** (sklearn + optional boosters):
Linear Regression, Ridge, Lasso, ElasticNet, Decision Tree, Random Forest,
Extra Trees, Gradient Boosting, AdaBoost, SVR, K-Nearest Neighbors,
XGBoost, LightGBM, CatBoost

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | API status and available library versions |
| GET | `/sessions` | List all active sessions |
| POST | `/upload` | Upload a CSV file |
| POST | `/sample/{name}` | Load a built-in sample dataset |
| POST | `/clean` | Apply the cleaning pipeline |
| POST | `/eda` | Dataset-level statistics and risks |
| POST | `/eda/column` | Single-column profile (histogram, stats, value counts) |
| POST | `/eda/compare` | Two-column comparison (scatter, group means, crosstab) |
| POST | `/eda/detect_task` | Detect regression vs classification for a target column |
| POST | `/train/stream` | Train models with live SSE log streaming |
| POST | `/predict` | Single manual prediction |
| POST | `/predict/batch` | Batch prediction from a CSV file |
| GET | `/dataset/download/{session_id}` | Download cleaned dataset as CSV |
| GET | `/model/download/{session_id}` | Download trained model as .joblib |
| POST | `/deploy` | Create a named deployment |
| GET | `/deploy/{session_id}` | List deployments for a session |
| DELETE | `/deploy/{session_id}/{name}` | Delete a deployment |
| POST | `/deploy/{session_id}/{name}/predict` | Run prediction via a named deployment |

---

## Troubleshooting

**Port 8000 already in use**
Something else is running on port 8000. Either stop it, or change the port in
`docker-compose.yml` — replace `"8000:8000"` with e.g. `"8080:8000"` — then
access the app at `http://localhost:8080`.

**Docker Desktop is not running**
Start Docker Desktop from the Start Menu. The whale icon should appear in the
system tray before running `docker compose up`.

**Build fails with network errors**
Docker could not reach the internet to download packages. Check your connection,
disable any VPN or proxy temporarily, and retry.

**Frontend shows "API Offline"**
Open the app via `http://localhost:8000` rather than by opening `index.html`
directly from disk. When opened from disk, the browser uses `file://` which
has no port, so the relative URL fallback kicks in — but the API is only
reachable at `localhost:8000`, which means you need to use the HTTP URL.
