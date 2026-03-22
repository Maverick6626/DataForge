"""DataForge API — entry point."""
import logging
import os
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response

from core.config import SESSIONS
from core.models import HAS_XGB, HAS_LGB, HAS_CAT
from routers import data as data_router
from routers import train as train_router
from routers import predict as predict_router

# ── Logging setup ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
# Silence uvicorn's built-in access log — our middleware already logs every request
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

logger = logging.getLogger("dataforge")
logger.info(
    "DataForge starting — xgboost=%s lightgbm=%s catboost=%s",
    HAS_XGB, HAS_LGB, HAS_CAT,
)

app = FastAPI(title="DataForge API", version="3.0.0")


# ── Request logging middleware ─────────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s → %d  (%.1f ms)",
        request.method, request.url.path, response.status_code, elapsed_ms,
    )
    return response

app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

app.include_router(data_router.router)
app.include_router(train_router.router)
app.include_router(predict_router.router)

# ── Frontend static assets ─────────────────────────────────────────────────────
_FRONTEND = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
if os.path.isdir(_FRONTEND):
    app.mount("/css", StaticFiles(directory=os.path.join(_FRONTEND, "css")), name="css")
    app.mount("/js",  StaticFiles(directory=os.path.join(_FRONTEND, "js")),  name="js")

    @app.get("/")
    def root():
        return FileResponse(os.path.join(_FRONTEND, "index.html"))

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon():
        ico = os.path.join(_FRONTEND, "favicon.ico")
        if os.path.isfile(ico):
            return FileResponse(ico)
        # Return a minimal empty 1x1 transparent ICO rather than crashing
        return Response(
            content=b"\x00\x00\x01\x00\x01\x00\x01\x01\x00\x00\x01\x00"
                    b"\x18\x00\x28\x00\x00\x00\x16\x00\x00\x00",
            media_type="image/x-icon",
        )


@app.get("/health")
def health():
    return {"status": "ok", "sessions": len(SESSIONS),
            "xgboost": HAS_XGB, "lightgbm": HAS_LGB, "catboost": HAS_CAT}


@app.get("/sessions")
def list_sessions():
    out = []
    for sid, sess in SESSIONS.items():
        df = sess.get("df")
        out.append({
            "session_id":  sid,
            "name":        sess.get("name", sid),
            "n_rows":      int(df.shape[0]) if df is not None else 0,
            "n_cols":      int(df.shape[1]) if df is not None else 0,
            "best_model":  sess.get("best_model"),
            "task":        sess.get("task"),
            "deployments": list(sess.get("deployments", {}).keys()),
        })
    return {"sessions": out}
