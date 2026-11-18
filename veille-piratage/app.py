"""Point d'entrée : collecte en arrière-plan + site web de l'observatoire.

    python app.py                 # lance la collecte et le site web
    python app.py --once          # un seul cycle de collecte (test), sans site web
    python app.py --check-feeds   # vérifie que chaque flux RSS répond
"""
import logging
import sys
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

import collector

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("veille-piratage")


def main():
    if "--check-feeds" in sys.argv:
        collector.check_feeds()
        return
    if "--once" in sys.argv:
        n = collector.run_once()
        log.info("Terminé : %s événement(s) ajouté(s).", n)
        return

    log.info("Démarrage (collecte toutes les %s min)", collector.INTERVAL_MINUTES)
    sched = BackgroundScheduler()
    sched.add_job(
        collector.run_once,
        "interval",
        minutes=collector.INTERVAL_MINUTES,
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(timezone.utc),  # premier cycle immédiat
    )
    sched.start()

    import web  # importé ici pour que --once n'exige pas Flask

    web.serve()


if __name__ == "__main__":
    main()
