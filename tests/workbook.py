"""Validate the actual workbook downloaded by the browser smoke test."""
import re
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from openpyxl import load_workbook

path='/tmp/vl3-records.xlsx'
with ZipFile(path) as z:
    assert z.testzip() is None
    for name in z.namelist():
        if name.endswith(('.xml','.rels')): ET.fromstring(z.read(name))
    assert any(n.startswith('xl/media/') for n in z.namelist())
w=load_workbook(path)
assert w.sheetnames==['學生探究答案','四組觀察紀錄','延伸量度與棒形圖','教師評分','評分準則','操作事件紀錄','原始與遞交快照','裝置設計圖']
a=w['學生探究答案'];s=w['教師評分'];o=w['四組觀察紀錄']
assert a['B2'].value=='陳小明'
assert '仍向光彎曲' in a['F2'].value
assert '被動生長' in a['G2'].value
assert a['H2'].font.color.rgb=='FF00834A'
assert a['E2'].font.color.rgb=='FF173E34'
assert '不能確定頂端只負責感光' in a['Q2'].value
assert o['D4'].value=='切去頂端' and '較少伸長' in o['G4'].value
assert len({a[c+'2'].fill.fgColor.rgb for c in ['E','F','H','M','R','N','S']})>=6
assert len(w['裝置設計圖']._images)==2
assert '沒有明顯彎曲' in o['E5'].value and '向左彎曲' in o['F5'].value
assert len(s.data_validations.dataValidation)==10
assert len(s.conditional_formatting)==19
assert len(a.conditional_formatting)==7
assert w.calculation.fullCalcOnLoad and w.calculation.forceFullCalc
assert len(w['評分準則']['A'])>=19
manual=[str(v.sqref).split(':')[0] for v in s.data_validations.dataValidation]
assert all(s[c].value in ('',None) for c in manual)
def number(v):return isinstance(v,(int,float)) and not isinstance(v,bool)
def ev(cell,seen=None):
    seen=set() if seen is None else seen
    assert cell not in seen
    v=s[cell].value
    if not isinstance(v,str) or not v.startswith('='):return '' if v is None else v
    seen=seen|{cell};parts=v[1:].split('"')
    expr=''.join(('"'+p+'"') if i%2 else re.sub(r'\b[A-Z]+[0-9]+\b',lambda m:repr(ev(m[0],seen)),p) for i,p in enumerate(parts))
    expr=re.sub(r'(?<![<>=!])=(?!=)','==',expr)
    funcs={'IF':lambda c,a,b:a if c else b,'AND':lambda *xs:all(xs),'COUNT':lambda *xs:sum(number(x) for x in xs),'SUM':lambda *xs:sum(x for x in xs if number(x)),'ROUND':lambda x,n:round(x,n)}
    return eval(expr,{'__builtins__':{}},funcs)
assert ev('AE2')=='待評／未完成' and ev('Y2')=='待評' and ev('AD2')=='待評'
assert ev('K2')==4 and ev('M2')==1 and ev('S2')==2
for validation in s.data_validations.dataValidation:s[str(validation.sqref).split(':')[0]]=int(validation.formula2)
assert ev('Y2')==24 and ev('AD2')==8 and ev('AE2')==32 and ev('AF2')=='評分完成'
s['AA2']=0;assert ev('AD2')==6 and ev('AE2')==30
s['AA2']=None;assert ev('AD2')=='待評' and ev('AE2')=='待評／未完成'
s['AA2']=2;s['D2']='待提交反思';assert ev('AE2')=='待評／未完成'
def colour_matches(target):
    rules=next(rs for cf,rs in a.conditional_formatting._cf_rules.items() if str(cf.sqref)==target)
    matches=[]
    for rule in rules:
        f=rule.formula[0];refs=re.findall(r'!([A-Z]+[0-9]+)',f)
        if any(not number(ev(ref)) for ref in refs):continue
        f=re.sub(r'INDIRECT\("\'教師評分\'!([A-Z]+[0-9]+)"\)',lambda m:repr(ev(m[1])),f)
        f=re.sub(r'(?<![<>=!])=(?!=)','==',f)
        if eval(f,{'__builtins__':{}},{'AND':lambda *xs:all(xs),'ISNUMBER':number}):matches.append(rule.dxfId)
    return matches
s['E2']=None;assert colour_matches('E2')==[]
s['E2']=2;assert colour_matches('E2')==[0]
s['E2']=0;assert colour_matches('E2')==[1]
s['E2']=1;assert colour_matches('E2')==[2]
print('PASS: actual XLSX archive, XML, eight sheets, embedded design and chart, original hypothesis, first observations, colours, ten manual fields, pending vs zero, six SPS totals, knowledge and overall formulas, conditional colours.')

# All students from isolated browsers belong to one teacher export.
multi=load_workbook('/tmp/vl3-multi.xlsx')
answers=multi['學生探究答案']
assert {answers.cell(r,2).value for r in range(2,answers.max_row+1)}=={'陳小明','李同學'}
assert len(multi['教師評分'].data_validations.dataValidation)==20
print('PASS: one teacher workbook includes both isolated student browsers.')

# Full extension answers, readings, charts, colours and immutable snapshots survive export.
import json
e=w['延伸量度與棒形圖']
assert e['F4'].value==30 and e['I4'].value==35
assert e['J4'].value=='向右彎曲' and e['J5'].value=='向左彎曲'
assert e['M4'].value==35 and e['N4'].value=='向右彎曲'
assert e['I4'].font.color.rgb=='FF00834A'
assert a['Y2'].value=='向左彎曲'  # original extension prediction, not the revised right choice
assert a['AI2'].value=='正向光性'
chunks=w['原始與遞交快照']
r=json.loads(''.join(chunks.cell(i,3).value for i in range(2,chunks.max_row+1)))
assert r['extension']['initialPrediction']['prediction']=='left'
assert r['extension']['firstReadings']['readings']['G']['angle']==30
assert r['extension']['readings']['G']['angle']==35
assert r['finalAnswers']['extension']['readings']['G']['angle']==35
assert 'reflection_submitted' in [ev['type'] for ev in r['events']]
assert len({r['id']})==1
print('PASS: original agar prediction, first/final angles, directions, chart values, answer colours and full event/snapshot payload.')
