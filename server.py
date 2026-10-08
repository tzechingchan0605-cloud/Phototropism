#!/usr/bin/env python3
"""Same-origin VL3 server with durable SQLite records and teacher sessions."""
import argparse
import getpass
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import sqlite3
import threading
import time
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('VL3_DATA_DIR', ROOT / '.data'))
TEACHER = 'tzechingchan0605@gmail.com'
MODULE = 'VL_BIO_PHOTOTROPISM'
FIELDS = ['observation','hypothesisPart','hypothesisOutcome','reason','controlPlan','setupDescription','qTip','qCap','qBelow','qLimit','evidence','reflection']
PUBLIC = {'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js','/excel.js':'excel.js','/i18n.js':'i18n.js','/i18n-strings.js':'i18n-strings.js','/inquiry.js':'inquiry.js','/tip-inquiry.js':'tip-inquiry.js','/cloud-config.js':'cloud-config.js','/cloud-bridge.js':'cloud-bridge.js','/cloud-sync.js':'cloud-sync.js'}
SESSIONS = {}
ATTEMPTS = {}
LOCK = threading.Lock()

def setup():
    DATA.mkdir(parents=True, exist_ok=True, mode=0o700)
    password_file = DATA / 'teacher-password'
    if not os.environ.get('VL3_TEACHER_PASSWORD') and not password_file.exists():
        with password_file.open('x') as f:
            os.chmod(password_file, 0o600)
            f.write(secrets.token_urlsafe(32))
    with database() as db:
        db.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, sequence INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')
        db.execute('PRAGMA journal_mode=WAL')

def database():
    return sqlite3.connect(DATA / 'records.sqlite3', timeout=15)

def password():
    return os.environ.get('VL3_TEACHER_PASSWORD') or (DATA / 'teacher-password').read_text().strip()

def record_valid(r):
    if not isinstance(r, dict) or r.get('moduleId') != MODULE or r.get('schemaVersion') != 1:
        return False
    if not isinstance(r.get('id'), str) or len(r['id']) > 100:
        return False
    p, f = r.get('profile'), r.get('form')
    if not isinstance(p, dict) or not all(isinstance(p.get(k), str) and 0 < len(p[k]) <= 254 for k in ['name','classInfo','email']):
        return False
    version = r.get('experimentVersion', 0)
    simplified = isinstance(version, int) and version >= 6
    required_fields = [k for k in FIELDS if k != 'qLimit' or not simplified]
    if p['email'].lower() == TEACHER or not isinstance(f, dict) or not all(isinstance(f.get(k), str) for k in required_fields):
        return False
    v = r.get('variables')
    if not isinstance(v, dict) or not all(isinstance(v.get(k), list) and all(isinstance(n, int) and 0 <= n <= 5 for n in v[k]) for k in ['iv','dv','cv']):
        return False
    if not isinstance(r.get('events'), list) or not isinstance(r.get('assumptions'), list):
        return False
    if not isinstance(r.get('setup'), dict) or not isinstance(r.get('observations'), dict) or not isinstance(r.get('phaseDurations'), dict):
        return False
    original = r.get('initialDesign')
    return original is None or isinstance(original, dict) and isinstance(original.get('form'), dict) and isinstance(original['form'].get('reason'), str)

class Handler(BaseHTTPRequestHandler):
    server_version = 'VL3'

    def log_message(self, *_):
        pass  # Never log passwords, session tokens, or student payloads.

    def send_json(self, status, value, extra=None):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if extra:
            for key, value in extra.items(): self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        try:
            jar = cookies.SimpleCookie(self.headers.get('Cookie', ''))
            token = jar['vl3_teacher'].value if 'vl3_teacher' in jar else ''
        except cookies.CookieError:
            return False
        with LOCK:
            deadline = SESSIONS.get(token, 0)
        return deadline > time.time()

    def same_origin(self):
        # No CORS: only the website serving this API can submit records/login.
        origin = self.headers.get('Origin')
        return origin is None or urlsplit(origin).netloc == self.headers.get('Host')

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/health':
            with database() as db: db.execute('SELECT 1').fetchone()
            return self.send_json(200, {'status':'ok','sharedRecords':True})
        if path == '/api/records':
            if not self.authorized(): return self.send_json(401, {'error':'teacher_login_required'})
            with database() as db:
                rows = [json.loads(row[0]) for row in db.execute('SELECT payload FROM records ORDER BY updated_at, id')]
            return self.send_json(200, {'records':rows})
        if path not in PUBLIC:
            return self.send_json(404, {'error':'not_found'})
        file = ROOT / PUBLIC[path]
        data = file.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', {'html':'text/html; charset=utf-8','css':'text/css; charset=utf-8','js':'text/javascript; charset=utf-8'}[file.suffix[1:]])
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-cache')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','same-origin')
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if not self.same_origin(): return self.send_json(403, {'error':'origin_rejected'})
        if self.headers.get('Content-Type','').split(';')[0] != 'application/json':
            return self.send_json(415, {'error':'json_required'})
        try:
            length = int(self.headers.get('Content-Length','0'))
            if not 0 < length <= 12_000_000: return self.send_json(413, {'error':'payload_too_large'})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict): raise ValueError()
        except (ValueError, UnicodeDecodeError):
            return self.send_json(400, {'error':'invalid_json'})
        path = urlsplit(self.path).path
        if path == '/api/teacher/login':
            ip = self.client_address[0]
            now = time.time()
            with LOCK:
                recent = [t for t in ATTEMPTS.get(ip, []) if now-t < 60]
                if len(recent) >= 10: return self.send_json(429, {'error':'retry_later'})
                ATTEMPTS[ip] = recent + [now]
            provided = data.get('password')
            if data.get('email') != TEACHER or not isinstance(provided, str) or not hmac.compare_digest(provided.encode(),password().encode()):
                return self.send_json(401, {'error':'invalid_credentials'})
            token = secrets.token_urlsafe(32)
            with LOCK:
                expired = [key for key, deadline in SESSIONS.items() if deadline < now]
                for key in expired: SESSIONS.pop(key, None)
                SESSIONS[token] = now + 8*3600
            secure = '; Secure' if os.environ.get('VL3_SECURE_COOKIES') == '1' else ''
            return self.send_json(200, {'status':'authenticated'}, {'Set-Cookie':f'vl3_teacher={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800{secure}'})
        if path == '/api/teacher/logout':
            jar = cookies.SimpleCookie(self.headers.get('Cookie',''))
            with LOCK:
                if 'vl3_teacher' in jar: SESSIONS.pop(jar['vl3_teacher'].value,None)
            return self.send_json(200, {'status':'logged_out'}, {'Set-Cookie':'vl3_teacher=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})
        if path == '/api/records/import':
            if not self.authorized(): return self.send_json(401, {'error':'teacher_login_required'})
            rows = data.get('records')
            if not isinstance(rows,list) or not all(record_valid(r) for r in rows): return self.send_json(400, {'error':'invalid_records'})
            imported=0
            with database() as db:
                for record in rows:
                    old=db.execute('SELECT payload FROM records WHERE id=?',(record['id'],)).fetchone()
                    if old and str(json.loads(old[0]).get('savedAt') or '') >= str(record.get('savedAt') or ''): continue
                    db.execute('INSERT INTO records(id,token_hash,sequence,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=CURRENT_TIMESTAMP', (record['id'],secrets.token_hex(32),0,json.dumps(record,ensure_ascii=False)))
                    imported+=1
            return self.send_json(200, {'imported':imported})
        if path == '/api/records':
            record, token, sequence = data.get('record'), data.get('writeToken'), data.get('sequence')
            if not record_valid(record) or not isinstance(token,str) or not 32 <= len(token) <= 200 or not isinstance(sequence,int) or sequence < 1:
                return self.send_json(400, {'error':'invalid_record'})
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            with database() as db:
                db.execute('BEGIN IMMEDIATE')
                existing=db.execute('SELECT token_hash,sequence,payload FROM records WHERE id=?',(record['id'],)).fetchone()
                if existing:
                    if not hmac.compare_digest(existing[0],token_hash): return self.send_json(403, {'error':'record_owner_mismatch'})
                    if sequence <= existing[1]: return self.send_json(200, {'status':'unchanged'})
                    previous=json.loads(existing[2])
                    original=previous.get('initialDesign')
                    # Preserve the first pre-experiment snapshot even on retries.
                    if original is not None: record['initialDesign']=original
                    first=previous.get('firstObservations')
                    if first is not None: record['firstObservations']=first
                    if isinstance(previous.get('tipInquiry'),dict):
                        inquiry=record.get('tipInquiry')
                        if not isinstance(inquiry,dict):
                            inquiry=previous['tipInquiry'].copy()
                            record['tipInquiry']=inquiry
                        for field in ['initialPrediction','firstObservations','firstAnalysis']:
                            if previous['tipInquiry'].get(field) is not None:
                                inquiry[field]=previous['tipInquiry'][field]
                db.execute('INSERT INTO records(id,token_hash,sequence,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET sequence=excluded.sequence,payload=excluded.payload,updated_at=CURRENT_TIMESTAMP', (record['id'],token_hash,sequence,json.dumps(record,ensure_ascii=False)))
            return self.send_json(200, {'status':'saved','id':record['id']})
        return self.send_json(404, {'error':'not_found'})

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=int(os.environ.get('PORT','8000')))
    parser.add_argument('--host',default='0.0.0.0')
    parser.add_argument('--set-teacher-password',action='store_true')
    parser.add_argument('--export-records',action='store_true',help='Export the existing SQLite records as JSON to stdout for migration')
    args=parser.parse_args()
    setup()
    if args.export_records:
        with database() as db: rows=[json.loads(row[0]) for row in db.execute('SELECT payload FROM records')]
        print(json.dumps({'moduleId':MODULE,'records':rows},ensure_ascii=False))
    elif args.set_teacher_password:
        new=getpass.getpass('New teacher password (at least 12 characters): ')
        if len(new)<12 or new!=getpass.getpass('Confirm password: '): raise SystemExit('Password too short or confirmation mismatch.')
        path=DATA/'teacher-password'
        path.write_text(new)
        os.chmod(path,0o600)
        print('Teacher password updated. Restart the server to end existing sessions.')
    else:
        print(f'VL3 shared-record server listening on port {args.port}. Database directory: {DATA}',flush=True)
        ThreadingHTTPServer((args.host,args.port),Handler).serve_forever()
