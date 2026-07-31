"""
Hafif, yerel-oncelikli deney takibi (Sacred + FileStorageObserver).

Kullanicinin "not tutmayi biraktigimiz an hangi denemenin ne verdigini kaybettik"
sorununa cozum: her egitim/backtest calistirmasi config + metrik + git commit
bilgisiyle birlikte otomatik olarak `experiment_runs/<id>/` altina diske yazilir.
Aim (aimrocks native bagimliligi bu Windows/Python surumunde derlenemedi) yerine
Sacred secildi - saf Python, kurulumu sorunsuz, ayni ihtiyaci karsiliyor.

Kullanim:
    from experiment_log import log_run
    log_run(
        name="ana_motor_baseline",
        config={"horizon": 10, "vol_mult": 0.6, "model": "gradient_boosting"},
        metrics={"accuracy": 52.3, "actionPrecision": 58.1, "beatsNaiveByMape": True},
        tags=["faz1", "baseline"],
    )
"""

from pathlib import Path
from typing import Any, Dict, List, Optional

from sacred import Experiment
from sacred.observers import FileStorageObserver

RUNS_DIR = Path(__file__).parent / "experiment_runs"


def log_run(
    name: str,
    config: Dict[str, Any],
    metrics: Dict[str, Any],
    tags: Optional[List[str]] = None,
) -> int:
    """
    Bir deneyi (config + sonuc metrikleri) diske kaydeder, Sacred run id'sini doner.
    Metrik degerleri sayisal olmayabilir (ör. confusionMatrix bir dict) - sadece
    sayisal olanlar log_scalar ile, digerleri run.info icine duz kaydedilir.
    """
    RUNS_DIR.mkdir(parents=True, exist_ok=True)

    ex = Experiment(name, save_git_info=False)
    ex.observers.append(FileStorageObserver(str(RUNS_DIR)))
    ex.add_config(config)

    @ex.main
    def _run(_run):
        for key, value in metrics.items():
            if isinstance(value, (int, float, bool)):
                _run.log_scalar(key, float(value))
        _run.info["metrics"] = metrics
        _run.info["tags"] = tags or []
        return metrics

    run = ex.run()
    return run._id
