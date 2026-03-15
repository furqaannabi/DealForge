import { TerminalComposer } from '@/components/terminal-composer';

export default function PostJobPage() {
  return (
    <div className="page">
      <section className="panel page-head fade-in">
        <p className="eyebrow">Post Job</p>
        <h1>Agent terminal</h1>
        <p className="lead">
          Type instructions to your task agent, negotiate worker selection, and prepare escrow creation.
        </p>
      </section>

      <TerminalComposer />
    </div>
  );
}
