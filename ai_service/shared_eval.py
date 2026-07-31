"""
Tek canonical degerlendirme (evaluation) katmani: purge+embargo split + ortak metrikler.

main.py::calculate_horizon_metrics, v12_direction_lab.py::evaluate_predictions/
evaluate_binary, v12_zeta_scenario_screener.py::evaluate_classification - ucu de
ayni fikri (naive'e karsi olcum, 3-sinif dogruluk) ayri ayri yeniden yazmisti. Bu
modul o uc versiyonu birlestirir, ustune de hicbirinde olmayan purge+embargo split'i
ekler.

Purge+embargo (Lopez de Prado, "Advances in Financial Machine Learning"): etiketler
(TargetClass) `horizon` gun ileriye bakarak olustugu icin, train setindeki bir satirin
etiketi validation/test donemine "tasabilir" (ornegin train'in son gunu ile
validation'in ilk gunu arasinda horizon kadar ortusme varsa). purge bu ortusen
satirlari train'den atar; embargo bunun ustune ekstra bir guvenlik marji (gun) daha
ekler (seri korelasyon/otokorelasyon kaynakli sizintiya karsi).
"""

import itertools
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from shared_labeling import CLASS_DOWN, CLASS_FLAT, CLASS_UP, class_distribution


def purged_embargo_split(
    df: pd.DataFrame,
    validation_start: str,
    test_start: str,
    horizon: int,
    embargo_days: int = 5,
    date_col: str = "Date",
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Tarih bazli train/validation/test split + purge + embargo.

    - Train: date < validation_start, VE etiket penceresi (date + horizon gun)
      validation_start'a embargo_days kadar mesafeden once bitmis olmali (purge+embargo).
    - Validation: validation_start <= date < test_start, ayni sekilde test_start'a
      karsi purge+embargo uygulanir.
    - Test: date >= test_start (etiketi olusan, yani label icin yeterli ileri veri
      bulunan) satirlar.

    Not: horizon gun sonrasi veri olmayan (df'in en sonundaki) satirlarin zaten
    TargetClass'i NaN olur (bkz. shared_labeling.apply_triple_barrier) - bu fonksiyon
    ayrica dropna yapmaz, cagiran taraf feature/label kolonlarina gore dropna etmeli.
    """
    dates = pd.to_datetime(df[date_col])
    val_start_dt = pd.to_datetime(validation_start)
    test_start_dt = pd.to_datetime(test_start)

    embargo = pd.Timedelta(days=embargo_days)
    label_horizon = pd.Timedelta(days=horizon)

    train_cutoff = val_start_dt - label_horizon - embargo
    val_cutoff = test_start_dt - label_horizon - embargo

    train = df[dates < train_cutoff].copy()
    validation = df[(dates >= val_start_dt) & (dates < val_cutoff)].copy()
    test = df[dates >= test_start_dt].copy()

    return train, validation, test


def cpcv_splits(
    df: pd.DataFrame,
    horizon: int,
    n_groups: int = 6,
    n_test_groups: int = 2,
    embargo_days: int = 5,
    date_col: str = "Date",
    min_train: int = 100,
    min_test: int = 20,
) -> List[Dict[str, Any]]:
    """
    Combinatorial Purged Cross-Validation (Lopez de Prado, "Advances in Financial
    Machine Learning"). Tarih eksenini `n_groups` ardisik bloga boler, her
    C(n_groups, n_test_groups) kombinasyonu icin farkli bir blok alt kumesini test
    olarak secip, o test bloklarinin her birinin sinirina purge+embargo uygulayarak
    train kumesini olusturur.

    Tek bir walk-forward yoluna (main.py/v12_direction_lab.py'nin eski davranisi)
    guvenmek yerine birden fazla yol uretir - boylece bir sonucun sansa mi yoksa
    gercek yetenege mi bagli oldugu, "kac path'te naive'i geciyor" diye
    sorgulanabilir hale gelir.

    Doner: her biri {"trainDf", "testDf", "testGroups", "pathId"} iceren liste.
    """
    df = df.sort_values(date_col).reset_index(drop=True)
    dates = pd.to_datetime(df[date_col])

    min_date, max_date = dates.min(), dates.max()
    boundaries = pd.date_range(min_date, max_date, periods=n_groups + 1)

    group_id = pd.cut(dates, bins=boundaries, labels=False, include_lowest=True)

    embargo = pd.Timedelta(days=embargo_days)
    label_horizon = pd.Timedelta(days=int(horizon))

    paths = []
    for path_id, test_groups in enumerate(itertools.combinations(range(n_groups), n_test_groups)):
        test_mask = group_id.isin(test_groups)

        if not test_mask.any():
            continue

        train_mask = ~test_mask
        for g in test_groups:
            g_start = boundaries[g]
            g_end = boundaries[g + 1]
            purge_start = g_start - label_horizon - embargo
            purge_end = g_end + embargo
            overlap = (dates >= purge_start) & (dates < purge_end)
            train_mask = train_mask & ~overlap

        train_df = df[train_mask]
        test_df = df[test_mask]

        if len(train_df) < min_train or len(test_df) < min_test:
            continue

        paths.append({
            "trainDf": train_df,
            "testDf": test_df,
            "testGroups": list(test_groups),
            "pathId": path_id,
        })

    return paths


def evaluate_classification(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, Any]:
    """
    3-sinif (down/flat/up) siniflandirma degerlendirmesi. direction_lab'in
    evaluate_predictions'i ile zeta'nin evaluate_classification'inin birlesimi.
    """
    y_true = np.asarray(y_true, dtype=np.int32)
    y_pred = np.asarray(y_pred, dtype=np.int32)
    n = len(y_true)

    if n == 0:
        return {"samples": 0}

    accuracy = float(np.mean(y_true == y_pred))

    pred_action = y_pred != CLASS_FLAT
    real_action = y_true != CLASS_FLAT

    action_count = int(pred_action.sum())
    real_action_count = int(real_action.sum())

    action_rate = float(action_count / n)
    real_action_rate = float(real_action_count / n)
    flat_rate = float(np.mean(y_pred == CLASS_FLAT))

    action_precision = float(np.mean(y_true[pred_action] == y_pred[pred_action])) if action_count > 0 else 0.0
    action_recall = (
        float(np.sum((y_true == y_pred) & real_action) / real_action_count)
        if real_action_count > 0 else 0.0
    )
    direction_accuracy_on_real_moves = (
        float(np.mean(y_true[real_action] == y_pred[real_action]))
        if real_action_count > 0 else 0.0
    )

    matrix = np.zeros((3, 3), dtype=int)
    label_to_idx = {CLASS_DOWN: 0, CLASS_FLAT: 1, CLASS_UP: 2}
    for t, p in zip(y_true, y_pred):
        if int(t) in label_to_idx and int(p) in label_to_idx:
            matrix[label_to_idx[int(t)], label_to_idx[int(p)]] += 1

    return {
        "samples": int(n),
        "accuracy": round(accuracy * 100, 2),
        "actionPrecision": round(action_precision * 100, 2),
        "actionRecall": round(action_recall * 100, 2),
        "actionRate": round(action_rate * 100, 2),
        "realActionRate": round(real_action_rate * 100, 2),
        "flatRate": round(flat_rate * 100, 2),
        "directionAccuracyOnRealMoves": round(direction_accuracy_on_real_moves * 100, 2),
        "confusionMatrix": {"labels": ["down", "flat", "up"], "matrix": matrix.tolist()},
        "actualClassDistribution": class_distribution(y_true),
        "predictedClassDistribution": class_distribution(y_pred),
    }


def evaluate_binary(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, Any]:
    y_true = np.asarray(y_true, dtype=np.int32)
    y_pred = np.asarray(y_pred, dtype=np.int32)

    if len(y_true) == 0:
        return {}

    tp = int(np.sum((y_true == 1) & (y_pred == 1)))
    fp = int(np.sum((y_true == 0) & (y_pred == 1)))
    tn = int(np.sum((y_true == 0) & (y_pred == 0)))
    fn = int(np.sum((y_true == 1) & (y_pred == 0)))

    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    accuracy = (tp + tn) / len(y_true)

    return {
        "accuracy": round(accuracy * 100, 2),
        "precision": round(precision * 100, 2),
        "recall": round(recall * 100, 2),
        "positiveRate": round(float(np.mean(y_pred == 1)) * 100, 2),
        "confusion": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
    }


def naive_always_flat_predictions(n: int) -> np.ndarray:
    """Naive baseline: 'hicbir onemli hareket yok' varsayimi. Zayif taban - hic aksiyon
    almadigi icin actionPrecision'da otomatik 0 cikar, 'onu gecmek' cok kolaylasir."""
    return np.full(n, CLASS_FLAT, dtype=np.int32)


def naive_majority_class_predictions(y_train: np.ndarray, n_test: int) -> np.ndarray:
    """Naive baseline: train setindeki en sik gorulen sinifi her zaman tahmin et."""
    y_train = np.asarray(y_train, dtype=np.int32)
    values, counts = np.unique(y_train, return_counts=True)
    majority = int(values[np.argmax(counts)])
    return np.full(n_test, majority, dtype=np.int32)


def naive_random_from_train_distribution(y_train: np.ndarray, n_test: int, seed: int = 42) -> np.ndarray:
    """
    Naive baseline: train setinin sinif dagilimina gore agirlikli rastgele tahmin.
    Bu, "her zaman flat" gibi hic aksiyon almayan degil, gercekten UP/DOWN da
    tahmin eden bir taban oldugu icin actionPrecision'da anlamli, gecilmesi zor
    bir kiyas noktasi olusturur (v12_direction_lab.py'nin eski
    'train_distribution_random' bazinin genellestirilmis hali).
    """
    y_train = np.asarray(y_train, dtype=np.int32)
    values, counts = np.unique(y_train, return_counts=True)
    probs = counts / counts.sum()
    rng = np.random.default_rng(seed)
    return rng.choice(values, size=n_test, p=probs).astype(np.int32)


def toughest_naive_metrics(
    y_train: np.ndarray,
    y_test: np.ndarray,
    metric_key: str = "actionPrecision",
) -> Dict[str, Any]:
    """
    Birden fazla naive taban (always-flat, majority-class, train-distribution-random)
    hesaplayip `metric_key` acisindan EN ZORLU (en yuksek skorlu) olani doner - "naive'i
    gectik" iddiasi boylece en kolay tabana degil, birden fazla makul tabanin en
    guclusune karsi olculur.
    """
    n_test = len(y_test)

    candidates = {
        "alwaysFlat": naive_always_flat_predictions(n_test),
        "majorityClass": naive_majority_class_predictions(y_train, n_test),
        "trainDistributionRandom": naive_random_from_train_distribution(y_train, n_test),
    }

    evaluated = {name: evaluate_classification(y_test, pred) for name, pred in candidates.items()}
    toughest_name = max(evaluated, key=lambda name: evaluated[name].get(metric_key, 0.0))

    result = dict(evaluated[toughest_name])
    result["toughestNaiveVariant"] = toughest_name
    result["allNaiveVariants"] = {name: m.get(metric_key, 0.0) for name, m in evaluated.items()}
    return result


def calculate_skill_vs_naive(model_metrics: Dict[str, float], naive_metrics: Dict[str, float]) -> Dict[str, Any]:
    """main.py::calculate_skill_vs_naive ile ayni formul, RMSE/MAPE bazli motorlar icin."""
    naive_mape = float(naive_metrics.get("mape", 0.0))
    model_mape = float(model_metrics.get("mape", 0.0))
    naive_rmse = float(naive_metrics.get("rmse", 0.0))
    model_rmse = float(model_metrics.get("rmse", 0.0))

    mape_skill = (naive_mape - model_mape) / naive_mape * 100.0 if naive_mape > 1e-12 else 0.0
    rmse_skill = (naive_rmse - model_rmse) / naive_rmse * 100.0 if naive_rmse > 1e-12 else 0.0

    return {
        "mapeSkillPct": round(float(mape_skill), 2),
        "rmseSkillPct": round(float(rmse_skill), 2),
        "actionPrecisionSkillPctPoint": round(
            float(model_metrics.get("actionPrecision", 0.0)) - float(naive_metrics.get("actionPrecision", 0.0)), 2
        ),
        "beatsNaiveByMape": bool(mape_skill > 0),
        "beatsNaiveByRmse": bool(rmse_skill > 0),
        "beatsNaiveByActionPrecision": bool(
            float(model_metrics.get("actionPrecision", 0.0)) > float(naive_metrics.get("actionPrecision", 0.0))
        ),
    }


def minimum_backtest_length_warning(n_trials: int, n_days_available: int) -> Dict[str, Any]:
    """
    Bailey & Lopez de Prado (2014) "Minimum Backtest Length" yaklasiminin basitlestirilmis
    bir uyarisi: kac bagimsiz konfigurasyon denendigini ve elde bu kadar deneme icin
    yeterli veri olup olmadigini kaydeder. Gercek DSR hesaplamasi yerine, deney
    kaydinda (Aim) "bu sayiyi kac denemeden sectik" seffafligini saglamak icindir.
    """
    # kaba kural: n_trials bagimsiz deneme icin en az ~10 * log(n_trials) is gunu gerekir
    # (Bailey & Lopez de Prado, 2014'teki egriyi kaba bir referans olarak kullanir).
    min_days_needed = 10 * np.log(max(2, n_trials))

    return {
        "trialsRun": int(n_trials),
        "daysAvailable": int(n_days_available),
        "approxMinDaysNeeded": round(float(min_days_needed), 1),
        "likelyOverfit": bool(n_days_available < min_days_needed),
        "note": (
            "Bu kesin bir istatistiksel test degil - kac deneme yapildigini seffaf kaydetmek "
            "ve 'az veriyle cok deneme' durumunu erkenden fark etmek icin kaba bir isaretci."
        ),
    }
