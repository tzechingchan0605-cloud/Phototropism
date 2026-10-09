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
assert w.sheetnames==['學生探究答案','定性觀察紀錄','延伸量度與棒形圖','教師評分','評分準則','操作事件紀錄','原始與遞交快照','裝置設計圖']
a=w['學生探究答案'];s=w['教師評分'];o=w['定性觀察紀錄']
# Retain every historical answer column and append the new inquiry fields after AI.
original_headers=['紀錄識別碼','姓名','班別','狀態','初步觀察','原始假說','原始理由','獨立變量','因變量','控制變量','實驗前提','對照組設計','裝置文字設計','感光部位','組別比較','下部遮光反應','證據限制','數據解釋','學習反思','總時間（秒）','初步想法（舊版）','指定比較（舊版）','頂端遮光比較','感光與彎曲位置','延伸原始預測','延伸原始理由','延伸公平比較','E–F 比較','F–G–H 比較','兩側延長與方向','黑暗彎曲推論','延伸證據限制','延伸數據解釋','額外對照（選答）','向光性名稱檢核']
tip_headers=['延伸一原始預測','延伸一原始理由','延伸一公平比較','延伸一證據限制','物質 X 待測想法','延伸一數據解釋']
assert [cell.value for cell in a[1]]==original_headers+tip_headers+['單側光與物質 X 的推論','左側物質 X 的量','左側細胞延長','胚芽鞘彎曲方向']
assert [cell.value for cell in o[1]]==['紀錄識別碼','姓名','組別','處理','第一次觀察','目前觀察','模型典型反應','探究階段']
assert o.max_column==8 and o.max_row==6
assert a['B2'].value=='陳小明'
assert '仍向光彎曲' in a['F2'].value
assert '被動生長' in a['G2'].value
assert a['H2'].font.color.rgb=='FF00834A'
assert a['E2'].font.color.rgb=='FF173E34'
assert a['Q2'].value in (None, '')
assert o['D6'].value=='切去頂端' and o['G6'].value=='沒有'
assert len({a[c+'2'].fill.fgColor.rgb for c in ['E','F','H','M','R','N','S']})>=6
assert len(w['裝置設計圖']._images)==1
assert '沒有明顯彎曲' in o['E4'].value and '向左彎曲' in o['F4'].value
assert [o.cell(row,3).value for row in range(2,7)]==['A','B','C','A','D']
assert [o.cell(row,8).value for row in range(2,7)]==['主探究']*3+['延伸一']*2
assert all(o.cell(5,col).value=='有' for col in (5,6,7))
assert all(o.cell(6,col).value=='沒有' for col in (5,6,7))
assert o['F5'].font.color.rgb==o['F6'].font.color.rgb=='FF00834A'
assert len(s.data_validations.dataValidation)==11
assert len(s.conditional_formatting)==20
assert len(a.conditional_formatting)==9
assert {str(cf.sqref) for cf in a.conditional_formatting}=={'E2','F2','G2','L2','M2','R2','S2','AJ2','AK2'}
assert a['AJ2'].value=='延長表現相近'
assert a['AK2'].value=='我預測沒有頂端也可同樣延長。'
assert a['AL2'].value in (None, '')
assert a['AM2'].value in (None, '')
assert a['AN2'].value in (None, '')
assert a['AO2'].value in (None, '')
assert a['R2'].value in (None, '')
assert a['AP2'].value in (None, '')
assert a['AJ2'].font.color.rgb==a['AK2'].font.color.rgb=='FF173E34'
assert a['AN2'].font.color.rgb=='FF173E34'
assert w.calculation.fullCalcOnLoad and w.calculation.forceFullCalc
assert len(w['評分準則']['A'])>=19
manual=[str(v.sqref).split(':')[0] for v in s.data_validations.dataValidation]
assert manual==['E2','L2','N2','Q2','T2','V2','W2','Z2','AA2','AB2','AC2']
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
for target in ['AJ2','AK2']:
    s['L2']=None;assert colour_matches(target)==[]
    s['L2']=2;assert colour_matches(target)==[0]
    s['L2']=0;assert colour_matches(target)==[1]
    s['L2']=1;assert colour_matches(target)==[2]
print('PASS: actual XLSX archive, XML, eight sheets, preserved answer/observation columns, ABD main and AC tip observations, embedded design and chart, original hypothesis, first observations, colours, ten manual fields in their original positions, pending vs zero, six SPS totals, knowledge and overall formulas, conditional colours.')

# All students from isolated browsers belong to one teacher export.
multi=load_workbook('/tmp/vl3-multi.xlsx')
answers=multi['學生探究答案']
assert {answers.cell(r,2).value for r in range(2,answers.max_row+1)}=={'陳小明','李同學'}
assert len(multi['教師評分'].data_validations.dataValidation)==22
for name in ['陳小明','李同學']:
    rows=[row for row in multi['定性觀察紀錄'].iter_rows(min_row=2) if row[1].value==name]
    assert [row[2].value for row in rows]==['A','B','C','A','D']
    assert [row[7].value for row in rows]==['主探究']*3+['延伸一']*2
print('PASS: one teacher workbook includes both isolated student browsers.')

# Full extension answers, readings, charts, colours and immutable snapshots survive export.
import json
e=w['延伸量度與棒形圖']
assert e['F4'].value==30 and e['I4'].value==35
assert e['J4'].value=='向右彎曲' and e['J5'].value=='向左彎曲'
assert e['M4'].value in (None, '') and e['N4'].value in (None, '')
assert e['I4'].font.color.rgb=='FF00834A'
assert a['Y2'].value=='向左彎曲'  # original extension prediction, not the revised right choice
assert a['AI2'].value in (None, '')
assert a['AD2'].value in (None, '')
assert [a[c+'2'].value for c in ('AQ','AR','AS')]==['多','多','右']
assert all(a[c+'2'].font.color.rgb=='FF00834A' for c in ('AQ','AR','AS'))
chunks=w['原始與遞交快照']
r=json.loads(''.join(chunks.cell(i,3).value for i in range(2,chunks.max_row+1)))
assert r['experimentVersion']==17
assert 'extLightInference' not in r['form']
assert list(r['observations'])==list(r['firstObservations'])==['A','B','D']
assert r['firstObservations']['D']['direction']=='straight'
assert r['observations']['D']['direction']=='left'
tip=r['tipInquiry']
assert tip['unlocked'] and tip['hasRun']
assert tip['initialPrediction']['prediction']=='same'
assert tip['initialPrediction']['reason']=='我預測沒有頂端也可同樣延長。'
assert 'fair' not in tip['initialPrediction']
assert r['form']['tipPrediction']=='less'
assert r['form']['tipReason']=='修訂：頂端可能提供生長訊號。'
assert tip['firstObservations']['observations']==tip['observations']=={'A':{'growth':'clear'},'C':{'growth':'none'}}
assert tip['firstAnalysis']['answers']=={'qCap':'tipRole'}
assert 'evidence' not in tip['firstAnalysis']
assert 'tipEvidence' not in r['form']
assert r['finalAnswers']['tipInquiry']==tip
assert r['finalAnswers']['observations']==r['observations']
assert r['finalAnswers']['form']['tipPrediction']=='less'
assert r['finalAnswers']['form']['tipReason']==r['form']['tipReason']
assert 'tipEvidence' not in r['finalAnswers']['form']
assert r['extension']['initialPrediction']['prediction']=='left'
assert r['extension']['firstReadings']['readings']['G']['angle']==30
assert r['extension']['readings']['G']['angle']==35
assert r['finalAnswers']['extension']['readings']['G']['angle']==35
assert 'reflection_submitted' in [ev['type'] for ev in r['events']]
assert {'tip_experiment_started','tip_experiment_completed','tip_observations_confirmed','agar_extension_opened'} <= {ev['type'] for ev in r['events']}
assert len({r['id']})==1
print('PASS: immutable tip prediction/reason/fair comparison, first tip observations/analysis, revised answers and submitted snapshot, original agar prediction, first/final angles, directions, chart values, answer colours and full event/snapshot payload.')
