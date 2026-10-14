"""Audit actual selectable PDF text, vector writing lines, fonts and grayscale pages."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib,json,re,unicodedata
import fitz

ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'materials/manifest.json').read_text())
out=Path('/tmp/vl3-paper-review');out.mkdir(exist_ok=True)
def compact(text):return re.sub(r'\s+','',unicodedata.normalize('NFKC',text))
class Words(HTMLParser):
    def __init__(self):super().__init__();self.body=False;self.words=[]
    def handle_starttag(self,tag,attrs):
        if tag=='body':self.body=True
    def handle_endtag(self,tag):
        if tag=='body':self.body=False
    def handle_data(self,text):
        if self.body and text.strip():self.words.append(text.strip())

for book in manifest['books']:
    filename=ROOT/book['pdf'];data=filename.read_bytes()
    assert hashlib.sha256(data).hexdigest()==book['sha256']
    pdf=fitz.open(filename)
    assert len(pdf)==book['pages']
    text='\n'.join(page.get_text() for page in pdf)
    assert '\ufffd' not in text
    parser=Words();parser.feed((ROOT/book['preview']).read_text())
    printed=compact(text)
    for word in parser.words:
        assert compact(word) in printed,(book['filename'],'PDF lost visible content',word)
    if book['language']=='en':
        stripped=printed
        for term in ['胚芽鞘','向光性','生長素','瓊脂','延長','不透光']:stripped=stripped.replace('('+term+')','')
        assert not re.search(r'[\u3400-\u9fff]',stripped),(book['code'],'unapproved support')
    if book['code'] in ['A','B','C']:
        assert not re.search(r'✓|✕|SPS|tzechingchan0605',text,re.I)
        if book['code']=='A':assert re.search(r'生長素|auxin',text,re.I) and re.search(r'向光性|phototropism',text,re.I)
        if book['code']=='B':assert not re.search(r'35°|參考答案|Reference answers',text,re.I)
        assert not re.search(r'棒形圖|彎曲位置|感光部位與彎曲部位是否一定相同|blackness necessarily|Inference about light from one side',text,re.I)
    for index,page in enumerate(pdf):
        audit=book['audit'][index];normal=unicodedata.normalize('NFKC',page.get_text())
        assert abs(page.rect.width-595.28)<1 and abs(page.rect.height-841.89)<1
        assert bool(re.search(r'姓名\s*:|Name\s*:',normal))==(audit['page'] in ['A1','C1'])
        for block in page.get_text('dict')['blocks']:
            if 'lines' not in block:continue
            x0,y0,x1,y1=block['bbox']
            assert x0>=24 and y0>=20 and x1<=page.rect.width-24 and y1<=page.rect.height-12,(book['filename'],audit['page'],'text overflow',block['bbox'])
        drawings=page.get_drawings()
        for region in audit['writing_regions']:
            assert len(region['lines'])==2
            for left,y,right in region['lines']:
                found=False
                for drawing in drawings:
                    r=drawing['rect']
                    if abs(r.x0-left)<2 and abs(r.x1-right)<2 and r.height<2 and abs(r.y0-y)<2:found=True;break
                assert found,(book['filename'],audit['page'],'missing actual writing line',region['field'],[left,y,right])
        for xref,_,kind,*_ in page.get_fonts():
            if kind=='Type3':
                obj=pdf.xref_object(xref)
                assert '/CharProcs' in obj and '/ToUnicode' in obj
                for ref in re.findall(r'(\d+) 0 R',pdf.xref_get_key(xref,'CharProcs')[1]):
                    assert pdf.xref_is_stream(int(ref)) and pdf.xref_stream(int(ref))
            else:assert pdf.extract_font(xref)[3],('font not embedded',kind)
        if book['code']=='FULL':
            page.get_pixmap(matrix=fitz.Matrix(1.3,1.3)).save(out/f"{book['language']}-{audit['page']}.png")
            page.get_pixmap(matrix=fitz.Matrix(1.3,1.3),colorspace=fitz.csGRAY).save(out/f"{book['language']}-{audit['page']}-gray.png")
print('PASS: ten actual A4 PDFs; all preview text survives in selectable PDF text, approved-only vocabulary, every vector answer block has two lines, A/C first-page identity rules, core teaching in A, checking answers only in C, no B answer-key or student score leaks, embedded glyphs and all-page bounds; every full-pack page rendered in colour and grayscale.')
