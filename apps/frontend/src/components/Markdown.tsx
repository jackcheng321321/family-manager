import type { ReactNode } from "react";

// 轻量 Markdown 渲染器：覆盖 AI 分析输出用到的子集
// —— 标题(#~######)、无序/有序列表、加粗(**)、斜体(*)、行内代码(`)、段落。
// 不引入第三方依赖，避免部署时的 lockfile / 安装成本。

// 行内解析：**加粗**、*斜体*、`代码`
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {match[2]}
        </strong>
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <em key={key++} className="italic">
          {match[3]}
        </em>
      );
    } else if (match[4] !== undefined) {
      nodes.push(
        <code key={key++} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          {match[4]}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-lg font-bold",
  2: "text-base font-bold",
  3: "text-[15px] font-semibold",
  4: "text-sm font-semibold",
  5: "text-sm font-semibold",
  6: "text-sm font-semibold",
};

export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const isHeading = (l: string) => /^#{1,6}\s+/.test(l);
  const isBullet = (l: string) => /^\s*[-*]\s+/.test(l);
  const isOrdered = (l: string) => /^\s*\d+\.\s+/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <p key={key++} className={`mt-4 first:mt-0 ${HEADING_CLASS[level]}`}>
          {renderInline(heading[2].trim())}
        </p>
      );
      i++;
      continue;
    }

    // 无序列表
    if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc space-y-1.5 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // 有序列表
    if (isOrdered(line)) {
      const items: string[] = [];
      while (i < lines.length && isOrdered(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="list-decimal space-y-1.5 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // 段落：聚合到下一个空行或块级元素
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isHeading(lines[i]) &&
      !isBullet(lines[i]) &&
      !isOrdered(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <p key={key++} className="leading-7">
        {renderInline(paragraph.join(" "))}
      </p>
    );
  }

  return <div className="space-y-3 text-sm text-foreground">{blocks}</div>;
}
