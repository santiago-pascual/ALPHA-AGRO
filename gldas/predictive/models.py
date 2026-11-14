"""Leakage-safe model factories; all learned transforms are fit on training rows."""

from __future__ import annotations

from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


def estimator(name: str, *, task: str = "regression", params: dict | None = None):
    options = dict(params or {})
    if task not in ("regression", "classification"):
        raise ValueError("task must be regression or classification.")
    if name == "ridge":
        if task == "classification":
            return make_pipeline(SimpleImputer(strategy="median", keep_empty_features=True),
                                 StandardScaler(), LogisticRegression(
                                     C=float(options.get("C", 1.0)), max_iter=1000,
                                     class_weight="balanced", random_state=1729))
        return make_pipeline(SimpleImputer(strategy="median", keep_empty_features=True),
                             StandardScaler(), Ridge(alpha=float(options.get("alpha", 10.0))))
    if name in ("xgboost", "xgboost_hmm"):
        from xgboost import XGBClassifier, XGBRegressor
        common = dict(
            n_estimators=int(options.get("n_estimators", 120)),
            max_depth=int(options.get("max_depth", 2)),
            learning_rate=float(options.get("learning_rate", 0.03)),
            subsample=0.8, colsample_bytree=0.8, reg_lambda=10.0,
            min_child_weight=5, n_jobs=1, random_state=1729,
            tree_method="hist", verbosity=0,
        )
        if task == "classification":
            return XGBClassifier(objective="binary:logistic", eval_metric="logloss", **common)
        return XGBRegressor(objective="reg:squarederror", eval_metric="rmse", **common)
    raise ValueError(f"Unknown model family: {name}")


def candidate_specs(name: str) -> list[dict]:
    if name == "ridge":
        return [{"alpha": value} for value in (1.0, 10.0, 100.0)]
    if name in ("xgboost", "xgboost_hmm"):
        return [{"max_depth": depth, "n_estimators": rounds, "learning_rate": 0.03}
                for depth, rounds in ((1, 80), (2, 120))]
    return [{}]


def predict(estimator_object, X, *, probability: bool = False):
    if probability:
        return estimator_object.predict_proba(X)[:, 1]
    return estimator_object.predict(X)


def fit(estimator_object, X, y, *, sample_weight=None):
    if sample_weight is None:
        return estimator_object.fit(X, y)
    if hasattr(estimator_object, "named_steps"):
        last_step = list(estimator_object.named_steps)[-1]
        return estimator_object.fit(X, y, **{f"{last_step}__sample_weight": sample_weight})
    return estimator_object.fit(X, y, sample_weight=sample_weight)
