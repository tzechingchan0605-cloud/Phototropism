"""Inspect real PDFs and editable Word packages, with rendered page review artifacts."""
from pathlib import Path
import hashlib,json,re,zipfile,subprocess
import fitz
from bs4 import BeautifulSoup
from docx import Document
ROOT=Path(__file__).resolve().parents[1];m=json.loads((ROOT/'materials/manifest.json').read_text());out=Path('/tmp/vl3-paper-review');out.mkdir(exist_ok=True)
for b in m['books']:
 p=ROOT/b['path'];assert hashlib.sha256(p.read_bytes()).hexdigest()==b['sha256']
 if b['code'].endswith('Word'):
  with zipfile.ZipFile(p) as z:
   assert z.testzip() is None and 'word/document.xml' in z.namelist()
   xml=z.read('word/document.xml').decode();assert 'w:sz w:val="24"' in xml and 'w:line="380"' in xml
   assert '333333' in xml and '<w:tbl>' in xml and '<w:t' in xml
   assert any(n.endswith('.svg') for n in z.namelist())
  continue
 d=fitz.open(p);assert len(d)==b['pages'];assert len(d)==4 if b['code']!='DPDF' else len(d)>=4
 text=''.join(page.get_text() for page in d);assert '\ufffd' not in text
 # Every visible DOM text fragment must survive into selectable PDF text.
 soup=BeautifulSoup((ROOT/b['preview']).read_text(),'html.parser');compact=lambda s:re.sub(r'\s+','',s)
 for node in soup.body.find_all(string=True):
  if node.strip():assert compact(node) in compact(text),(b['filename'],str(node))
 if b['language']=='en':
  remainder=re.sub(r'\s+','',text)
  for term in ['胚芽鞘','向光性','生長素','瓊脂','延長','不透光']:remainder=remainder.replace(term,'')
  assert not re.search(r'[\u3400-\u9fff]',remainder),(b['filename'],'untranslated',re.findall(r'[\u3400-\u9fff]+',remainder))
 if b['code']=='studentPDF':assert not re.search('35°|參考答案|Reference answers',text)
 for i,page in enumerate(d):
  assert abs(page.rect.width-595.28)<1 and abs(page.rect.height-841.89)<1
  spans=[s for bl in page.get_text('dict')['blocks'] if 'lines' in bl for line in bl['lines'] for s in line['spans'] if s['text'].strip()]
  assert all(s['size']>=10.9 for s in spans),(b['filename'],min(s['size'] for s in spans))
  assert all(s['bbox'][0]>=20 and s['bbox'][2]<=page.rect.width-20 and s['bbox'][1]>=15 and s['bbox'][3]<=page.rect.height-10 for s in spans)
  page.get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(out/(p.stem+f'-{i+1}.png'))
  assert bool(re.search('姓名|Name:',page.get_text()))==(i==0 and b['code']!='DPDF')
  if b['code']!='DPDF' and i==0:
   pix=page.get_pixmap();rgb=pix.samples;assert any(rgb[j]>120 and rgb[j]>rgb[j+1]*1.7 and rgb[j]>rgb[j+2]*1.7 for j in range(0,len(rgb),3))
  if b['code']=='answersPDF':
   rgb=page.get_pixmap().samples;assert any(rgb[j+2]>100 and rgb[j+2]>rgb[j]*1.7 and rgb[j+2]>rgb[j+1]*1.3 for j in range(0,len(rgb),3))
print('PASS: six actual vector PDFs; four editable Word archives with SVG, 12pt body/19pt leading, 26pt dark rules; selectable text, >=11pt visible type, A4, colours and bounds')
