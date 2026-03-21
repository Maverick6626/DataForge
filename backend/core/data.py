"""Dataset loading, profiling, EDA, and data quality checks."""
import warnings
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

warnings.filterwarnings("ignore")


# ── Smart task detection ───────────────────────────────────────────────────────
def resolve_task(df: pd.DataFrame, target: str, hint: str) -> str:
    """Detect regression vs classification using unique-value ratio, not dtype alone."""
    if hint not in ("auto", ""):
        return hint
    col, n, uniq = df[target].dropna(), len(df), df[target].nunique()
    dt = str(col.dtype)

    if dt in ("object", "bool", "category"):
        return "classification"
    if "int" in dt:
        return "classification" if (uniq <= 50 or uniq / max(n, 1) < 0.05) else "regression"
    if "float" in dt:
        # float column whose values are all whole numbers + few unique → likely labels
        if (col % 1 == 0).mean() > 0.95 and uniq <= 30:
            return "classification"
        return "regression"
    return "regression"


# ── Column kind ────────────────────────────────────────────────────────────────
def col_kind(series: pd.Series) -> str:
    """Return 'numeric_continuous', 'numeric_discrete', or 'categorical'."""
    if not pd.api.types.is_numeric_dtype(series):
        return "categorical"
    uniq = series.nunique()
    n    = len(series.dropna())
    if uniq <= 15 or (uniq / max(n, 1) < 0.05 and uniq <= 30):
        return "numeric_discrete"
    return "numeric_continuous"


# ── Dataset summary ────────────────────────────────────────────────────────────
def df_info(df: pd.DataFrame, sid: str) -> dict:
    missing = {c: int(df[c].isna().sum()) for c in df.columns if df[c].isna().sum() > 0}
    total   = int(df.isna().sum().sum())
    return {
        "session_id": sid,
        "n_rows": int(df.shape[0]),
        "n_cols": int(df.shape[1]),
        "columns": df.columns.tolist(),
        "dtypes":  {c: str(df[c].dtype) for c in df.columns},
        "col_kinds": {c: col_kind(df[c]) for c in df.columns},
        "missing": missing,
        "total_missing": total,
        "total_missing_pct": round(total / max(df.size, 1) * 100, 2),
        "memory_mb": round(df.memory_usage(deep=True).sum() / 1e6, 2),
        "preview": df.head(10).replace({np.nan: None}).to_dict(orient="records"),
    }


# ── Sample datasets ────────────────────────────────────────────────────────────
def get_sample(name: str) -> pd.DataFrame:
    from sklearn import datasets as sk
    from fastapi import HTTPException
    loaders = {
        "iris":       lambda: pd.DataFrame(np.c_[sk.load_iris().data, sk.load_iris().target],
                                           columns=[*sk.load_iris().feature_names, "species"]),
        "diabetes":   lambda: pd.DataFrame(sk.load_diabetes().data,
                                           columns=sk.load_diabetes().feature_names
                                           ).assign(progression=sk.load_diabetes().target),
        "california": lambda: pd.DataFrame(sk.fetch_california_housing().data,
                                           columns=sk.fetch_california_housing().feature_names
                                           ).assign(price=sk.fetch_california_housing().target),
        "wine":       lambda: pd.DataFrame(sk.load_wine().data,
                                           columns=sk.load_wine().feature_names
                                           ).assign(quality=sk.load_wine().target),
    }
    if name not in loaders:
        raise HTTPException(404, f"Unknown sample '{name}'. Options: {list(loaders)}")
    return loaders[name]()


# ── EDA helpers ────────────────────────────────────────────────────────────────
def _hist(s: pd.Series, bins: int = 20) -> dict:
    try:
        counts, edges = np.histogram(s.dropna(), bins=bins)
        return {"counts": counts.tolist(), "edges": [round(float(e), 4) for e in edges]}
    except Exception:
        return {}


def _outlier_iqr(s: pd.Series) -> int:
    try:
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        return int(((s < q1 - 1.5*(q3-q1)) | (s > q3 + 1.5*(q3-q1))).sum())
    except Exception:
        return 0


def column_profile(df: pd.DataFrame, col: str, treat_as: str = "") -> dict:
    s    = df[col].dropna()
    miss = int(df[col].isna().sum())
    n    = len(df)
    # Allow caller to override auto-detection
    if treat_as == "numeric":
        kind = "numeric_continuous"
    elif treat_as == "categorical":
        kind = "categorical"
    else:
        kind = col_kind(df[col])
    base = {
        "col": col, "dtype": str(df[col].dtype), "kind": kind, "treat_as_override": bool(treat_as),
        "n_missing": miss, "pct_missing": round(miss / max(n, 1) * 100, 2),
        "n_unique": int(s.nunique()),
    }

    if kind in ("numeric_continuous", "numeric_discrete") or (treat_as == "numeric" and pd.api.types.is_numeric_dtype(df[col])):
        desc = s.describe()
        base.update({
            "mean": round(float(desc["mean"]), 4),  "std": round(float(desc["std"]), 4),
            "min":  round(float(desc["min"]), 4),   "max": round(float(desc["max"]), 4),
            "p25":  round(float(desc["25%"]), 4),   "p50": round(float(desc["50%"]), 4),
            "p75":  round(float(desc["75%"]), 4),
            "skewness":      round(float(s.skew()), 4),
            "kurtosis":      round(float(s.kurtosis()), 4),
            "outlier_count": _outlier_iqr(s),
            "histogram":     _hist(s),
        })
        # For discrete numerics also include value counts
        if kind == "numeric_discrete":
            vc = s.value_counts().sort_index().head(30)
            base["value_counts"] = {str(k): int(v) for k, v in vc.items()}
    else:
        vc = s.value_counts().head(20)
        base.update({
            "top_values":     {str(k): int(v) for k, v in vc.items()},
            "top_values_pct": {str(k): round(int(v)/max(len(s),1)*100, 1) for k, v in vc.items()},
        })
    return base


def two_col_compare(df: pd.DataFrame, a: str, b: str, treat_a_as: str = "", treat_b_as: str = "") -> dict:
    a_num = (treat_a_as == "numeric") or (treat_a_as != "categorical" and pd.api.types.is_numeric_dtype(df[a]))
    b_num = (treat_b_as == "numeric") or (treat_b_as != "categorical" and pd.api.types.is_numeric_dtype(df[b]))
    r = {"col_a": a, "col_b": b}

    if a_num and b_num:
        clean = df[[a, b]].dropna()
        r.update({
            "kind": "numeric_numeric",
            "correlation": round(float(clean[a].corr(clean[b])), 4),
            "spearman":    round(float(clean[a].rank().corr(clean[b].rank())), 4),
            "scatter": {
                "x": clean[a].round(4).tolist()[:600],
                "y": clean[b].round(4).tolist()[:600],
            },
        })
    elif not a_num and b_num:
        grps = df.groupby(a)[b].agg(["mean", "std", "count"]).round(4)
        r.update({"kind": "categorical_numeric",
                  "groups": grps.replace({np.nan: None}).to_dict(orient="index")})
    elif a_num and not b_num:
        grps = df.groupby(b)[a].agg(["mean", "std", "count"]).round(4)
        r.update({"kind": "numeric_categorical",
                  "groups": grps.replace({np.nan: None}).to_dict(orient="index")})
    else:
        ct = pd.crosstab(df[a].astype(str), df[b].astype(str))
        r.update({"kind": "categorical_categorical", "crosstab": ct.to_dict()})
    return r


# ── Data quality risks ─────────────────────────────────────────────────────────
def quality_risks(df: pd.DataFrame) -> List[dict]:
    risks = []
    n     = len(df)

    def add(level, col, issue, detail):
        risks.append({"level": level, "col": col, "issue": issue, "detail": detail})

    # Missing values
    for col in df.columns:
        pct = df[col].isna().mean() * 100
        if pct > 50:   add("error", col, "Very high missingness", f"{pct:.1f}% missing — strongly consider dropping")
        elif pct > 20: add("warn",  col, "Significant missingness", f"{pct:.1f}% missing — imputation may bias results")

    # Near-constant columns
    for col in df.columns:
        try:
            top = df[col].value_counts(normalize=True).iloc[0]
            if top > 0.98:
                add("warn", col, "Near-constant", f"Top value is {top*100:.1f}% of rows — likely low predictive value")
        except Exception:
            pass

    # High cardinality categoricals
    for col in df.select_dtypes("object").columns:
        u = df[col].nunique()
        if u > 50:
            add("info", col, "High cardinality", f"{u} unique values — one-hot will produce many features; consider ordinal/target encoding")

    # Duplicate rows
    dups = df.duplicated().sum()
    if dups:
        add("warn", None, "Duplicate rows", f"{dups} exact duplicates ({dups/n*100:.1f}%)")

    # Skewness
    for col in df.select_dtypes(include=np.number).columns:
        try:
            sk = abs(df[col].skew())
            if sk > 5:
                add("info", col, "High skewness", f"Skewness={sk:.2f} — log/sqrt transform may help linear models")
        except Exception:
            pass

    # Outliers
    for col in df.select_dtypes(include=np.number).columns:
        cnt = _outlier_iqr(df[col].dropna())
        if cnt / max(n, 1) > 0.05:
            add("info", col, "Outliers", f"{cnt} IQR-outliers ({cnt/n*100:.1f}%) — may skew tree splits or regressions")

    # Class imbalance (candidate targets)
    for col in df.columns:
        u = df[col].nunique()
        if 2 <= u <= 20:
            vc = df[col].value_counts(normalize=True)
            if vc.iloc[-1] < 0.05:
                add("warn", col, "Class imbalance", f"Minority class = {vc.iloc[-1]*100:.1f}% — consider SMOTE/oversampling if target")

    # Numeric columns that look like encoded categoricals
    for col in df.select_dtypes(include=np.number).columns:
        k = col_kind(df[col])
        if k == "numeric_discrete":
            add("info", col, "Numeric-encoded categorical", f"'{col}' has {df[col].nunique()} unique integer values — may be a categorical label; verify task type")

    return risks


# ── Correlations ───────────────────────────────────────────────────────────────
def compute_correlations(df: pd.DataFrame) -> dict:
    num = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    if len(num) < 2:
        return {}
    try:
        return df[num].corr().round(3).replace({np.nan: None}).to_dict()
    except Exception:
        return {}
