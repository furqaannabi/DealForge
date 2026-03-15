'use client';

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { commandCatalog, initialTerminalLines, type TerminalLine } from '@/lib/mock-data';

const DEFAULT_COMMAND = 'summarize this research paper\nbudget 3 USDC\ndeadline 20 minutes';

function buildResponse(command: string) {
  const normalized = command.toLowerCase();

  if (normalized.includes('show active deals')) {
    return [
      'Querying active deals from the coordination API mirror.',
      'Deal #42 executing, Deal #41 result submitted, Deal #39 settled.',
    ];
  }

  if (normalized.includes('check escrow status')) {
    return [
      'Escrow locked for Deal #42 on Base.',
      'Confirmation finalized. Result submission still pending.',
    ];
  }

  return [
    'Searching worker agents...',
    'Found summarizer.agent.eth, research.agent.eth, and data.agent.eth.',
    'Negotiation started.',
    'Agreement reached at 2.5 USDC / 20 minutes.',
    'Escrow ready for creation on Base.',
  ];
}

function Typewriter({ text }: { text: string }) {
  const [visible, setVisible] = useState('');

  useEffect(() => {
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisible(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(timer);
      }
    }, 16);

    return () => window.clearInterval(timer);
  }, [text]);

  return <span>{visible}</span>;
}

export function TerminalComposer() {
  const [input, setInput] = useState(DEFAULT_COMMAND);
  const [lines, setLines] = useState<TerminalLine[]>(initialTerminalLines);
  const [queuedResponse, setQueuedResponse] = useState<string[]>([]);
  const [activeTypingLine, setActiveTypingLine] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const seed = input.split('\n')[0].trim().toLowerCase();
    return seed ? commandCatalog.filter((item) => item.includes(seed)).slice(0, 4) : commandCatalog;
  }, [input]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines, queuedResponse, activeTypingLine]);

  useEffect(() => {
    if (activeTypingLine || queuedResponse.length === 0) {
      return;
    }

    const nextLine = queuedResponse[0];
    setActiveTypingLine(nextLine);

    const timer = window.setTimeout(() => {
      setLines((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          kind: (queuedResponse.length === 1 ? 'success' : 'agent') as TerminalLine['kind'],
          text: nextLine,
        },
      ]);
      setQueuedResponse((current) => current.slice(1));
      setActiveTypingLine(null);
    }, nextLine.length * 16 + 280);

    return () => window.clearTimeout(timer);
  }, [activeTypingLine, queuedResponse]);

  const runCommand = (raw: string) => {
    const command = raw.trim();
    if (!command) {
      return;
    }

    const response = buildResponse(command);
    setLines((current) => [...current, { id: crypto.randomUUID(), kind: 'command', text: command }]);
    setQueuedResponse(response);
  };

  const onFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    setAttachments(nextFiles);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runCommand(input);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Tab' && suggestions.length > 0) {
      event.preventDefault();
      setInput(suggestions[0]);
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      runCommand(input);
    }
  };

  return (
    <section className="panel terminal-panel slide-up">
      <div ref={terminalRef} className="terminal-surface">
        {lines.map((line) => (
          <div key={line.id} className={`terminal-row ${line.kind}`}>
            <span className="terminal-prefix">{line.kind === 'command' ? '>' : '$'}</span>
            <span>{line.text}</span>
          </div>
        ))}

        {activeTypingLine ? (
          <div className="terminal-row agent">
            <span className="terminal-prefix">$</span>
            <Typewriter text={activeTypingLine} />
          </div>
        ) : null}
      </div>

      <form className="terminal-form" onSubmit={onSubmit}>
        <label htmlFor="terminal-input" className="label">
          Prompt
        </label>

        {attachments.length > 0 ? (
          <div className="attachment-preview">
            {attachments.map((file) => (
              <span key={`${file.name}-${file.lastModified}`} className="attachment-chip">
                {file.name}
              </span>
            ))}
          </div>
        ) : null}

        <textarea
          id="terminal-input"
          className="terminal-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          rows={5}
          spellCheck={false}
        />

        <div className="attachment-bar">
          <label htmlFor="terminal-files" className="button">
            Add files
          </label>
          <input
            id="terminal-files"
            className="sr-only"
            type="file"
            multiple
            accept=".pdf,.txt,.md,.csv,.json,.doc,.docx,.png,.jpg,.jpeg,.webp"
            onChange={onFilesSelected}
          />
          <span className="attachment-hint">Attach PDFs, docs, CSVs, images, or datasets.</span>
        </div>

        <div className="suggestion-row">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" className="chip" onClick={() => setInput(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>

        <div className="form-foot">
          <span>Tab to autocomplete. Ctrl/Cmd + Enter to run.</span>
          <button type="submit" className="button button-primary">
            Run command
          </button>
        </div>
      </form>
    </section>
  );
}
