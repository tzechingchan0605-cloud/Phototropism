"""Editable OOXML from the same WS pages as the vector PDF; SVG plus PNG fallback."""
import sys,io,re
from pathlib import Path
from bs4 import BeautifulSoup, NavigableString
from docx import Document
from docx.shared import Pt,Cm,RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.part import Part
from docx.opc.constants import RELATIONSHIP_TYPE as RT
import cairosvg
soup=BeautifulSoup(Path(sys.argv[1]).read_text(),'html.parser');FONT='Arial' if soup.html.get('lang')=='en' else 'Noto Sans CJK TC';d=Document();sec=d.sections[0]
sec.page_width=Cm(21);sec.page_height=Cm(29.7);sec.top_margin=Cm(1.1);sec.bottom_margin=Cm(1.1);sec.left_margin=sec.right_margin=Cm(1.4)
sec.header_distance=sec.footer_distance=Cm(.5)
st=d.styles['Normal'];st.font.name=FONT;st.font.size=Pt(12);st.element.rPr.rFonts.set(qn('w:eastAsia'),'Noto Sans CJK TC');st.paragraph_format.line_spacing=Pt(19);st.paragraph_format.space_after=Pt(3)
for name,size in [('Heading 1',16),('Heading 2',13),('Heading 3',12)]:
 st=d.styles[name];st.font.name=FONT;st.font.size=Pt(size);st.font.color.rgb=RGBColor.from_string('25666A');st.paragraph_format.line_spacing=Pt(size*1.5);st.paragraph_format.space_after=Pt(3);st.paragraph_format.space_before=Pt(4)
sec.header.paragraphs[0].text=soup.header.get_text(' ',strip=True)
f=sec.footer.paragraphs[0];f.text='VL3 · WS3 | ';fld=OxmlElement('w:fldSimple');fld.set(qn('w:instr'),'PAGE');f._p.append(fld)
for p in [sec.header.paragraphs[0],f]:
 for r in p.runs:r.font.size=Pt(11)
imagecount=0
def runs(p,node,colour=None,bold=False):
 if isinstance(node,NavigableString):
  if not str(node):return
  r=p.add_run(re.sub(r'\s+',' ',str(node)));r.font.name=FONT;r._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'Noto Sans CJK TC');r.font.size=Pt(12);r.bold=bold
  if colour:r.font.color.rgb=RGBColor.from_string(colour)
  if colour=='145DA0':r.underline=True
  return
 if node.name=='br':p.add_run().add_break();return
 cl=node.get('class',[])
 col='145DA0' if 'reference-answer' in cl else 'B7312C' if node.name=='strong' else colour
 for c in node.children:runs(p,c,col,bold or node.name in ['b','strong'])
def para(parent,node,style=None):
 p=parent.add_paragraph(style=style);runs(p,node)
 if 'hint' in node.get('class',[]) or 'design-hint' in node.get('class',[]):
  p.paragraph_format.line_spacing=Pt(16.5)
  for r in p.runs:r.font.size=Pt(11)
 return p
def picture(parent,node,width=18.2,height=None):
 global imagecount
 imagecount+=1;svg=str(node).replace("viewbox=", "viewBox=").replace("textlength=", "textLength=").replace("lengthadjust=", "lengthAdjust=")
 svg=re.sub(r'<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ',svg,1) if not node.get('xmlns') else svg
 png=cairosvg.svg2png(bytestring=svg.encode(),output_width=1600)
 p=parent.add_paragraph();p.paragraph_format.line_spacing=1;p.paragraph_format.space_after=Pt(2)
 view=[float(v) for v in (node.get('viewbox') or node.get('viewBox')).split()]
 if height:
  factor=min(width/view[2],height/view[3]);width,height=view[2]*factor,view[3]*factor
 shape=p.add_run().add_picture(io.BytesIO(png),width=Cm(width),height=Cm(height) if height else None)
 # Office uses the vector source; PNG is a high-resolution compatibility fallback.
 from docx.opc.packuri import PackURI
 part=Part(PackURI(f'/word/media/vector{imagecount}.svg'),'image/svg+xml',svg.encode(),d.part.package)
 rid=d.part.relate_to(part,RT.IMAGE);blip=shape._inline.graphic.graphicData.pic.blipFill.blip
 extlist=OxmlElement('a:extLst');ext=OxmlElement('a:ext');ext.set('uri','{96DAC541-7B7A-43D3-8B79-37D633B846F1}')
 from lxml import etree
 v=etree.Element('{http://schemas.microsoft.com/office/drawing/2016/SVG/main}svgBlip');v.set(qn('r:embed'),rid);ext.append(v);extlist.append(ext);blip.append(extlist)
 return p
def render(parent,node,width=18.2):
 if isinstance(node,NavigableString):
  if node.strip():para(parent,BeautifulSoup('<p>'+str(node)+'</p>','html.parser').p)
  return
 cl=node.get('class',[])
 if node.name=='svg':picture(parent,node,width);return
 if node.name in ['h1','h2','h3']:para(parent,node,'Heading '+node.name[1]);return
 if node.name=='li':
  p=parent.add_paragraph();p.paragraph_format.left_indent=Cm(.45);p.paragraph_format.first_line_indent=Cm(-.45)
  p.add_run('• ');runs(p,node);return
 if node.name in ['p','figcaption'] or 'question' in cl:para(parent,node);return
 if node.name=='table':
  rows=node.find_all('tr',recursive=False) or node.select('tbody > tr');t=parent.add_table(rows=0,cols=len(rows[0].find_all(['th','td'],recursive=False)));t.style='Table Grid';t.autofit=False
  ratios=[.28,.72] if 'variables' in cl else [.12,.88] if 'observations' in cl else [.12,.20,.68]
  for col,ratio in zip(t.columns,ratios):col.width=Cm(width*ratio)
  for tr in rows:
   cells=t.add_row().cells
   for cell,td in zip(cells,tr.find_all(['th','td'],recursive=False)):
    p=cell.paragraphs[0];runs(p,td);p.paragraph_format.space_after=Pt(2);p.paragraph_format.line_spacing=Pt(19)
    if node.get('class')==['variables']:
     cell.width=Cm(width*(.28 if td is tr.find(['th','td']) else .72))
   pr=t.rows[-1]._tr.get_or_add_trPr();pr.append(OxmlElement('w:cantSplit'))
  return
 if 'answer-lines' in cl:
  if node.select_one('.answer-fill'):
   p=para(parent,node.select_one('.answer-fill'));b=OxmlElement('w:pBdr');rule=OxmlElement('w:bottom')
   for k,v in {'val':'single','sz':'8','color':'333333'}.items():rule.set(qn('w:'+k),v)
   b.append(rule);p._p.get_or_add_pPr().append(b);return
  for child in node.find_all('div',recursive=False):
   p=para(parent,child);p.paragraph_format.space_after=Pt(0);p.paragraph_format.line_spacing=Pt(26)
   if not p.text:p.add_run(' ')
   b=OxmlElement('w:pBdr')
   for edge in ['bottom','between']:
    rule=OxmlElement('w:'+edge)
    for k,v in {'val':'single','sz':'8','color':'333333'}.items():rule.set(qn('w:'+k),v)
    b.append(rule)
   p._p.get_or_add_pPr().append(b)
  return
 if 'reflection-response' in cl:
  t=parent.add_table(rows=1,cols=2);t.autofit=False;t.columns[0].width=Cm(3.5);t.columns[1].width=Cm(width-3.8)
  picture(t.cell(0,0),node.svg,3.1,3.5)
  for cell in t.rows[0].cells:cell._element.remove(cell.paragraphs[0]._element)
  render(t.cell(0,1),node.select_one('.answer-lines'),width-3.8);return
 if 'reflection-figure' in cl:picture(parent,node.svg,3.5,3.5);return
 if 'mechanism-svg' in cl:picture(parent,node,width,4);return
 if 'vertical-flow' in cl:
  t=parent.add_table(rows=0,cols=1);t.autofit=False;t.columns[0].width=Cm(14);t.alignment=1
  for step in node.find_all(['div','p'],recursive=False):
   cell=t.add_row().cells[0];cell.width=Cm(14);p=cell.paragraphs[0];runs(p,step);p.alignment=1
   arrow='flow-arrow' in step.get('class',[])
   p.paragraph_format.line_spacing=Pt(14 if arrow else 19);p.paragraph_format.space_before=Pt(0 if arrow else 1.7);p.paragraph_format.space_after=Pt(0 if arrow else 1.7)
   if arrow:
    for r in p.runs:r.font.size=Pt(14)
   else:
    shading=OxmlElement('w:shd');shading.set(qn('w:fill'),step['data-fill']);cell._tc.get_or_add_tcPr().append(shading)
   t.rows[-1]._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
  return
 if 'plant-grid' in cl:
  english=soup.html.get('lang')=='en';initial='initial-setups' in cl
  height=float(node.get('data-diagram-height-en' if english else 'data-diagram-height','3.5'))
  if initial and english:
   figs=node.find_all('figure',recursive=False);t=parent.add_table(rows=1,cols=len(figs));t.autofit=False
   for col in t.columns:col.width=Cm(width/len(figs))
   for index,fig in enumerate(figs):
    cell=t.cell(0,index);cell.width=Cm(width/len(figs));nested=cell.add_table(rows=1,cols=2);nested.autofit=False
    left=(width/len(figs)-.4)*.43;right=(width/len(figs)-.4)*.57
    for c,w in zip(nested.columns,[left,right]):c.width=Cm(w)
    runs(nested.cell(0,0).paragraphs[0],fig.figcaption)
    pic=nested.cell(0,1);pic._element.remove(pic.paragraphs[0]._element);picture(pic,fig.svg,right-.2,height)
    # Word requires paragraphs around nested tables; keep these structural blanks tiny.
    for p in cell.paragraphs:p.paragraph_format.line_spacing=Pt(1);p.paragraph_format.space_after=Pt(0)
    if index<len(figs)-1:
     borders=OxmlElement('w:tcBorders');edge=OxmlElement('w:right')
     for k,v in {'val':'single','sz':'8','color':'91A5A9'}.items():edge.set(qn('w:'+k),v)
     borders.append(edge);cell._tc.get_or_add_tcPr().append(borders)
   t.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'));return
  figs=node.find_all('figure',recursive=False);t=parent.add_table(rows=2,cols=len(figs));t.autofit=False
  for col in t.columns:col.width=Cm(width/len(figs))
  for index,fig in enumerate(figs):
   caption=t.cell(0,index);caption.width=Cm(width/len(figs));p=caption.paragraphs[0];runs(p,fig.figcaption);p.alignment=1
   cell=t.cell(1,index);cell.width=Cm(width/len(figs));cell._element.remove(cell.paragraphs[0]._element)
   picture(cell,fig.select_one('.plant-pair > svg'),width/len(figs)-.4,height)
   if (initial or len(figs)==3) and index<len(figs)-1:
    for row in t.rows:
     borders=OxmlElement('w:tcBorders');edge=OxmlElement('w:right')
     for key,value in {'val':'single','sz':'8','color':'91A5A9'}.items():edge.set(qn('w:'+key),value)
     borders.append(edge);row.cells[index]._tc.get_or_add_tcPr().append(borders)
  for row in t.rows:row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
  return
 if 'knowledge-grid' in cl:
  first_width=4.2 if soup.html.get('lang')=='en' else 5.4
  t=parent.add_table(rows=1,cols=2);t.autofit=False;t.columns[0].width=Cm(first_width);t.columns[1].width=Cm(width-first_width)
  picture(t.cell(0,0),node.svg,first_width-.4,6.2)
  for cell in t.rows[0].cells:cell._element.remove(cell.paragraphs[0]._element)
  for item in node.select('.topic-points > li'):render(t.cell(0,1),item,width-first_width)
  return
 if 'mechanism-labels' in cl:
  p=parent.add_paragraph();p.paragraph_format.line_spacing=Pt(19)
  for i,span in enumerate(node.find_all('span',recursive=False)):
   if i:p.add_run(' | ')
   runs(p,span)
  return
 if 'concept-box' in cl:
  first=len(d.paragraphs)
  for c in node.children:
   if getattr(c,'get',None) and c.name=='svg':picture(parent,c,width,6.5)
   else:render(parent,c,width)
  for para_ in d.paragraphs[first:]:
   if not para_._p.xpath('.//w:drawing'):para_.paragraph_format.line_spacing=Pt(19)
  return
 for c in node.children:render(parent,c,width)
for i,page in enumerate(soup.select('.paper-page')):
 first=len(d.paragraphs)
 for node in page.main.children:render(d,node)
 # Start the next page on its heading, without an extra empty break paragraph.
 if i:d.paragraphs[first].paragraph_format.page_break_before=True
d.core_properties.title='WS3 | '+('Reference answers' if soup.select('.reference-answer') else 'Student worksheet');d.save(sys.argv[2])
