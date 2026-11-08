"""Evaluate actual mixed-version XLSX formulas with LibreOffice, not a mocked evaluator."""
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess,os
from openpyxl import load_workbook
subprocess.run(['node','tests/scoring.cjs'],check=True)
base=load_workbook('/tmp/vl3-scoring-fixture.xlsx');s=base['教師評分']
assert [s.cell(n,35).value for n in range(2,7)]==[29,32,32,32,32]
assert s['AG3'].value=='不適用' and s['T2'].value=='不適用'
manual={}
for v in s.data_validations.dataValidation:
 cell=str(v.sqref);manual[cell]=int(v.formula2);s[cell]=int(v.formula2)
with TemporaryDirectory(prefix='vl3-calc-') as folder:
 root=Path(folder);out=root/'out';out.mkdir();cases={}
 cases['valid']=(None,None)
 for cell in ['AG2','E2','W2','AA3','W3']:
  for value in [-1,99,.5,'wrong',None,0]:cases[f'case{len(cases)}']=(cell,value)
 for name,(cell,value) in cases.items():
  sheet=base.copy_worksheet(s);sheet.title=name
  if cell:sheet[cell]=value
 source=root/'cases.xlsx';base.save(source)
 command=['soffice',f'-env:UserInstallation={(root/"profile").as_uri()}','--headless','--convert-to','xlsx:Calc MS Excel 2007 XML','--outdir',str(out),str(source)]
 subprocess.run(command,check=True,timeout=120)
 w=load_workbook(out/'cases.xlsx',data_only=True)
 for name,(cell,value) in cases.items():
  t=w[name]
  if not cell:
   assert t['AE2'].value==29 and t['AE3'].value==32 and t['AF2'].value=='評分完成',(name,t['AE2'].value,t['AE3'].value)
  else:
   row=int(cell[2:] if cell.startswith('AG') or cell.startswith('AA') else cell[1:]);result=t.cell(row,31).value
   if value==0:assert isinstance(result,(int,float)),(cell,value,result)
   else:assert not isinstance(result,(int,float)),(cell,value,result)
print('PASS: LibreOffice recalculates true mixed-version XLSX, current29/legacy32, valid/blank/zero/negative/over-limit/fraction/text gates; N/A columns do not block')
