---
name: ocr-image-with-tesseract
description: Extract text from images when the vision API is unavailable (e.g., DeepSeek models without vision support). Uses tesseract CLI with multiple PSM modes and ffmpeg preprocessing to maximize OCR accuracy for Chinese documents.
---

## When to Use
- User sends an image but the current model (e.g., DeepSeek V4 Pro) does not support vision/image input
- `vision_analyze` returns error: "unknown variant `image_url`, expected `text`"
- Need to extract text from any image-based document (medical reports, screenshots, forms, receipts)

## Prerequisites
- `tesseract` must be installed (check with `which tesseract`)
- Chinese language data: `-l chi_sim` (check with `tesseract --list-langs`)
- `ffmpeg` for image preprocessing (contrast enhancement, resizing)

## Step-by-Step Workflow

### 1. Check and prepare the image
```bash
# Check image size and format
python3 -c "
import os
for p in ['/path/to/image.jpg']:
    size = os.path.getsize(p)
    with open(p,'rb') as f:
        header = f.read(4)
    print(f'{p}: {size} bytes, header={header.hex()}')
"
```

### 2. Resize for faster OCR (optional, for large images)
```bash
ffmpeg -y -i input.jpg -q:v 50 -vf "scale=800:-1" input_small.jpg
```

### 3. Run OCR with multiple PSM modes
PSM (Page Segmentation Mode) is critical for accuracy:
- **PSM 6**: Uniform block of text (best for reports/lab results)
- **PSM 3**: Fully automatic page segmentation (default, good for mixed layouts)
- **PSM 4**: Single column of text
- **PSM 11**: Sparse text (no particular order)

```bash
for psm in 3 4 6 11; do
    tesseract image.jpg /tmp/ocr_psm$psm -l chi_sim --psm $psm
    echo "=== PSM $psm ==="
    cat /tmp/ocr_psm${psm}.txt
done
```

### 4. If OCR is poor: preprocess with contrast enhancement
```bash
ffmpeg -y -i input.jpg -vf "eq=contrast=1.5:brightness=0.05,scale=1200:-1" enhanced.jpg
tesseract enhanced.jpg /tmp/ocr_enhanced -l chi_sim --psm 6
cat /tmp/ocr_enhanced.txt
```

### 5. Cross-reference and correct OCR artifacts
Common OCR errors on Chinese medical/lab reports:
- **Missing decimal points**: `1.08` → `108`, `6.48` → `648`, `0.89` → `089`
- **Split numbers**: `18.1` → `18 1`
- **Reference range formatting**: `/L` → `/l` or `儿L`
- **Unit labels**: `g/L` → `g儿`, `g儿L`, etc.

**Correction strategy**: Compare multiple OCR runs. If a value appears massively out of range (e.g., IgA = 10 when ref is 1.00-4.20), try inserting a decimal point before the last 1-2 digits. Use surrounding values as clues — values for the same panel tend to have consistent decimal precision.

### 6. Present results to user
- Show a table with: item name, result, reference range, and normal/abnormal flag
- Flag OCR uncertainties explicitly
- For medical reports: add disclaimer that this is OCR-interpreted and not a substitute for clinical interpretation

## Pitfalls
- **Same image sent twice**: Check MD5 hashes if user sends multiple images — they may be duplicates
- **Chinese-only tesseract**: Some installs only have `chi_sim`. Mixing with `eng` (`-l chi_sim+eng`) may help if English text is present
- **Vertical text**: Chinese reports sometimes use vertical layout — PSM modes 5 or 7 may work better
- **Low-res screenshots**: Mobile screenshots of reports often have low effective DPI — always try original image before resized version
- **pytesseract not needed**: The tesseract CLI works fine directly; don't waste time installing Python bindings unless needed for programmatic cropping
