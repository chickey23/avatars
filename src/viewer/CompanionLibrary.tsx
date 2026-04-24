import { AI_RULE_BLOCKS, AI_RULE_SETS } from "../data/aiRulesLibrary";
import { defaultAvatars } from "../data/defaultAvatars";
import { PROJECT_SEED_LIST } from "../data/projectSeedList";
import { PERSONALITY_TRAITS } from "../theme/designTokens";
import { blurbForTool, getAgenticToolIds, getToolGroupEntries } from "./companionToolBlurbs";

export function CompanionLibrary() {
  const toolIds = getAgenticToolIds();
  const groups = getToolGroupEntries();
  return (
    <div className="companion-library">
      <p className="companion-lead">
        Bundled reference only — no network. Use the main Avatars app to change data.
      </p>

      <section className="companion-section" aria-labelledby="companion-worldview">
        <h2 id="companion-worldview" className="companion-h2">
          Worldview and agentic tools
        </h2>
        <p className="companion-p">
          Tool names must match the model envelope (schema{" "}
          <code className="companion-code">avatars_tools_v1</code>).
        </p>
        <h3 className="companion-h3">Registered tool ids</h3>
        <ul className="companion-list companion-tool-list">
          {toolIds.map((id) => (
            <li key={id}>
              <code className="companion-code">{id}</code>
              <span className="companion-dim"> — {blurbForTool(id)}</span>
            </li>
          ))}
        </ul>
        <h3 className="companion-h3">Ownership groups (tool_owner tags)</h3>
        <ul className="companion-list">
          {groups.map(({ group, members }) => (
            <li key={group}>
              <strong>{group}</strong>
              {": "}
              {members.map((m, i) => (
                <span key={m}>
                  {i > 0 ? ", " : null}
                  <code className="companion-code">{m}</code>
                </span>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <section className="companion-section" aria-labelledby="companion-rules">
        <h2 id="companion-rules" className="companion-h2">
          AI rule blocks
        </h2>
        <ul className="companion-list">
          {AI_RULE_BLOCKS.map((b) => (
            <li key={b.id}>
              <strong>{b.title}</strong> <code className="companion-code">({b.id})</code>
              <p className="companion-p companion-rule-body">{b.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="companion-section" aria-labelledby="companion-sets">
        <h2 id="companion-sets" className="companion-h2">
          AI rule sets (legacy groupings)
        </h2>
        <ul className="companion-list">
          {AI_RULE_SETS.map((s) => (
            <li key={s.id}>
              <strong>{s.name}</strong> <code className="companion-code">({s.id})</code>
              <div className="companion-dim companion-wrap">
                {s.blockIds.join(", ")}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="companion-section" aria-labelledby="companion-traits">
        <h2 id="companion-traits" className="companion-h2">
          Personality traits
        </h2>
        <ul className="companion-list">
          {PERSONALITY_TRAITS.map((t) => (
            <li key={t.id}>
              <strong>{t.label}</strong> <code className="companion-code">({t.id})</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="companion-section" aria-labelledby="companion-avatars">
        <h2 id="companion-avatars" className="companion-h2">
          Default avatars (catalog)
        </h2>
        <ul className="companion-list">
          {defaultAvatars.map((a) => (
            <li key={a.id}>
              <strong>{a.givenName}</strong> <code className="companion-code">({a.id})</code>
              <div className="companion-dim companion-wrap">
                {a.appellation}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="companion-section" aria-labelledby="companion-seeds">
        <h2 id="companion-seeds" className="companion-h2">
          Project seed list
        </h2>
        <p className="companion-p">
          Canonical titles merged idempotently into <code className="companion-code">world_metadata.projects</code> by the
          main app.
        </p>
        <ol className="companion-ol">
          {PROJECT_SEED_LIST.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
