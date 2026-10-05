"""Inspect actual isolated browser exports, including every workbook part and PDF text."""
from pathlib import Path
from subprocess import run
from zipfile import ZipFile
from openpyxl import load_workbook

with ZipFile('/tmp/vl3-language-cmi.xlsx') as cmi, ZipFile('/tmp/vl3-language-emi.xlsx') as emi:
    assert cmi.testzip() is None and emi.testzip() is None
    assert cmi.namelist() == emi.namelist()
    for name in cmi.namelist():
        assert cmi.read(name) == emi.read(name), name
    assert any(name.startswith('xl/media/') for name in cmi.namelist())
w = load_workbook('/tmp/vl3-language-emi.xlsx')
assert len(w.sheetnames) == 8 and '教师评分' not in w.sheetnames
answers = w['學生探究答案']
row = next(row for row in answers.iter_rows(min_row=2) if row[1].value == '光源')
headers = {cell.value:cell.column - 1 for cell in answers[1]}
for header, expected in [('姓名','光源'),('班別','學生棒形圖'),('初步觀察','我觀察到……'),('原始理由','光源'),('對照組設計','向左彎曲'),('裝置文字設計','學生實驗裝置設計'),('學習反思','我的理由')]:
    assert row[headers[header]].value == expected, header
assert '頂端以下位置' in row[headers['原始假說']].value
assert '而其他部位仍然受光' in row[headers['原始假說']].value
assert w.calculation.fullCalcOnLoad
assert any(isinstance(cell.value,str) and cell.value.startswith('=') for row in w['教師評分'] for cell in row)
texts = {}
for language in ('cmi','emi'):
    path = Path(f'/tmp/vl3-language-{language}.pdf')
    assert path.read_bytes().startswith(b'%PDF-')
    texts[language] = run(['pdftotext','-layout',str(path),'-'],capture_output=True,text=True,check=True).stdout
assert 'Reference answer' in texts['emi'] and 'Reference notes' in texts['emi']
assert 'Why do young shoots grow towards light?' in texts['emi']
assert '參考答案' in texts['cmi'] and '學習反思' in texts['cmi']
for language,text in texts.items():
    compact = ''.join(text.split())
    for answer in ['光源','學生棒形圖','學生實驗裝置設計','向右彎曲','我的理由']:
        assert answer in compact, (language,answer)
assert 'SPS' not in texts['emi']
print('PASS: actual Chinese/English PDFs preserve original student text and translate references; all XLSX parts, Chinese answers, formulas and images are identical.')
