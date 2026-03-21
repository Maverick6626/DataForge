"""ML model registry, preprocessing factories, metrics, and feature importance."""
import warnings
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    AdaBoostClassifier, AdaBoostRegressor,
    ExtraTreesClassifier, ExtraTreesRegressor,
    GradientBoostingClassifier, GradientBoostingRegressor,
    RandomForestClassifier, RandomForestRegressor,
)
from sklearn.impute import SimpleImputer
from sklearn.linear_model import ElasticNet, Lasso, LinearRegression, LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score, f1_score, mean_absolute_error,
    mean_squared_error, r2_score, roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, RandomizedSearchCV, cross_val_score
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import (
    LabelEncoder, MinMaxScaler, OneHotEncoder,
    OrdinalEncoder, RobustScaler, StandardScaler,
)
from sklearn.svm import SVC, SVR
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

warnings.filterwarnings("ignore")

# Optional boosters
try:    import xgboost as xgb;   HAS_XGB = True
except: HAS_XGB = False  # noqa
try:    import lightgbm as lgb;  HAS_LGB = True
except: HAS_LGB = False  # noqa
try:    from catboost import CatBoostClassifier, CatBoostRegressor; HAS_CAT = True
except: HAS_CAT = False  # noqa


# ── Preprocessing ──────────────────────────────────────────────────────────────
def make_scaler(name: str):
    return {
        "standard": StandardScaler(), "minmax": MinMaxScaler(),
        "robust":   RobustScaler(),   "none":   "passthrough",
    }.get(name, StandardScaler())


def make_encoder(name: str):
    if name == "ordinal":
        return OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)
    return OneHotEncoder(handle_unknown="ignore", sparse_output=False)


def make_preprocessor(df: pd.DataFrame, features: List[str],
                       scaling: str, encoding: str) -> ColumnTransformer:
    num = [f for f in features if pd.api.types.is_numeric_dtype(df[f])]
    cat = [f for f in features if f not in num]
    transformers = []
    if num:
        transformers.append(("num", Pipeline([
            ("imp", SimpleImputer(strategy="median")),
            ("sc",  make_scaler(scaling)),
        ]), num))
    if cat:
        transformers.append(("cat", Pipeline([
            ("imp", SimpleImputer(strategy="most_frequent")),
            ("enc", make_encoder(encoding)),
        ]), cat))
    return ColumnTransformer(transformers, remainder="drop")


# ── Model registry ─────────────────────────────────────────────────────────────
def get_models(task: str, seed: int) -> Dict[str, Any]:
    if task == "classification":
        m = {
            "Logistic Regression": LogisticRegression(max_iter=2000, random_state=seed, n_jobs=-1),
            "Decision Tree":       DecisionTreeClassifier(random_state=seed),
            "Random Forest":       RandomForestClassifier(n_estimators=100, random_state=seed, n_jobs=-1),
            "Extra Trees":         ExtraTreesClassifier(n_estimators=100, random_state=seed, n_jobs=-1),
            "Gradient Boosting":   GradientBoostingClassifier(random_state=seed),
            "AdaBoost":            AdaBoostClassifier(random_state=seed),
            "SVM":                 SVC(probability=True, random_state=seed),
            "K-Nearest Neighbors": KNeighborsClassifier(n_jobs=-1),
            "Naive Bayes":         GaussianNB(),
        }
        if HAS_XGB: m["XGBoost"]  = xgb.XGBClassifier(n_estimators=200, random_state=seed, n_jobs=-1, eval_metric="logloss", verbosity=0)
        if HAS_LGB: m["LightGBM"] = lgb.LGBMClassifier(n_estimators=200, random_state=seed, n_jobs=-1, verbose=-1)
        if HAS_CAT: m["CatBoost"] = CatBoostClassifier(iterations=200, random_seed=seed, verbose=0)
    else:
        m = {
            "Linear Regression":   LinearRegression(n_jobs=-1),
            "Ridge":               Ridge(random_state=seed),
            "Lasso":               Lasso(random_state=seed),
            "ElasticNet":          ElasticNet(random_state=seed),
            "Decision Tree":       DecisionTreeRegressor(random_state=seed),
            "Random Forest":       RandomForestRegressor(n_estimators=100, random_state=seed, n_jobs=-1),
            "Extra Trees":         ExtraTreesRegressor(n_estimators=100, random_state=seed, n_jobs=-1),
            "Gradient Boosting":   GradientBoostingRegressor(random_state=seed),
            "AdaBoost":            AdaBoostRegressor(random_state=seed),
            "SVM":                 SVR(),
            "K-Nearest Neighbors": KNeighborsRegressor(n_jobs=-1),
        }
        if HAS_XGB: m["XGBoost"]  = xgb.XGBRegressor(n_estimators=200, random_state=seed, n_jobs=-1, verbosity=0)
        if HAS_LGB: m["LightGBM"] = lgb.LGBMRegressor(n_estimators=200, random_state=seed, n_jobs=-1, verbose=-1)
        if HAS_CAT: m["CatBoost"] = CatBoostRegressor(iterations=200, random_seed=seed, verbose=0)
    return m


PARAM_GRIDS: Dict[str, dict] = {
    "Random Forest":       {"model__n_estimators": [100,200], "model__max_depth": [None,10,20], "model__min_samples_split": [2,5]},
    "Extra Trees":         {"model__n_estimators": [100,200], "model__max_depth": [None,10,20]},
    "Gradient Boosting":   {"model__n_estimators": [100,200], "model__learning_rate": [0.05,0.1,0.2], "model__max_depth": [3,5]},
    "Decision Tree":       {"model__max_depth": [None,5,10,20], "model__min_samples_split": [2,5,10]},
    "SVM":                 {"model__C": [0.1,1,10], "model__kernel": ["rbf","linear"]},
    "Logistic Regression": {"model__C": [0.01,0.1,1,10]},
    "Ridge":               {"model__alpha": [0.1,1,10,100]},
    "Lasso":               {"model__alpha": [0.01,0.1,1,10]},
    "ElasticNet":          {"model__alpha": [0.1,1], "model__l1_ratio": [0.2,0.5,0.8]},
    "K-Nearest Neighbors": {"model__n_neighbors": [3,5,7,11,15]},
    "AdaBoost":            {"model__n_estimators": [50,100,200], "model__learning_rate": [0.5,1.0,1.5]},
    "XGBoost":             {"model__n_estimators": [100,200], "model__max_depth": [3,6], "model__learning_rate": [0.05,0.1,0.2]},
    "LightGBM":            {"model__n_estimators": [100,200], "model__num_leaves": [31,63], "model__learning_rate": [0.05,0.1]},
    "CatBoost":            {"model__iterations": [100,200], "model__depth": [4,6,8], "model__learning_rate": [0.05,0.1,0.2]},
}


# ── Scoring ────────────────────────────────────────────────────────────────────
def resolve_scoring(task: str, metric: str) -> str:
    if metric not in ("auto", ""):
        return metric
    return "accuracy" if task == "classification" else "r2"


def compute_metrics(task: str, y_true, y_pred, y_prob=None) -> dict:
    if task == "classification":
        m = {
            "accuracy":    round(float(accuracy_score(y_true, y_pred)), 6),
            "f1_weighted": round(float(f1_score(y_true, y_pred, average="weighted", zero_division=0)), 6),
        }
        if y_prob is not None:
            try:
                nc = len(np.unique(y_true))
                if nc == 2:
                    m["roc_auc"] = round(float(roc_auc_score(y_true, y_prob[:, 1])), 6)
                else:
                    m["roc_auc_ovr"] = round(float(roc_auc_score(y_true, y_prob, multi_class="ovr", average="weighted")), 6)
            except Exception:
                pass
        return m
    mse = mean_squared_error(y_true, y_pred)
    return {
        "r2":   round(float(r2_score(y_true, y_pred)), 6),
        "rmse": round(float(np.sqrt(mse)), 6),
        "mae":  round(float(mean_absolute_error(y_true, y_pred)), 6),
    }


# ── Feature importance ─────────────────────────────────────────────────────────
def extract_feature_importance(pipe: Pipeline, features: List[str]) -> dict:
    model = pipe.named_steps.get("model")
    if not model:
        return {}
    if hasattr(model, "feature_importances_"):
        try:
            proc  = pipe.named_steps["preprocessor"]
            names: List[str] = []
            for _, t, cols in proc.transformers_:
                if hasattr(t, "get_feature_names_out"):
                    names.extend(t.get_feature_names_out(cols).tolist())
                else:
                    names.extend(list(cols))
            imps = model.feature_importances_
            n    = min(len(names), len(imps))
            return {names[i]: round(float(imps[i]), 6) for i in range(n)}
        except Exception:
            pass
    if hasattr(model, "coef_"):
        try:
            coef = np.abs(model.coef_).flatten()[:len(features)]
            return {features[i]: round(float(coef[i]), 6) for i in range(len(coef))}
        except Exception:
            pass
    return {}


# ── Search builder ─────────────────────────────────────────────────────────────
def build_search(pipe: Pipeline, name: str, strategy: str,
                 n_iter: int, cv: int, scoring: str, seed: int, n_jobs: int):
    grid = PARAM_GRIDS.get(name)
    if not grid:
        return None
    if strategy == "grid":
        return GridSearchCV(pipe, grid, cv=cv, scoring=scoring, n_jobs=n_jobs)
    return RandomizedSearchCV(pipe, grid, n_iter=min(n_iter, 20), cv=cv,
                              scoring=scoring, n_jobs=n_jobs, random_state=seed)


# ── Label encoder helpers ──────────────────────────────────────────────────────
def make_label_encoder() -> LabelEncoder:
    return LabelEncoder()
