"""Shared state and configuration."""
import tempfile
from typing import Any, Dict

SESSIONS: Dict[str, Dict[str, Any]] = {}
DEPLOY_DIR = tempfile.mkdtemp(prefix="dataforge_")
