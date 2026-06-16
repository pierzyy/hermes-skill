---
name: manual-docx-generation
description: Create Word .docx files from scratch using raw XML + zipfile when python-docx is unavailable or can't be installed (e.g., network restrictions, system package policies).
---

# Manual .docx Generation (No python-docx)

## When to use this skill
- `python-docx` not installed and `pip install` fails (network issues, `--break-system-packages` blocked, timeout)
- Need to produce a well-formatted Word document from scratch
- Target format: `.docx` with headings, bullets, bold text, paragraph formatting

## How .docx works
A `.docx` file is a ZIP archive containing XML files. Minimal structure:
```
[Content_Types].xml          -- file type declarations
_rels/.rels                   -- package relationships
word/_rels/document.xml.rels  -- document-level relationships
word/styles.xml               -- style definitions (headings)
word/document.xml             -- the actual content
```

## Step-by-step

### 1. XML escaping helper
```python
def esc(s):
    return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace('"',"&quot;")
```

### 2. Block helpers (returns XML strings)
```python
def h1(t): return f'<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">{esc(t)}</w:t></w:r></w:p>'
def h2(t): return f'<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">{esc(t)}</w:t></w:r></w:p>'
def h3(t): return f'<w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t xml:space="preserve">{esc(t)}</w:t></w:r></w:p>'
def p(t):  return f'<w:p><w:r><w:t xml:space="preserve">{esc(t)}</w:t></w:r></w:p>'
def bp(b,n=""): return f'<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{esc(b)}</w:t></w:r><w:r><w:t xml:space="preserve">{esc(n)}</w:t></w:r></w:p>'
def bul(text, bold_prefix=""):
    if bold_prefix:
        return f'<w:p><w:pPr><w:ind w:left="480" w:hanging="240"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">\u2022 {esc(bold_prefix)}</w:t></w:r><w:r><w:t xml:space="preserve">{esc(text)}</w:t></w:r></w:p>'
    return f'<w:p><w:pPr><w:ind w:left="480" w:hanging="240"/></w:pPr><w:r><w:t xml:space="preserve">\u2022 {esc(text)}</w:t></w:r></w:p>'
```

### 3. Build document body
```python
B = []
B.append(h1("Document Title"))
B.append(h2("Section"))
B.append(p("Paragraph text here."))
B.append(bul("Bullet point"))
# ... assemble content ...
```

### 4. Assemble document.xml
```python
doc_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>{"".join(B)}</w:body>
</w:document>'''
```

### 5. Static XML strings (copy-paste ready)
```python
ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'

rels_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'

drels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'

sty = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="1F4E79"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="260" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="2E75B6"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="404040"/></w:rPr></w:style></w:styles>'
```

### 6. Write ZIP
```python
import zipfile
with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.writestr('[Content_Types].xml', ct)
    zf.writestr('_rels/.rels', rels_xml)
    zf.writestr('word/_rels/document.xml.rels', drels)
    zf.writestr('word/styles.xml', sty)
    zf.writestr('word/document.xml', doc_xml)
```

## Pitfalls
- **Chinese quotes in strings**: If text contains `"..."` (curly double quotes used in Chinese), wrap Python strings with single quotes or escape carefully. Use `\u201c` and `\u201d` if needed.
- **Escape ALL text** through `esc()` before inserting into XML. Ampersands and angle brackets will break the document.
- **Styles must be referenced correctly**: Heading1/Heading2/Heading3 styleIds must match the style definitions in styles.xml.
- **File size**: Human-readable text documents are usually 5-15KB. If much larger, check for unescaped content or repeated blocks.

## Verification
- Open the generated .docx in Word or LibreOffice to verify formatting
- Check that headings appear in the navigation pane
- Verify bullets render as proper bullet points
