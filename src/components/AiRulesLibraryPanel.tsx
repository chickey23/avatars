import { AI_RULE_BLOCKS, AI_RULE_SETS } from "../data/aiRulesLibrary";

/** Read-only view of the global AI rules library (blocks + sets). */
export function AiRulesLibraryPanel() {
  return (
    <details className="ai-rules-library">
      <summary>AI rules library</summary>
      <p className="ai-rules-library-hint">
        Avatars use <strong>blocks</strong> first (<code>ruleBlockIds</code>); named <strong>sets</strong> below are
        legacy bundles for defaults and migration.
      </p>
      <h4 className="ai-rules-library-sub">Sets</h4>
      <ul className="ai-rules-set-list">
        {AI_RULE_SETS.map((s) => (
          <li key={s.id}>
            <strong>{s.name}</strong> <code>{s.id}</code>
            <span className="ai-rules-block-ids"> — {s.blockIds.join(", ")}</span>
          </li>
        ))}
      </ul>
      <h4 className="ai-rules-library-sub">Blocks</h4>
      <ul className="ai-rules-block-list">
        {AI_RULE_BLOCKS.map((b) => (
          <li key={b.id}>
            <strong>{b.title}</strong> <code>{b.id}</code>
            <p className="ai-rules-block-body">{b.body}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
