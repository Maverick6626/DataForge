"""DataForge API — entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import SESSIONS
from core.models import HAS_XGB, HAS_LGB, HAS_CAT
from routers import data as data_router
from routers import train as train_router
from routers import predict as predict_router

app = FastAPI(title="DataForge API", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

app.include_router(data_router.router)
app.include_router(train_router.router)
app.include_router(predict_router.router)


@app.get("/health")
def health():
    return {"status": "ok", "sessions": len(SESSIONS),
            "xgboost": HAS_XGB, "lightgbm": HAS_LGB, "catboost": HAS_CAT}


@app.get("/sessions")
def list_sessions():
    out = []
    for sid, sess in SESSIONS.items():
        df = sess.get("df")
        out.append({"session_id": sid, "name": sess.get("name", sid),
                    "n_rows": int(df.shape[0]) if df is not None else 0,
                    "n_cols": int(df.shape[1]) if df is not None else 0,
                    "best_model": sess.get("best_model"), "task": sess.get("task"),
                    "deployments": list(sess.get("deployments", {}).keys())})
    return {"sessions": out}
