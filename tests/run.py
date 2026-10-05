"""Run browser, actual XLSX, and persistence tests against an isolated database."""
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request
ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='vl3-tests-') as data:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    environment={**os.environ,'VL3_DATA_DIR':data,'LAB_URL':f'http://127.0.0.1:{port}','VL3_TEST_PASSWORD_FILE':str(Path(data)/'teacher-password')}
    # The test server generates a private temporary credential, never a default password.
    environment.pop('VL3_TEACHER_PASSWORD',None)
    process=subprocess.Popen(['python3','server.py','--host','127.0.0.1','--port',str(port)],cwd=ROOT,env=environment,stdout=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                with urllib.request.urlopen(environment['LAB_URL']+'/api/health') as response:
                    if response.status==200:break
            except OSError:time.sleep(.05)
        else:raise RuntimeError('test server failed to start')
        for command in [['node','tests/smoke.cjs'],['python3','tests/workbook.py'],['python3','tests/backend.py']]:
            subprocess.run(command,cwd=ROOT,env=environment,check=True)
    finally:
        process.terminate();process.wait()
