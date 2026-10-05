"""Exercise durable records, ownership, immutable snapshots, and teacher access."""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
class BackendTest(unittest.TestCase):
    def test_shared_records(self):
        with tempfile.TemporaryDirectory() as data:
            with socket.socket() as sock:
                sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
            password=secrets.token_urlsafe(24)
            environment={**os.environ,'VL3_DATA_DIR':data,'VL3_TEACHER_PASSWORD':password}
            def start():
                process=subprocess.Popen(['python3',str(ROOT/'server.py'),'--host','127.0.0.1','--port',str(port)],env=environment,stdout=subprocess.DEVNULL)
                for _ in range(100):
                    try:
                        if request('/api/health')[0]==200:return process
                    except OSError:time.sleep(.05)
                process.terminate();raise AssertionError('server did not start')
            cookie=''
            def request(path,payload=None,headers=None):
                h={'Content-Type':'application/json',**(headers or {})}
                if cookie:h['Cookie']=cookie
                req=urllib.request.Request(f'http://127.0.0.1:{port}'+path,data=json.dumps(payload).encode() if payload is not None else None,headers=h)
                try:
                    with urllib.request.urlopen(req) as response:return response.status,json.loads(response.read()),response.headers
                except urllib.error.HTTPError as e:return e.code,json.loads(e.read()),e.headers
            process=start()
            try:
                self.assertEqual(request('/api/records')[0],401)
                self.assertEqual(request('/.data/teacher-password')[0],404)
                self.assertEqual(request('/api/teacher/login',{'email':'tzechingchan0605@gmail.com','password':'wrong'})[0],401)
                fixture=json.loads(Path('/tmp/vl3-record.json').read_text())['records'][0]
                fixture['id']='backend-test-'+secrets.token_hex(8)
                token=secrets.token_urlsafe(32)
                envelope={'record':fixture,'writeToken':token,'sequence':1}
                self.assertEqual(request('/api/records',envelope)[0],200)
                modified=json.loads(json.dumps(fixture));modified['initialDesign']['form']['reason']='OVERWRITE';modified['firstObservations']['D']='bend'
                self.assertEqual(request('/api/records',{**envelope,'record':modified,'sequence':2})[0],200)
                self.assertEqual(request('/api/records',{**envelope,'writeToken':secrets.token_urlsafe(32),'sequence':3})[0],403)
                self.assertEqual(request('/api/records',envelope)[1]['status'],'unchanged')
                self.assertEqual(request('/api/records',envelope,{'Origin':'https://another-site.example'})[0],403)
                status,_,headers=request('/api/teacher/login',{'email':'tzechingchan0605@gmail.com','password':password})
                self.assertEqual(status,200);self.assertIn('HttpOnly',headers['Set-Cookie']);cookie=headers['Set-Cookie'].split(';')[0]
                record=request('/api/records')[1]['records'][0]
                self.assertEqual(record['initialDesign']['form']['reason'],fixture['initialDesign']['form']['reason'])
                self.assertEqual(record['firstObservations'],fixture['firstObservations'])
                self.assertNotIn(token,json.dumps(record))
                # Restart the actual server and verify that SQLite retains answers.
                process.terminate();process.wait();cookie='';process=start()
                status,_,headers=request('/api/teacher/login',{'email':'tzechingchan0605@gmail.com','password':password});cookie=headers['Set-Cookie'].split(';')[0]
                self.assertEqual(request('/api/records')[1]['records'][0]['id'],fixture['id'])
                self.assertEqual(request('/api/teacher/logout',{})[0],200);self.assertEqual(request('/api/records')[0],401)
            finally:
                process.terminate();process.wait()
        print('PASS: protected teacher API, owner write tokens, stale retries, original snapshots, private files, origin checks, logout, durable data after server restart.')
if __name__=='__main__':unittest.main()
