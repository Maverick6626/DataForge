# DataForge — Local

## Quick start (Docker)

```bash
docker compose up --build
```

Then open **http://localhost:8000**

API docs at **http://localhost:8000/docs**

## Dev mode (hot reload)

```bash
docker compose --profile dev up dataforge-dev --build
```

## Without Docker (Python directly)

```bash
cd backend
pip install -r requirements.txt
pip install xgboost lightgbm  # optional boosters
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Then open **http://localhost:8000**
