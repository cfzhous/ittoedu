from __future__ import annotations

import hashlib
import json
from pathlib import Path

from pypdf import PdfReader
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parent.parent
COURSE_DIR = ROOT / "output" / "math-motion-course"
CAPTURE_CONFIG = COURSE_DIR / "capture-config.json"
PDF_PATH = COURSE_DIR / "让运动变成函数-动点问题五步建模法.pdf"
REPORT_PATH = COURSE_DIR / "pdf-export-report.json"
PAGE_WIDTH = 13.333 * 72
PAGE_HEIGHT = 7.5 * 72


def main() -> None:
    config = json.loads(CAPTURE_CONFIG.read_text(encoding="utf-8"))
    pages = config["pages"]
    document = canvas.Canvas(str(PDF_PATH), pagesize=(PAGE_WIDTH, PAGE_HEIGHT), pageCompression=1)
    document.setTitle("让运动变成函数——动点问题的五步建模法")
    document.setAuthor("互动课件编辑器")
    for page in pages:
        page_path = COURSE_DIR / page["pageOutput"]
        if not page_path.exists():
            raise FileNotFoundError(f"缺少 PDF 页面证据：{page_path}")
        document.drawImage(
            ImageReader(str(page_path)),
            0,
            0,
            width=PAGE_WIDTH,
            height=PAGE_HEIGHT,
            preserveAspectRatio=False,
            mask="auto",
        )
        document.showPage()
    document.save()

    reader = PdfReader(str(PDF_PATH))
    if len(reader.pages) != len(pages):
        raise RuntimeError(f"PDF 页数错误：期望 {len(pages)}，实际 {len(reader.pages)}")
    pdf_bytes = PDF_PATH.read_bytes()
    REPORT_PATH.write_text(
        json.dumps(
            {
                "path": PDF_PATH.relative_to(ROOT).as_posix(),
                "pages": len(reader.pages),
                "bytes": len(pdf_bytes),
                "sha256": hashlib.sha256(pdf_bytes).hexdigest(),
                "pageSizePoints": {"width": PAGE_WIDTH, "height": PAGE_HEIGHT},
                "source": "seven 1280x720 browser-rendered initial-state frames",
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"PDF：{PDF_PATH}")
    print(f"页数：{len(reader.pages)}")


if __name__ == "__main__":
    main()
