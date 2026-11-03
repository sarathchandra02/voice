from pathlib import Path
from pptx import Presentation
from pptx.util import Inches
from docx import Document
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parent.parent/'tests'/'fixtures'; root.mkdir(exist_ok=True)
img=Image.new('RGB',(320,180),'#e8f0d5'); d=ImageDraw.Draw(img);d.rectangle((40,30,280,150),fill='#315c42');d.text((70,75),'Figure 9.2',fill='white');img.save('/tmp/office-figure.png')
p=Presentation()
for title,body in [('Local document demo','First slide: overview'),('Stability and feedback','Figure 9.2: heliotrope feedback loop'),('Closing remarks','Final slide: the measured result is 42.')]:
 s=p.slides.add_slide(p.slide_layouts[1]);s.shapes.title.text=title;s.placeholders[1].text=body
 if len(p.slides)==2: s.shapes.add_picture('/tmp/office-figure.png', Inches(1), Inches(3),width=Inches(4))
 s.notes_slide.notes_text_frame.text='Speaker notes: confidential rehearsal detail'
p.save(root/'slides.pptx')
doc=Document();doc.add_heading('Local Word document',0);doc.add_heading('Introduction',1);doc.add_paragraph('This is a browser-local Word reading test. Unicode: café, α, 日本語.');doc.add_picture('/tmp/office-figure.png',width=Inches(3))
t=doc.add_table(rows=1,cols=2); t.rows[0].cells[0].text='Item';t.rows[0].cells[1].text='Value'
for a,b in [('Gain','42'),('Threshold','heliotrope')]:
 r=t.add_row().cells;r[0].text=a;r[1].text=b
for i in range(45):doc.add_paragraph(f'Paragraph {i+1}: stable feedback requires checking the full signal path. '*3)
doc.add_heading('Final section',1);doc.add_paragraph('ENDMARKER: the conclusion remains searchable.');doc.save(root/'reading.docx')
