import logging
from celery import Celery
from app.config import REDIS_URL
from app.services_bot import _bot_automation_iteration_sync

logger = logging.getLogger(__name__)

# Initialize Celery app
celery_app = Celery("moody_tasks", broker=REDIS_URL, backend=REDIS_URL)

# Basic Celery configurations
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Configure periodic execution beat schedule
    beat_schedule={
        "bot-strategy-check-every-60s": {
            "task": "app.tasks.run_bot_strategy_check",
            "schedule": 60.0,
        },
    },
)

@celery_app.task(name="app.tasks.run_bot_strategy_check")
def run_bot_strategy_check():
    """Runs the moving averages strategy check and trading automation loop."""
    logger.info("Executing periodic Celery task: run_bot_strategy_check")
    try:
        _bot_automation_iteration_sync()
        logger.info("Periodic Celery task completed successfully.")
    except Exception as exc:
        logger.error(f"Error executing Celery task: {exc}", exc_info=True)
        raise exc
