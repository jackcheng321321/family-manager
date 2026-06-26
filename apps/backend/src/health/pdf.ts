// 体检报告 PDF 文本提取。优先用 pdfjs-dist 抽取文字层（电子版报告）。
// 扫描件（图片型 PDF）抽不到文字，调用方据此降级为「需手动补充」状态。
// pdfjs 纯 JS，无需原生编译，Alpine 容器内可用。

export interface PdfExtractResult {
  /** 提取到的纯文本 */
  text: string;
  numPages: number;
  /** 文本是否足够用于 AI 解析（扫描件通常为 false） */
  hasText: boolean;
}

/** 认为「有有效文本」的最小字符数阈值 */
const MIN_TEXT_LENGTH = 80;

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  // 动态导入 legacy 构建，兼容 Node ESM。
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // Node 环境下不需要真实 worker；关闭以避免找不到 worker 文件。
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const parts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(pageText);
    page.cleanup();
  }

  const numPages = pdf.numPages;
  await pdf.destroy();

  const text = parts.join("\n").replace(/[ \t]+/g, " ").trim();
  return {
    text,
    numPages,
    hasText: text.length >= MIN_TEXT_LENGTH,
  };
}
