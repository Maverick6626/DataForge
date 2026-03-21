"""Prediction, model download, and deployment endpoints."""
import io
import os
import time
import uuid
from typing import Any, Dict, List, Optional

import joblib
import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from core.config import DEPLOY_DIR, SESSIONS

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────
def _get_pipe(sess: dict, model_name: Optional[str]):
    name = model_name or sess.get("best_model")
    if not name:
        raise HTTPException(400, "No model trained")
    pipe = sess.get(f"pipe_{name}")
    if not pipe:
        raise HTTPException(400, f"Model '{name}' not found in session")
    return name, pipe


def _predict(sess: dict, pipe, df_in: pd.DataFrame, name: str) -> dict:
    preds = pipe.predict(df_in)
    le    = sess.get("label_encoder")
    if le:
        preds = le.inverse_transform(preds.astype(int))
    result = {"model": name, "predictions": preds.tolist()}
    if sess.get("task") == "classification" and hasattr(pipe, "predict_proba"):
        try:
            probs   = pipe.predict_proba(df_in)
            classes = le.classes_.tolist() if le else list(range(probs.shape[1]))
            result["probabilities"] = [
                dict(zip(map(str, classes), r.tolist())) for r in probs
            ]
        except Exception:
            pass
    return result


# ── Predict (single / manual) ──────────────────────────────────────────────────
class PredReq(BaseModel):
    session_id: str
    data: List[Dict[str, Any]]
    model_name: Optional[str] = None


@router.post("/predict")
def predict(req: PredReq):
    sess = SESSIONS.get(req.session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    name, pipe = _get_pipe(sess, req.model_name)
    df_in = pd.DataFrame(req.data)[sess["features"]]
    return _predict(sess, pipe, df_in, name)


# ── Batch predict ──────────────────────────────────────────────────────────────
@router.post("/predict/batch")
async def predict_batch(
    file: UploadFile = File(...),
    session_id: str  = Form(...),
    model_name: str  = Form(None),
):
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    name, pipe = _get_pipe(sess, model_name or None)
    content = await file.read()
    df_in   = pd.read_csv(io.BytesIO(content))
    missing = [f for f in sess["features"] if f not in df_in.columns]
    if missing:
        raise HTTPException(400, f"Missing columns: {missing}")
    result  = _predict(sess, pipe, df_in[sess["features"]], name)
    result["n"] = len(result["predictions"])
    return result


# ── Model download ─────────────────────────────────────────────────────────────
@router.get("/model/download/{session_id}")
def download_model(session_id: str, model_name: str = None):
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    name, pipe = _get_pipe(sess, model_name)
    path = os.path.join(DEPLOY_DIR, f"{session_id}_{name.replace(' ', '_')}.joblib")
    bundle = {
        "model_name":    name,
        "session_id":    session_id,
        "task":          sess.get("task"),
        "features":      sess.get("features"),
        "target":        sess.get("target"),
        "label_encoder": sess.get("label_encoder"),
        "pipeline":      pipe,
        "metrics":       next(
            (r["metrics"] for r in (sess.get("results") or []) if r["model"] == name), {}
        ),
    }
    joblib.dump(bundle, path)
    return FileResponse(
        path,
        filename=f"dataforge_{name.replace(' ', '_')}_{session_id}.joblib",
        media_type="application/octet-stream",
    )


# ── Deploy ─────────────────────────────────────────────────────────────────────
class DeployReq(BaseModel):
    session_id: str
    deploy_name: str
    model_name: Optional[str] = None
    page_title: str = "ML Model"
    page_heading: str = "Predict"
    description: str = ""


@router.post("/deploy")
def create_deploy(req: DeployReq):
    sess = SESSIONS.get(req.session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    name, pipe = _get_pipe(sess, req.model_name)
    df   = sess.get("df", pd.DataFrame())
    dep  = {
        "deploy_id":    uuid.uuid4().hex[:6],
        "deploy_name":  req.deploy_name,
        "model_name":   name,
        "task":         sess.get("task"),
        "features":     sess.get("features"),
        "dtypes":       {f: str(df[f].dtype) for f in (sess.get("features") or []) if f in df.columns},
        "target":       sess.get("target"),
        "page_title":   req.page_title,
        "page_heading": req.page_heading,
        "description":  req.description,
        "metrics":      next(
            (r["metrics"] for r in (sess.get("results") or []) if r["model"] == name), {}
        ),
        "created_at":   time.strftime("%Y-%m-%d %H:%M"),
    }
    sess.setdefault("deployments", {})[req.deploy_name] = dep
    return {"deploy_id": dep["deploy_id"], "deploy_name": req.deploy_name,
            "session_id": req.session_id}


@router.get("/deploy/{session_id}")
def list_deploys(session_id: str):
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    return {"deployments": list(sess.get("deployments", {}).values())}


@router.post("/deploy/{session_id}/{deploy_name}/predict")
def deploy_predict(session_id: str, deploy_name: str, req: PredReq):
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    dep = sess.get("deployments", {}).get(deploy_name)
    if not dep:
        raise HTTPException(404, f"Deployment '{deploy_name}' not found")
    req.session_id  = session_id
    req.model_name  = dep["model_name"]
    return predict(req)


@router.get("/dataset/download/{session_id}")
def download_dataset(session_id: str):
    """Download the cleaned (processed) dataset as CSV."""
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    df = sess.get("df")
    if df is None or df.empty:
        raise HTTPException(400, "No dataset in session")
    import io as _io
    buf = _io.StringIO()
    df.to_csv(buf, index=False)
    from fastapi.responses import Response
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=cleaned_{session_id}.csv"},
    )


@router.delete("/deploy/{session_id}/{deploy_name}")
def delete_deploy(session_id: str, deploy_name: str):
    """Delete a named deployment."""
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    deps = sess.get("deployments", {})
    if deploy_name not in deps:
        raise HTTPException(404, f"Deployment '{deploy_name}' not found")
    del deps[deploy_name]
    return {"deleted": deploy_name}
