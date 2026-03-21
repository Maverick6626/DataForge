"""Training endpoint (SSE streaming)."""
import asyncio
import json
import time
import traceback
from typing import List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder

from core.config import SESSIONS
from core.data import resolve_task
from core.models import (
    build_search, compute_metrics, extract_feature_importance,
    get_models, make_preprocessor, resolve_scoring,
)

router = APIRouter()


class TrainReq(BaseModel):
    session_id: str
    target: str
    features: List[str]
    task_type: str = "auto"
    scaling: str = "standard"
    encoding: str = "onehot"
    test_size: float = 0.2
    random_seed: int = 42
    model_mode: str = "auto"
    selected_models: List[str] = []
    tuning: str = "default"
    tuning_n: int = 30
    scoring: str = "auto"
    cv_folds: str = "none"
    n_jobs: int = -1


@router.post("/train/stream")
async def train_stream(req: TrainReq):
    if req.session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")

    async def gen():
        def ev(t, **kw):
            return f"data: {json.dumps({'type': t, **kw})}\n\n"
        def log(msg, level="info", model=""):
            return ev("log", message=msg, level=level, model=model)
        def prog(pct, label=""):
            return ev("progress", pct=pct, label=label)

        try:
            sess = SESSIONS[req.session_id]
            df   = sess["df"].copy()

            bad = [f for f in req.features + [req.target] if f not in df.columns]
            if bad:
                yield log(f"Missing columns: {bad}", "error"); return

            yield log(f"Dataset: {len(df):,} × {len(df.columns)}")
            yield prog(5, "Resolving task…")
            await asyncio.sleep(0.01)

            task    = resolve_task(df, req.target, req.task_type)
            feats   = [f for f in req.features if f in df.columns and f != req.target]
            yield log(f"Task: {task}  Features: {len(feats)}")

            X = df[feats]
            y = df[req.target].copy()
            le = None
            if task == "classification":
                le = LabelEncoder()
                y  = le.fit_transform(y.astype(str))
                yield log(f"Classes: {list(le.classes_)}", "dim")

            try:
                X_tr, X_te, y_tr, y_te = train_test_split(
                    X, y, test_size=req.test_size, random_state=req.random_seed,
                    stratify=y if task == "classification" else None,
                )
            except Exception:
                X_tr, X_te, y_tr, y_te = train_test_split(
                    X, y, test_size=req.test_size, random_state=req.random_seed,
                )
            yield log(f"Train: {len(X_tr):,}  Test: {len(X_te):,}")
            yield prog(10, "Building preprocessor…")
            await asyncio.sleep(0.01)

            prep    = make_preprocessor(df, feats, req.scaling, req.encoding)
            scoring = resolve_scoring(task, req.scoring)
            cv_k    = int(req.cv_folds) if req.cv_folds not in ("none", "", None) else None

            all_m = get_models(task, req.random_seed)
            mdls  = ({k: v for k, v in all_m.items() if k in req.selected_models}
                     if req.model_mode == "manual" and req.selected_models
                     else all_m)

            yield log(f"Training {len(mdls)} model(s)  scoring={scoring}  tuning={req.tuning}")
            yield prog(12)
            await asyncio.sleep(0.01)

            results = []
            sess.update({"label_encoder": le, "task": task,
                         "features": feats, "target": req.target, "config": req})

            for i, (name, model) in enumerate(mdls.items()):
                pct = int(12 + (i / len(mdls)) * 75)
                yield log(f"Training {name}…", model=name)
                yield prog(pct, f"Training {name}…")
                await asyncio.sleep(0.02)
                try:
                    t0   = time.time()
                    pipe = Pipeline([("preprocessor", prep), ("model", model)])

                    if req.tuning != "default":
                        cv_cv  = min(cv_k or 3, 3)
                        search = build_search(pipe, name, req.tuning, req.tuning_n,
                                              cv_cv, scoring, req.random_seed, req.n_jobs)
                        if search:
                            search.fit(X_tr, y_tr)
                            pipe = search.best_estimator_
                            yield log(f"  Best params: {search.best_params_}", "dim", name)
                        else:
                            pipe.fit(X_tr, y_tr)
                    else:
                        pipe.fit(X_tr, y_tr)

                    t_el   = time.time() - t0
                    y_pred = pipe.predict(X_te)
                    y_prob = None
                    if task == "classification" and hasattr(pipe, "predict_proba"):
                        try:   y_prob = pipe.predict_proba(X_te)
                        except Exception: pass

                    metrics = compute_metrics(task, y_te, y_pred, y_prob)

                    if cv_k:
                        try:
                            cvs = cross_val_score(pipe, X, y, cv=cv_k,
                                                  scoring=scoring, n_jobs=req.n_jobs)
                            metrics[f"cv_{scoring}_mean"] = round(float(cvs.mean()), 6)
                            metrics[f"cv_{scoring}_std"]  = round(float(cvs.std()), 6)
                            yield log(f"  CV({cv_k}): {cvs.mean():.4f} ± {cvs.std():.4f}", "dim", name)
                        except Exception as e:
                            yield log(f"  CV failed: {e}", "warn", name)

                    fi      = extract_feature_importance(pipe, feats)
                    primary = list(metrics.values())[0]
                    yield log(f"  ✓ {name}: {list(metrics.keys())[0]}={primary:.4f} ({t_el:.1f}s)", "success", name)

                    sess[f"pipe_{name}"] = pipe
                    results.append({
                        "model": name, "metrics": metrics,
                        "train_time": round(t_el, 3),
                        "feature_importance": fi,
                    })
                except Exception as e:
                    yield log(f"  ✗ {name} failed: {str(e)[:120]}", "error", name)

            if not results:
                yield log("All models failed — check data and features", "error"); return

            pk = list(results[0]["metrics"].keys())[0]
            results.sort(key=lambda r: r["metrics"].get(pk, -9e9),
                         reverse=pk not in ("rmse", "mae"))
            best = results[0]["model"]
            sess.update({"results": results, "best_model": best})

            yield prog(100, "Complete!")
            yield ev("done", results=results, best_model=best,
                     best_score=f"{pk}={list(results[0]['metrics'].values())[0]:.4f}")

        except Exception:
            yield ev("log", message=f"Fatal: {traceback.format_exc()}", level="error", model="")

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
