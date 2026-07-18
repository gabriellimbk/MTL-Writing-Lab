import React from 'react';

function stringifyFeedback(value: any): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map(item => stringifyFeedback(item).trim())
      .filter(Boolean)
      .map(item => `- ${item}`)
      .join('\n');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, nestedValue]) => `${key.replace(/_/g, ' ')}: ${stringifyFeedback(nestedValue)}`)
      .join('\n');
  }
  return String(value);
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function renderLabelledLine(line: string) {
  const match = line.match(/^([^:]{2,42}):\s*(.+)$/);
  if (!match) return renderInline(line);

  return (
    <>
      <strong className="feedback-label">{match[1]}:</strong> {renderInline(match[2])}
    </>
  );
}

function getListItem(line: string) {
  const unordered = line.match(/^(?:[-•*])\s+(.+)$/);
  if (unordered) return { type: 'ul' as const, text: unordered[1] };

  const ordered = line.match(/^\d+[.)]\s+(.+)$/);
  if (ordered) return { type: 'ol' as const, text: ordered[1] };

  return null;
}

export default function FeedbackContent({ content, emptyText = 'No feedback generated yet.' }: { content: any; emptyText?: string }) {
  const raw = stringifyFeedback(content).replace(/\r\n/g, '\n').trim();

  if (!raw) {
    return <p className="text-sm leading-7 text-app-muted">{emptyText}</p>;
  }

  const blocks = raw.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);

  return (
    <div className="feedback-content">
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
        const listType = lines.length > 0 ? getListItem(lines[0])?.type : null;

        if (listType && lines.every(line => getListItem(line)?.type === listType)) {
          const List = listType;
          return (
            <List key={blockIndex}>
              {lines.map((line, lineIndex) => {
                const item = getListItem(line);
                return <li key={lineIndex}>{item ? renderLabelledLine(item.text) : renderInline(line)}</li>;
              })}
            </List>
          );
        }

        return (
          <div key={blockIndex} className="feedback-block">
            {lines.map((line, lineIndex) => {
              const item = getListItem(line);
              if (item) {
                return (
                  <div key={lineIndex} className="feedback-bullet">
                    <span aria-hidden="true">•</span>
                    <span>{renderLabelledLine(item.text)}</span>
                  </div>
                );
              }

              return <p key={lineIndex}>{renderLabelledLine(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}
