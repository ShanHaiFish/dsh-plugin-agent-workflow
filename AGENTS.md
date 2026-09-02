# AGENTS.md

> 本文件是给 AI 编码智能体看的项目说明书；最近的 AGENTS.md 优先，根文件只放全局默认。
> 生成于 2026-09-02；项目结构或命令变化后重跑 `/init` 刷新。

## 这个项目是什么

`dsh-plugin-agent-workflow` 是一个可独立安装的 DeepSeek Harness Web UI 插件（静态 bundle 插件）：
在对话与轨迹之外新增“工作流”标签页，以用户对话轮次为入口，将模型请求、响应与工具调用呈现为执行链路。

浏览器端 React 插件（`src/client/`，宿主端无行为），适配 dsh@0.1.2-alpha.4。
完整产品说明见 `README.md`，界面截图见 `docs/images/`。

## Commands

| 任务 | 命令 |
|------|------|
| Typecheck | `pnpm run typecheck` |
| Test（单个） | `pnpm exec vitest run tests/<file>` |
| Test（全部） | `pnpm test`（先构建再跑全部测试） |
| Build | `pnpm run build`（clean + tsdown + tsc 类型声明） |
| Pack | `pnpm pack`（产出可安装的 `dsh-plugin-agent-workflow-<version>.tgz`） |
| 安装到本机 dsh | `npx --yes @deepseek-ai/dsh@0.1.2-alpha.4 plugin --profile web add ./dsh-plugin-agent-workflow-<version>.tgz --workspace-root` |

> 出处：`package.json` scripts、`.github/workflows/ci.yml`（安装依赖用 `pnpm install --frozen-lockfile`）、
> `README.md`「本地开发与打包」「安装」段。

## 结构

```
src/
  index.ts                宿主入口（浏览器-only 插件，apply 为空实现）
  invariant.ts            运行时不变量助手（导出为 ./invariant）
  client/
    index.ts              浏览器插件入口：注册 locale、投影注册器、conversation.view 槽 'workflow'
    locales.ts            zh/en 词典（NS 'workflow'）
    workflow-model.ts     从 Session 记录派生展示模型（纯函数，可独立测试）
    WorkflowView.tsx      “工作流”页主组件（独立滚动 + 虚拟化渲染）
    WorkflowJsonInspector.tsx  可折叠 JSON 树组件（请求/响应正文检视）
    projection/           投影注册：assistant / compaction / message / request-header /
                          surface / tool 定义 + snapshot-builder（装配工作流视图）+ contract
tests/
  *.client.spec.ts(x)     vitest 单测（include: tests/**/*.spec.ts(x)）
  mocks/                  ui-primitives 替身（vitest 别名指向）
scripts/clean.mjs         构建前清理 lib/
cordis.patch.yml          dsh 安装补丁：插入 `ui-workflow` 插件行
docs/images/              README 界面截图
.github/workflows/ci.yml  CI 闸门：typecheck + test + pack
```

## 约定

- CI 质量闸门 = typecheck + test + pack（`.github/workflows/ci.yml`）；三者在本地推代码前都必须通过。
- 只读 Session 已记录的事件并展示，不得向模型请求注入消息、提示词或工具（`README.md`「数据来源」）。
- 适配面固定 dsh@0.1.2-alpha.4：全部 `@deepseek-ai/*` 依赖钉在 `0.1.2-alpha.4`（`package.json`）；升级 DSH 需同步升级本插件依赖（`README.md`「兼容版本」）。
- 发布用 `v0.2.x` 标签，GitHub 安装固定版本形如 `github:<owner>/<repo>#v0.2.0`（`README.md`「从 GitHub 安装」）。
- 安装行为唯一由 `cordis.patch.yml` 定义（插入 `ui-workflow` 行）；不得改动内置“轨迹”功能。

## 改哪块之前先读什么

| 区域 | 先读 |
|------|------|
| 工作流视图与投影 | `src/client/projection/contract.ts`（契约）+ 对应 `*-definition.ts` + `snapshot-builder.ts` |
| 数据派生逻辑 | `src/client/workflow-model.ts` |
| JSON 检视组件 | `src/client/WorkflowJsonInspector.tsx` |
| 构建 / 打包配置 | `tsdown.config.ts`（externals / onlyBundle / CSS 内联） |
| 测试（涉及注入服务） | `tests/mocks/ui-primitives.tsx`（配套 `vitest.config.ts` 的别名）；`tests/registration.client.spec.tsx` 的服务假实现 |
| 产品形态与安装流程 | `README.md`、`docs/images/` |

## 非显然约束

- 浏览器-only 插件：`src/index.ts` 的 `apply()` 是空实现；浏览器逻辑只改 `src/client/`。
- 客户端产物是 CJS + `window.__ModuleLoader__.load(...)` 包装（`tsdown.config.ts` 的 banner/footer）；输出固定为 `lib/client.js`，入口名与 outDir 不许改。
- 新增运行时依赖（值导入）必须进 `tsdown.config.ts` 的 `onlyBundle` 白名单，否则构建失败；`CLIENT_EXTERNALS`（react、cordis、dsh-client-ui-primitives）保持外部 import，不打包。
- CSS 只能用 `.module.css`：由 tsdown 的 cssModulePlugin 内联为运行时注入的 `<style data-plugin-css>`（自动去重）；不要引入普通 CSS 或 CSS 框架。
- 测试禁止直接 import 真实的 `@deepseek-ai/dsh-client-ui-primitives`——`vitest.config.ts` 已把它别名到 `tests/mocks/`。
- 包管理器一律 pnpm（`packageManager: pnpm@11.7.0`，CI 用 `--frozen-lockfile`）；改依赖必须同步 `pnpm-lock.yaml`。
- `lib/`、`*.tgz`、`coverage/` 不提交（`.gitignore`）。

## 优先级

最近的 AGENTS.md 优先；显式用户指令优先于任何文件。