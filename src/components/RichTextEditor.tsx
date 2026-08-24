import { useEffect, useRef } from 'react';

/**
 * A minimal contenteditable-backed rich text editor. Uses document.execCommand
 * for the operations — deprecated on paper, supported everywhere in practice,
 * and keeps the whole editor at ~150 lines with no extra dependency.
 *
 * Emits HTML through onChange. Callers are responsible for whatever wrapping
 * template goes around the emitted HTML for the final email — this component
 * only produces the body fragment.
 *
 * Toolbar: font size, bold, italic, underline, headings, bullets, numbers,
 * link, unlink, clear formatting. That is the set officers actually use
 * writing an announcement.
 */

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const FONT_SIZES = [
  { label: 'Small', px: '13px' },
  { label: 'Normal', px: '16px' },
  { label: 'Medium', px: '18px' },
  { label: 'Large', px: '22px' },
  { label: 'XLarge', px: '28px' },
];

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  // Only overwrite the innerHTML when the incoming value is different from
  // what the DOM currently holds — otherwise every keystroke round-trips
  // through this component, the caret jumps to the start, and typing feels
  // broken. This is the standard contenteditable + React dance.
  const lastValueRef = useRef<string>(value);

  useEffect(() => {
    if (editorRef.current && value !== lastValueRef.current) {
      editorRef.current.innerHTML = value;
      lastValueRef.current = value;
    }
  }, [value]);

  function exec(command: string, arg?: string) {
    editorRef.current?.focus();
    // execCommand needs the selection alive; focus first, then invoke.
    document.execCommand(command, false, arg);
    handleInput();
  }

  function handleInput() {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    lastValueRef.current = html;
    onChange(html);
  }

  function setFontSize(px: string) {
    // execCommand fontSize only takes 1-7 (legacy), and even that inserts
    // a <font> tag we can't style precisely. Wrap the selection in a
    // <span style="font-size:Npx"> instead — supported by every email
    // client we care about.
    editorRef.current?.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontSize = px;
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
    } catch {
      // Extract failed (spans across non-editable boundary); do nothing.
    }
    handleInput();
  }

  function insertLink() {
    const url = window.prompt('Link URL', 'https://');
    if (!url) return;
    // execCommand createLink uses the current selection; if nothing is
    // selected, insert the URL text itself.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      exec('createLink', url);
    } else {
      exec('insertHTML', `<a href="${escapeHtmlAttr(url)}">${escapeHtml(url)}</a>`);
    }
  }

  function clearFormat() {
    exec('removeFormat');
    exec('unlink');
  }

  return (
    <div className="rte">
      <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
        <select
          className="rte-select"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) setFontSize(e.target.value);
            e.target.value = '';
          }}
          aria-label="Font size"
        >
          <option value="" disabled>Size</option>
          {FONT_SIZES.map((s) => (
            <option key={s.px} value={s.px}>{s.label}</option>
          ))}
        </select>

        <ToolButton onClick={() => exec('bold')} title="Bold (Ctrl+B)"><strong>B</strong></ToolButton>
        <ToolButton onClick={() => exec('italic')} title="Italic (Ctrl+I)"><em>I</em></ToolButton>
        <ToolButton onClick={() => exec('underline')} title="Underline (Ctrl+U)"><u>U</u></ToolButton>

        <span className="rte-divider" aria-hidden="true" />

        <ToolButton onClick={() => exec('formatBlock', 'h2')} title="Heading">H1</ToolButton>
        <ToolButton onClick={() => exec('formatBlock', 'h3')} title="Subheading">H2</ToolButton>
        <ToolButton onClick={() => exec('formatBlock', 'p')} title="Paragraph">¶</ToolButton>

        <span className="rte-divider" aria-hidden="true" />

        <ToolButton onClick={() => exec('insertUnorderedList')} title="Bullet list">•</ToolButton>
        <ToolButton onClick={() => exec('insertOrderedList')} title="Numbered list">1.</ToolButton>

        <span className="rte-divider" aria-hidden="true" />

        <ToolButton onClick={insertLink} title="Insert link">↗</ToolButton>
        <ToolButton onClick={() => exec('unlink')} title="Remove link">⤫</ToolButton>
        <ToolButton onClick={clearFormat} title="Clear formatting">Aa</ToolButton>
      </div>

      <div
        ref={editorRef}
        className="rte-editor"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        data-placeholder={placeholder ?? ''}
      />
    </div>
  );
}

function ToolButton({
  onClick, title, children,
}: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="rte-btn"
      onMouseDown={(e) => e.preventDefault()} // keep the selection alive
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeHtmlAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
