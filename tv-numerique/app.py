"""Point d'entrée : planificateur en arrière-plan + interface web de validation.

    python app.py          # lance le bot et l'interface web
    python app.py --once   # un seul cycle de collecte (test), sans interface
    python app.py --check-feeds   # vérifie que chaque flux RSS répond
"""
import logging
import sys
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

import bot

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tv-numerique")


def main():
    if "--check-feeds" in sys.argv:
        bot.check_feeds()
        return
    if "--once" in sys.argv:
        n = bot.run_once()
        log.info("Terminé : %s post(s) généré(s).", n)
        return

    log.info(
        "Démarrage (DRY_RUN=%s, REVIEW_MODE=%s, cycle toutes les %s h)",
        bot.DRY_RUN,
        bot.REVIEW_MODE,
        bot.INTERVAL_HOURS,
    )
    sched = BackgroundScheduler()
    sched.add_job(
        bot.run_once,
        "interval",
        hours=bot.INTERVAL_HOURS,
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(timezone.utc),  # premier cycle immédiat
    )
    sched.start()

    import web  # importé ici pour que --once n'exige pas Flask

    web.serve()


if __name__ == "__main__":
    main()
