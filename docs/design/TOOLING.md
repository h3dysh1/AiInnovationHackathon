# Ground Control design tooling

Local setup checked 8 October 2026. No application code, dependencies, native projects, Git history or remote state changed. Existing agent/editor installation files were preserved.

## Sources and installation decisions

- [Impeccable official installation](https://impeccable.style/) and [source README](https://github.com/pbakaus/impeccable): existing project-local skill v4.5.0 retained. Bundled launcher engine stamp 0.1.11; launcher `--version` reports 4.0.0 (distinct from the skill bundle version). The official `impeccable check` verified the skill is up to date. No reinstall/update was needed.
- [Expo official skills](https://github.com/expo/skills): current guidance prefers `codex plugin add expo@openai-curated`. The installed Codex CLI has no project-scope plugin option and attempted to write to the user-wide plugin cache. To meet this task's project-local scope, used Expo's documented skills CLI path with a selected set: `npx --yes skills@latest add expo/skills --skill expo-overview expo-router expo-native-ui expo-animation expo-design-system expo-ui --agent codex --yes`. Six official skills, not the full EAS/deployment set, were installed in `.agents/skills/`. `skills-lock.json` records upstream paths and hashes. No Expo account, cloud service, MCP connection or telemetry option was added.
- [Official Codex skill discovery](https://developers.openai.com/codex/skills/): `.agents/skills/<name>/SKILL.md` is the project-local skill layout. Installed Expo skills appeared in this session's available-skills catalog. The custom skill has validated frontmatter and UI metadata, and is discoverable at the same layout.

## Responsibilities

| Capability | Owner |
|---|---|
| Generic critique/audit, cognitive load, hierarchy, distillation, shape and polish | `$impeccable` |
| Ground Control decisions, operational jobs, rostering, AI/human boundaries | `$ground-control-product-design` |
| Expo setup and version rules | `$expo-overview` |
| Routes, stacks, tabs, sheets and headers | `$expo-router` |
| Platform appearance and native interaction | `$expo-native-ui`, `$expo-ui` |
| Animation, gesture continuity and reduced motion | `$expo-animation` |
| Token/component consistency and drift | `$expo-design-system` |

Use the relevant existing capability rather than creating a second general-purpose UX skill. The custom skill is deliberately product-specific. `PRODUCT.md` supplies durable context to Impeccable; `DESIGN.md` records the incumbent UI, not a new visual direction.

## Working conventions

Read AGENTS.md and the relevant roadmap.md section first. package.json currently pins Expo 57 and React Native 0.86.3. Always re-read it and use `https://docs.expo.dev/versions/v57.0.0/` (or the installed version at the time of future work), followed by relevant links from `https://docs.expo.dev/llms.txt`. Skills are guidance, not a replacement for matching API docs. Use `expo install` for future app dependencies. No package.json or package-lock.json change was needed here.

The actual app owns Location → Post; “zone” in external product language does not authorize another data layer. Audit recommendations must preserve existing social-signal modules, which are now shown as a demo feed on the Event signals screen.

## Verification and limitations

The Impeccable launcher successfully ran `context`, its official online update check and `doctor`. All audit/critique/distill/shape/onboard/polish references and platform guidance exist. Existing `.codex/hooks.json` has native Impeccable hook definitions; preserved byte-for-byte. Runtime hook trust cannot be inferred from a manifest. No trust setting was changed. Explicit skill/context/detector use works and does not require automatic hook trust; native audit remains source/device work rather than a web-detector substitute.

Custom skill: `.agents/skills/ground-control-product-design/SKILL.md`, with `agents/openai.yaml`. Validated with the skill-creator `quick_validate.py`; its PyYAML dependency was installed in an isolated `/tmp/ground-control-skill-validation` virtual environment, not in the app.

`npx skills@latest list --agent codex --json` verifies project-local discovery. Newly added skills may require catalog refresh in a future agent session, depending on its harness; this session demonstrably refreshed the six Expo skills. No user-wide Expo plugin installation completed.

## Audit execution

Run the existing app with `npx expo start --web --port 8084`; the audit used `CI=1 EXPO_OFFLINE=1` to avoid an unrelated remote dependency lookup and Expo Go on a booted iOS simulator. Playwright was reused from an existing local tool installation, using system Chrome; no application test/browser dependencies were installed.

The temporary browser driver was `/tmp/ground-control-browser-audit.cjs`; it was audit-only and removed after use. It signed into existing synthetic Mo/Sarah accounts without printing credentials, allowed verified read-only calls and blocked operational mutation requests. `live_event_snapshot` is intercepted because it calls `mark_live_attendance`: summary counts are display-only synthetic zeros, explicitly excluded from data-accuracy findings. `intelligence_snapshot` and other verified read calls remain real. No seed, migration, AI request, roster generation, join confirmation, incident submission, approval, role update or closeout was performed.

Screenshots and observations are in `docs/design/audit-evidence/`. They include synthetic-demo operational content and must not be represented as real incident evidence. Audit-created servers/browser sessions are stopped at completion. No screenshot artifact contains passwords or access tokens.
