import React from 'react';

interface ChatMessageFormatterProps {
  content: string;
}

type Block =
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'code'; code: string; lang?: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'paragraph'; text: string };

export const ChatMessageFormatter: React.FC<ChatMessageFormatterProps> = ({ content }) => {
  if (!content) return null;

  // Split content into blocks: tables, code blocks, lists, headings, and paragraphs
  const blocks = parseContentToBlocks(content);

  return (
    <div className="chat-formatted-body">
      {blocks.map((block, idx) => {
        if (block.type === 'table') {
          return (
            <div key={idx} className="teams-table-wrapper">
              <table className="teams-markdown-table">
                <thead>
                  <tr>
                    {block.headers.map((h, i) => (
                      <th key={i}>{renderInline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx}>{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'code') {
          return (
            <div key={idx} className="teams-code-block">
              {block.lang && <span className="code-lang-tag">{block.lang}</span>}
              <pre>
                <code>{block.code}</code>
              </pre>
            </div>
          );
        }

        if (block.type === 'heading') {
          const Tag = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5';
          return (
            <Tag key={idx} className="teams-chat-heading">
              {renderInline(block.text)}
            </Tag>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={idx} className="teams-chat-list">
              {block.items.map((item, iIdx) => (
                <li key={iIdx}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote key={idx} className="teams-chat-quote">
              {renderInline(block.text)}
            </blockquote>
          );
        }

        // Regular paragraph with callout styling if it starts with an alert emoji
        const hasCallout = /^[✅⚠️🚨🔍💡]/.test(block.text);
        return (
          <p key={idx} className={`teams-chat-paragraph ${hasCallout ? 'callout-paragraph' : ''}`}>
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
};

function parseContentToBlocks(raw: string): Block[] {
  const lines = raw.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check for Code Block ```
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: 'code',
        lang: lang || undefined,
        code: codeLines.join('\n')
      });
      i++;
      continue;
    }

    // Check for Markdown Table: line with pipes and next line with dashes
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].includes('-')) {
      const headers = line
        .split('|')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      i += 2; // skip header and separator row (e.g. |---|---|)
      const rows: string[][] = [];

      while (i < lines.length && lines[i].includes('|')) {
        const cells = lines[i]
          .split('|')
          .map(s => s.trim())
          .filter((_, idx, arr) => !(idx === 0 && arr[0] === '') && !(idx === arr.length - 1 && arr[arr.length - 1] === ''));
        if (cells.length > 0) {
          rows.push(cells);
        }
        i++;
      }

      blocks.push({
        type: 'table',
        headers,
        rows
      });
      continue;
    }

    // Check for Headings (#, ##, ###)
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2]
      });
      i++;
      continue;
    }

    // Check for Bullet Lists (- or *)
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
        items.push(lines[i].trim().slice(2).trim());
        i++;
      }
      blocks.push({
        type: 'list',
        items
      });
      continue;
    }

    // Check for Blockquote (>)
    if (line.trim().startsWith('>')) {
      blocks.push({
        type: 'quote',
        text: line.trim().replace(/^>\s*/, '')
      });
      i++;
      continue;
    }

    // Regular line
    if (line.trim().length > 0) {
      blocks.push({
        type: 'paragraph',
        text: line.trim()
      });
    }

    i++;
  }

  return blocks;
}

// Render bold, inline code, italics inside text spans safely
function renderInline(text: string): React.ReactNode[] {
  if (!text) return [];

  // Match bold **text**, inline code `code`, and italics *text*
  const tokens: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|`.*?`|\*.*?\*)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      tokens.push(text.slice(lastIdx, match.index));
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(
        <strong key={match.index} className="inline-strong">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(
        <code key={match.index} className="inline-code-pill">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      tokens.push(
        <em key={match.index} className="inline-em">
          {token.slice(1, -1)}
        </em>
      );
    }

    lastIdx = regex.lastIndex;
  }

  if (lastIdx < text.length) {
    tokens.push(text.slice(lastIdx));
  }

  return tokens;
}
