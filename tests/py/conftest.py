# tests/py/conftest.py
import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, os.path.join(ROOT, "api", "py"))
