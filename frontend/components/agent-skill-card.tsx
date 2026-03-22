'use client';

import { useState } from 'react';

const SKILL_URL = 'https://deal-forge-tan.vercel.app/skill.md';
const COPY_COMMAND = `curl -s ${SKILL_URL}`;

export function AgentSkillCard() {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(COPY_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="panel agent-skill-panel fade-in">
      <p className="eyebrow">For agents</p>
      <h2>Copy this to your agent</h2>
      <div className="agent-skill-strip">
        <code>{COPY_COMMAND}</code>
        <button type="button" className="button" onClick={() => void copyCommand()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </section>
  );
}
