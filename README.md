# Agent Workflow for DeepSeek Harness

[中文](README.zh.md) | English

`dsh-plugin-agent-workflow` adds an independently installable **Workflow** tab to the DeepSeek Harness Web UI. It visualizes each user turn as a sequence of model requests, responses, and tool calls without importing, replacing, or modifying the built-in Trajectory tab.

## Features

- Fixed, independently scrolling user-turn list with prompt previews, timestamps, call totals, and lifecycle status.
- Virtualized model-call rows with horizontally scrollable request, response, and tool cards.
- Recorded request `system`, provider-neutral `messages[]`, and `tools` values rendered as collapsible JSON trees with copy and expanded-dialog actions.
- Separate uncached input, cache-read, cache-write, and output token totals.
- Running, completed, and failed tool status presentation with duration and result previews.
- Bounded-height integration with the `dsh@0.1.0-rc.7` conversation host so the Workflow page owns its internal scrolling.

The plugin derives its view from recorded Session events. It does not reconstruct prompts from Harness source code and does not add model-visible input or tools.

## Compatibility

Version `0.1.x` targets exactly `dsh@0.1.0-rc.7`. DeepSeek Harness pre-release client APIs may change between release candidates, so upgrade this plugin together with its declared peer dependencies.

## Installation

Install the tagged source release into the Web profile:

```sh
npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web add \
  github:xuanyuanzhifeng/dsh-plugin-agent-workflow#v0.1.0 --workspace-root
```

For testing the current `main` branch, omit the tag:

```sh
npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web add \
  github:xuanyuanzhifeng/dsh-plugin-agent-workflow --workspace-root
```

Git dependencies build from source through the package's `prepare` script. pnpm may initially block that script. If installation reports an ignored build, copy the exact package key from pnpm's message into the Web profile's `pnpm-workspace.yaml`, for example:

```yaml
allowBuilds:
  dsh-plugin-agent-workflow: true
```

Then run the installation command again and restart `dsh web`. Only grant build permission to a source revision you trust; pinning a release tag or commit keeps the installed code stable.

To remove the tab without affecting Trajectory:

```sh
npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web remove \
  dsh-plugin-agent-workflow --workspace-root
```

## Development

Requires Node.js `^22.19.0` or `>=24.0.0` and pnpm 11.

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm test
pnpm pack
```

`pnpm run build` emits the host entries, browser closure-factory bundle, inlined CSS modules, source map, and declarations under `lib/`. `pnpm test` rebuilds first so the client-bundle test exercises the artifact that users install.

## Known limitations

- Summaries cover the Session history loaded by the client. The view requests older pages while open but cannot count an unavailable prefix.
- JSON expansion and selected-card state are local UI state without deep-link URLs.
- Multiple tool calls from one response are displayed as a horizontally scrollable linear sequence rather than a branching graph.

## License

MIT
