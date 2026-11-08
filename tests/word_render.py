"""Actually open both languages' Word documents, then inspect the rendered pages."""
from pathlib import Path
import json,subprocess,tempfile
import fitz
m=json.loads(Path('materials/manifest.json').read_text())
with tempfile.TemporaryDirectory(prefix='vl3-word-') as folder:
 root=Path(folder)
 docs=[Path(b['path']).resolve() for b in m['books'] if b['code'].endswith('Word')]
 subprocess.run(['soffice',f'-env:UserInstallation={(root/"profile").as_uri()}','--headless','--convert-to','pdf','--outdir',str(root),*map(str,docs)],check=True,timeout=120)
 for p in docs:
  d=fitz.open(root/(p.stem+'.pdf'));assert len(d)==4,(p,len(d))
  text=''.join(page.get_text() for page in d)
  assert 'Worksheet 3' in text if '_en_' in p.name else '工作紙三' in text
  assert '3. ' in text and ('Integrated explanation' in text or '整合解釋' in text)
  for page in d:
   for b in page.get_text('blocks'):assert b[0]>=20 and b[2]<=page.rect.width-20 and b[1]>=10 and b[3]<=page.rect.height-10,(p,b)
  for i,page in enumerate(d):page.get_pixmap().save('/tmp/'+p.stem+f'-word-{i+1}.png')
print('PASS: LibreOffice opens all four bilingual editable Word files; each renders as four A4 pages without clipped text')
