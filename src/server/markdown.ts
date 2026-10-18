/**
 * Markdown → HTML（SSR 用），并提取 H2/H3 目录。
 *
 * 和后台编辑器保持同样的取向：允许原始 HTML（文章里有网易云 iframe），
 * 不做智能引号替换（避免和已有文本的直引号打架）。
 */
import MarkdownIt from 'markdown-it';

export interface Heading {
  depth: number;
  text: string;
  slug: string;
}

export interface RenderResult {
  html: string;
  headings: Heading[];
}

const md = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: false,
  breaks: false,
});

function plainText(token: { content: string; children?: Array<{ type: string; content: string }> | null }): string {
  if (!token.children) return token.content;
  return token.children
    .filter((child) => child.type === 'text' || child.type === 'code_inline')
    .map((child) => child.content)
    .join('');
}

function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

export function renderMarkdown(source: string): RenderResult {
  const env: Record<string, unknown> = {};
  const tokens = md.parse(source, env);
  const headings: Heading[] = [];
  const used = new Map<string, number>();

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.type !== 'heading_open') continue;

    const inline = tokens[i + 1];
    const text = inline ? plainText(inline as never) : '';
    const depth = Number(token.tag.slice(1));
    const base = slugify(text);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    const slug = count === 1 ? base : `${base}-${count}`;

    token.attrSet('id', slug);
    if (depth >= 2 && depth <= 3) {
      headings.push({ depth, text, slug });
    }
  }

  return {
    html: md.renderer.render(tokens, md.options, env),
    headings,
  };
}
