"""Isolated Google-service simulations and legacy SQLite persistence checks."""
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
for command in [['node','tests/cloud_setup.cjs'],['node','tests/cloud.cjs'],['python3','tests/workbook.py'],['python3','tests/backend.py']]:
    subprocess.run(command,cwd=ROOT,check=True)
