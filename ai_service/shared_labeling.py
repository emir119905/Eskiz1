"""
Tek canonical etiketleme (labeling) katmani - triple-barrier method.

v12_zeta_scenario_screener.py::add_future_outcomes zaten bir "HitUpperBeforeLower"/
"HitLowerBeforeUpper" hesabi yapiyordu ama bunlar sadece tanisal/yardimci
kolonlardi; asil egitim etiketi (TargetClass) hala sabit-ufuk (vertical-barrier-only)
getiri isaretiydi. Bu modul gercek triple-barrier mantigini (ilk hangi bariyer
dokunulursa o kazanir - ust/alt/dikey) TargetClass'in kendisine tasir, boylece
ornegin ufuk icinde stop-loss seviyesine dokunup sonra toparlanan bir hisse artik
yanlislikla "up" etiketlenmez.

main.py, v12_direction_lab.py ve v12_zeta_scenario_screener.py bu modulu ortak
kullanacak - su an ucu de TargetClass'i farkli formullerle hesapliyordu.
"""

from typing import Optional

import numpy as np
import pandas as pd

CLASS_DOWN = -1
CLASS_FLAT = 0
CLASS_UP = 1


def apply_triple_barrier(
    df: pd.DataFrame,
    horizon: int,
    vol_mult: float = 0.60,
    min_threshold: float = 0.01,
    vol_col: str = "Volatility20",
) -> pd.DataFrame:
    """
    df icin (ClosePrice, HighPrice, LowPrice, Date, ve vol_col kolonlari gerekli)
    triple-barrier etiketlemesi ekler:

    - UpperBarrier / LowerBarrier: o satirin lokal volatilitesine gore olceklenen,
      sqrt(horizon) ile buyuyen dinamik getiri esikleri.
    - FutureReturn / FutureDate: dikey (zaman) bariyerdeki referans getiri -
      tanisal amacli, etiketin kendisi degil.
    - BarrierTouchDay: ust/alt bariyerin ilk dokunuldugu gun (1..horizon), hicbiri
      dokunulmadiysa NaN.
    - TargetClass: ust bariyer once dokunulduysa UP(1), alt bariyer once
      dokunulduysa DOWN(-1), ufuk boyunca hicbiri dokunulmadiysa FLAT(0).
    - MoveTarget: TargetClass != FLAT (two-stage siniflandiricilar icin).
    - DirectionTarget: TargetClass == UP ise 1, degilse 0 (yalnizca MoveTarget==1
      olan satirlarda anlamli, iki-asamali modelin ikinci kademesi icin).

    Vektorel degil (bariyer ilk-dokunma mantigi path-dependent) ama gunluk veri +
    tipik horizon (5-30 gun) icin performans sorun degil.
    """
    df = df.copy()

    close = df["ClosePrice"].astype(float).values
    high = df["HighPrice"].astype(float).values if "HighPrice" in df.columns else close
    low = df["LowPrice"].astype(float).values if "LowPrice" in df.columns else close

    local_vol = df[vol_col].fillna(0.0).astype(float).values
    threshold = np.maximum(min_threshold, local_vol * np.sqrt(horizon) * vol_mult)

    n = len(df)
    target_class = np.full(n, np.nan)
    touch_day = np.full(n, np.nan)
    future_return = np.full(n, np.nan)

    for i in range(n):
        if i + horizon >= n:
            continue

        base_price = close[i]
        if not np.isfinite(base_price) or base_price <= 0:
            continue

        upper_level = threshold[i]
        lower_level = -threshold[i]

        upper_day = None
        lower_day = None

        for step in range(1, horizon + 1):
            j = i + step
            high_return = (high[j] / base_price) - 1
            low_return = (low[j] / base_price) - 1

            if upper_day is None and high_return >= upper_level:
                upper_day = step
            if lower_day is None and low_return <= lower_level:
                lower_day = step

            if upper_day is not None and lower_day is not None:
                break

        future_return[i] = (close[i + horizon] / base_price) - 1

        if upper_day is not None and (lower_day is None or upper_day <= lower_day):
            target_class[i] = CLASS_UP
            touch_day[i] = upper_day
        elif lower_day is not None:
            target_class[i] = CLASS_DOWN
            touch_day[i] = lower_day
        else:
            target_class[i] = CLASS_FLAT

    df["UpperBarrier"] = threshold
    df["LowerBarrier"] = -threshold
    df["FutureReturn"] = future_return
    if "Date" in df.columns:
        df["FutureDate"] = df["Date"].shift(-horizon)
    df["BarrierTouchDay"] = touch_day
    df["TargetClass"] = target_class

    valid = df["TargetClass"].notna()
    df.loc[valid, "MoveTarget"] = (df.loc[valid, "TargetClass"] != CLASS_FLAT).astype(int)
    df.loc[valid, "DirectionTarget"] = (df.loc[valid, "TargetClass"] == CLASS_UP).astype(int)

    return df


def class_distribution(classes: np.ndarray) -> dict:
    classes = np.asarray(classes)
    classes = classes[~pd.isna(classes)].astype(int)
    n = max(1, len(classes))

    return {
        "downPct": round(float(np.mean(classes == CLASS_DOWN)) * 100, 2) if len(classes) else 0.0,
        "flatPct": round(float(np.mean(classes == CLASS_FLAT)) * 100, 2) if len(classes) else 0.0,
        "upPct": round(float(np.mean(classes == CLASS_UP)) * 100, 2) if len(classes) else 0.0,
        "downCount": int(np.sum(classes == CLASS_DOWN)),
        "flatCount": int(np.sum(classes == CLASS_FLAT)),
        "upCount": int(np.sum(classes == CLASS_UP)),
        "samples": int(n),
    }
