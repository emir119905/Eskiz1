"""
Az sayida, ilkeli aday siniflandirici fabrikasi.

engine_baseline.py (Faz 1) ve v12_direction_lab.py (Faz 2) ayni model
adaylarini kullanir - ikisinde de ayri ayri tanimlanmasin diye buraya tasindi.
"""

from typing import Any, Dict

from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


def build_classifier_candidates() -> Dict[str, Any]:
    return {
        "logistic": make_pipeline(
            StandardScaler(),
            LogisticRegression(max_iter=1500, class_weight="balanced", solver="lbfgs"),
        ),
        "random_forest": RandomForestClassifier(
            n_estimators=220, max_depth=6, min_samples_leaf=8,
            class_weight="balanced_subsample", random_state=42, n_jobs=-1,
        ),
        "gradient_boosting": GradientBoostingClassifier(
            n_estimators=150, learning_rate=0.05, max_depth=3, random_state=42,
        ),
    }
