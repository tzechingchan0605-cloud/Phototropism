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
                # Exercise the allowlisted scripts with only a temporary database.
                for asset in ['tip-inquiry.js','i18n.js','i18n-strings.js']:
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/{asset}') as response:
                        self.assertEqual(response.status,200)
                        self.assertEqual(response.headers.get_content_type(),'text/javascript')
                        self.assertEqual(response.read(),(ROOT/asset).read_bytes())
                fixture={
                    'moduleId':'VL_BIO_PHOTOTROPISM','schemaVersion':1,'experimentVersion':5,
                    'id':'backend-test-'+secrets.token_hex(8),
                    'savedAt':'2026-10-05T01:00:00Z',
                    'profile':{'name':'後端測試','classInfo':'S4','email':'backend@example.com'},
                    'form':{key:'測試答案' for key in ['observation','hypothesisPart','hypothesisOutcome','reason','controlPlan','setupDescription','qTip','qCap','qBelow','qLimit','evidence','reflection']},
                    'variables':{'iv':[0],'dv':[1],'cv':[2]},'events':[],'assumptions':[],
                    'setup':{},'observations':{'D':'straight'},'phaseDurations':{},
                    'initialDesign':{'form':{'reason':'原始理由'}},'firstObservations':{'D':'straight'},
                    'tipInquiry':{
                        'unlocked':True,'hasRun':True,
                        'initialPrediction':{'at':'2026-10-05T01:10:00Z','prediction':'A 彎曲，C 直立','reason':'尖端接收光刺激','fair':'只改變尖端是否保留'},
                        'observations':{'A':{'growth':'normal','direction':'toward'},'C':{'growth':'limited','direction':'straight'}},
                        'firstObservations':{'at':'2026-10-05T01:20:00Z','observations':{'A':{'growth':'normal','direction':'toward'},'C':{'growth':'limited','direction':'straight'}}},
                        'firstAnalysis':{'at':'2026-10-05T01:30:00Z','answers':{'tipConclusion':'尖端與反應有關'},'evidence':'A 與 C 的觀察比較'},
                    },
                }
                token=secrets.token_urlsafe(32)
                envelope={'record':fixture,'writeToken':token,'sequence':1}
                self.assertEqual(request('/api/records',envelope)[0],200)
                modified=json.loads(json.dumps(fixture));modified['initialDesign']['form']['reason']='OVERWRITE';modified['firstObservations']['D']='bend'
                for field in ['initialPrediction','firstObservations','firstAnalysis']:
                    modified['tipInquiry'][field]={'overwritten':True}
                modified['tipInquiry']['observations']['C']['growth']='none'
                self.assertEqual(request('/api/records',{**envelope,'record':modified,'sequence':2})[0],200)
                omitted=json.loads(json.dumps(modified));omitted.pop('tipInquiry')
                self.assertEqual(request('/api/records',{**envelope,'record':omitted,'sequence':3})[0],200)
                self.assertEqual(request('/api/records',{**envelope,'writeToken':secrets.token_urlsafe(32),'sequence':4})[0],403)
                self.assertEqual(request('/api/records',envelope)[1]['status'],'unchanged')
                self.assertEqual(request('/api/records',envelope,{'Origin':'https://another-site.example'})[0],403)
                status,_,headers=request('/api/teacher/login',{'email':'tzechingchan0605@gmail.com','password':password})
                self.assertEqual(status,200);self.assertIn('HttpOnly',headers['Set-Cookie']);cookie=headers['Set-Cookie'].split(';')[0]
                record=request('/api/records')[1]['records'][0]
                self.assertEqual(record['initialDesign']['form']['reason'],fixture['initialDesign']['form']['reason'])
                self.assertEqual(record['firstObservations'],fixture['firstObservations'])
                for field in ['initialPrediction','firstObservations','firstAnalysis']:
                    self.assertEqual(record['tipInquiry'][field],fixture['tipInquiry'][field])
                self.assertEqual(record['tipInquiry']['observations'],modified['tipInquiry']['observations'])
                self.assertNotIn(token,json.dumps(record))
                # Restart the actual server and verify that SQLite retains answers.
                process.terminate();process.wait();cookie='';process=start()
                status,_,headers=request('/api/teacher/login',{'email':'tzechingchan0605@gmail.com','password':password});cookie=headers['Set-Cookie'].split(';')[0]
                persisted=request('/api/records')[1]['records'][0]
                self.assertEqual(persisted['id'],fixture['id'])
                self.assertEqual(persisted['tipInquiry'],record['tipInquiry'])
                self.assertEqual(request('/api/teacher/logout',{})[0],200);self.assertEqual(request('/api/records')[0],401)
            finally:
                process.terminate();process.wait()
        print('PASS: protected teacher API, owner write tokens, stale retries, immutable tip snapshots with editable observations, public scripts, private files, origin checks, logout, durable data after server restart.')
if __name__=='__main__':unittest.main()
