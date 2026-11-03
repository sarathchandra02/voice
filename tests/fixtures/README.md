# Office fixtures

These documents contain synthetic content authored for the Margin regression suite:

- `slides.pptx`: three slides, a numbered figure, an embedded raster image and speaker notes.
- `slides.ppt`: the same authored deck saved as PowerPoint 97–2003 by LibreOffice. Tests import this binary file directly in the browser, without LibreOffice.
- `reading.docx`: headings, Unicode, an image, a table and 45 paragraphs across several generated reading pages, with an end marker to detect lost tail content.

Regenerate with `python scripts/office-fixtures.py` (requires python-pptx, python-docx and Pillow), then run `soffice --headless --convert-to ppt --outdir tests/fixtures tests/fixtures/slides.pptx`. These tools are only for fixture generation, never app runtime dependencies.
