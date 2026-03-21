"""Data routes: upload, sample, clean, EDA."""
import io
import uuid

import numpy as np
import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel
from scipy import stats as scipy_stats
from sklearn.impute import SimpleImputer
from typing import List, Optional

from core.config import SESSIONS
from core.data import (
    col_kind, column_profile, compute_correlations,
    df_info, get_sample, quality_risks, two_col_compare,
)

router = APIRouter()


# ── Upload / samples ───────────────────────────────────────────────────────────
@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    try:
        content = await file.read()
        df  = pd.read_csv(io.BytesIO(content))
        sid = uuid.uuid4().hex[:8]
        SESSIONS[sid] = {"df_raw": df.copy(), "df": df.copy(),
                          "name": file.filename, "deployments": {}}
        return df_info(df, sid)
    except Exception as e:
        raise HTTPException(400, f"CSV error: {e}")


@router.post("/sample/{name}")
def sample_ep(name: str):
    df  = get_sample(name)
    sid = uuid.uuid4().hex[:8]
    SESSIONS[sid] = {"df_raw": df.copy(), "df": df.copy(),
                      "name": name, "deployments": {}}
    return df_info(df, sid)


# ── Clean ──────────────────────────────────────────────────────────────────────
class CleanReq(BaseModel):
    session_id: str
    numeric_impute: str = "mean"
    cat_impute: str = "most_frequent"
    outlier_method: str = "none"
    outlier_action: str = "remove"
    drop_threshold: float = 0.8
    drop_columns: List[str] = []
    remove_duplicates: bool = True


@router.post("/clean")
def clean(req: CleanReq):
    if req.session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    df    = SESSIONS[req.session_id]["df_raw"].copy()
    steps = []

    def log(msg, t="info"):
        steps.append({"message": msg, "type": t})

    # Manual drops
    cols = [c for c in req.drop_columns if c in df.columns]
    if cols:
        df.drop(columns=cols, inplace=True)
        log(f"Dropped {len(cols)} selected columns: {cols}", "warn")

    # Auto-drop high-missing
    auto = df.columns[df.isna().mean() > req.drop_threshold].tolist()
    if auto:
        df.drop(columns=auto, inplace=True)
        log(f"Auto-dropped {len(auto)} high-missing cols: {auto}", "warn")

    num = df.select_dtypes(include=np.number).columns.tolist()
    cat = df.select_dtypes(include="object").columns.tolist()

    # Numeric imputation
    if req.numeric_impute != "none" and num:
        if req.numeric_impute == "drop_rows":
            nb = len(df); df.dropna(subset=num, inplace=True)
            log(f"Dropped {nb - len(df)} rows (numeric NaN)", "warn")
        else:
            df[num] = SimpleImputer(strategy=req.numeric_impute).fit_transform(df[num])
            log(f"Imputed {len(num)} numeric cols via {req.numeric_impute}", "success")

    # Categorical imputation
    if req.cat_impute != "none" and cat:
        if req.cat_impute == "drop_rows":
            nb = len(df); df.dropna(subset=cat, inplace=True)
            log(f"Dropped {nb - len(df)} rows (cat NaN)", "warn")
        elif req.cat_impute == "constant":
            df[cat] = df[cat].fillna("unknown")
            log(f"Filled {len(cat)} cat cols with 'unknown'", "success")
        else:
            df[cat] = SimpleImputer(strategy="most_frequent").fit_transform(df[cat])
            log(f"Imputed {len(cat)} cat cols via most_frequent", "success")

    # Outlier handling
    if req.outlier_method != "none" and num:
        nb = len(df)
        if req.outlier_method == "iqr":
            mask = pd.Series(True, index=df.index)
            for c in num:
                q1, q3 = df[c].quantile(0.25), df[c].quantile(0.75)
                iqr = q3 - q1
                if req.outlier_action == "remove":
                    mask &= df[c].between(q1 - 1.5*iqr, q3 + 1.5*iqr)
                else:
                    df[c] = df[c].clip(q1 - 1.5*iqr, q3 + 1.5*iqr)
            if req.outlier_action == "remove":
                df = df[mask]
        elif req.outlier_method == "zscore":
            z = np.abs(scipy_stats.zscore(df[num].fillna(0)))
            if req.outlier_action == "remove":
                df = df[(z < 3).all(axis=1)]
        elif req.outlier_method == "clip_percentile":
            for c in num:
                df[c] = df[c].clip(df[c].quantile(0.01), df[c].quantile(0.99))
        removed = nb - len(df) if req.outlier_action == "remove" else 0
        log(f"Outliers ({req.outlier_method}): {'removed '+str(removed)+' rows' if req.outlier_action=='remove' else 'clipped'}", "success")

    # Deduplication
    if req.remove_duplicates:
        d = df.duplicated().sum()
        if d:
            df.drop_duplicates(inplace=True)
            log(f"Removed {d} duplicate rows", "warn")

    log(f"Done — {len(df)} rows × {len(df.columns)} cols", "success")
    SESSIONS[req.session_id]["df"] = df
    return {"columns": df.columns.tolist(), "n_rows": len(df), "steps": steps}


# ── EDA ────────────────────────────────────────────────────────────────────────
class EdaReq(BaseModel):
    session_id: str


class ColReq(BaseModel):
    session_id: str
    column: str
    treat_as: str = ""   # "" auto, "numeric" force numeric, "categorical" force categorical


class TwoColReq(BaseModel):
    session_id: str
    col_a: str
    col_b: str
    treat_a_as: str = ""
    treat_b_as: str = ""


@router.post("/eda")
def eda(req: EdaReq):
    if req.session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    df  = SESSIONS[req.session_id]["df"]
    num = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    desc = df[num].describe().to_dict() if num else {}
    return {
        "n_rows": len(df), "n_cols": len(df.columns),
        "dtypes":   {c: str(df[c].dtype) for c in df.columns},
        "col_kinds": {c: col_kind(df[c]) for c in df.columns},
        "missing":  {c: int(df[c].isna().sum()) for c in df.columns if df[c].isna().sum() > 0},
        "num_cols": num,
        "cat_cols": [c for c in df.columns if c not in num],
        "stats":    {col: {k: round(v, 4) if isinstance(v, float) else v
                           for k, v in d.items()}
                     for col, d in desc.items()},
        "risks":         quality_risks(df),
        "correlations":  compute_correlations(df),
    }


@router.post("/eda/column")
def eda_column(req: ColReq):
    if req.session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    df = SESSIONS[req.session_id]["df"]
    if req.column not in df.columns:
        raise HTTPException(400, f"Column '{req.column}' not found")
    return column_profile(df, req.column, req.treat_as or "")


@router.post("/eda/compare")
def eda_compare(req: TwoColReq):
    if req.session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    df = SESSIONS[req.session_id]["df"]
    for c in [req.col_a, req.col_b]:
        if c not in df.columns:
            raise HTTPException(400, f"Column '{c}' not found")
    return two_col_compare(df, req.col_a, req.col_b, req.treat_a_as or "", req.treat_b_as or "")


class DetectTaskReq(BaseModel):
    session_id: str
    target: str


@router.post("/eda/detect_task")
def detect_task(req: DetectTaskReq):
    """Return the predicted task type and a human-readable reason."""
    if req.session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    df = SESSIONS[req.session_id]["df"]
    if req.target not in df.columns:
        raise HTTPException(400, f"Column '{req.target}' not found")

    col  = df[req.target].dropna()
    dt   = str(col.dtype)
    n    = len(col)
    uniq = col.nunique()

    if dt in ("object", "bool", "category"):
        task   = "classification"
        reason = f"dtype is {dt} (non-numeric)"
    elif "int" in dt:
        ratio = uniq / max(n, 1)
        if uniq <= 50 or ratio < 0.05:
            task   = "classification"
            reason = f"{uniq} unique integer values ({ratio*100:.1f}% unique ratio) — looks like labels"
        else:
            task   = "regression"
            reason = f"{uniq} unique integer values ({ratio*100:.1f}% unique ratio) — looks continuous"
    elif "float" in dt:
        near_int = (col % 1 == 0).mean()
        if near_int > 0.95 and uniq <= 30:
            task   = "classification"
            reason = f"{uniq} unique values, {near_int*100:.0f}% are whole numbers — likely label-encoded classes"
        else:
            task   = "regression"
            reason = f"float column with {uniq} unique values — continuous target"
    else:
        task   = "regression"
        reason = f"defaulted to regression (dtype: {dt})"

    return {"task": task, "reason": reason, "n_unique": int(uniq), "dtype": dt}
