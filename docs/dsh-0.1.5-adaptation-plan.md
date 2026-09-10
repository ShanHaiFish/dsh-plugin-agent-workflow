# dsh 0.1.5 适配评估与更新方案

> **状态：已实施完成（2026-09-02）。** 本文件保留为评估记录与实施依据。
> 落地结果：`v0.3.0`，三闸门全绿（typecheck 0 错误 / 35 测试通过 / pack 成功）。
> 与方案的差异见文末「实施记录」。

> 评估日期：2026-09-02
> 评估对象：`dsh-plugin-agent-workflow@0.2.1`（钉定 `dsh@0.1.2-alpha.4`）
> 目标版本：`dsh@0.1.5-rc.1`（本机运行时实况，亦为 npm `latest`）
> 结论：**需要适配**。加载层与注册层完全兼容，但会话数据契约断裂 5 处，已产生静默功能降级。

---

## 0. 结论摘要

| 维度 | 判定 | 依据 |
|------|------|------|
| 插件能否挂载 / 标签页能否出现 | ✅ 能 | 清单字段、槽位契约、激活 API 均未变（见 §2） |
| 构建能否通过 | ❌ 不能 | `tsc --noEmit` = **27 个类型错误**（src 25 + tests 2） |
| 运行时是否静默降级 | ⚠️ 是 | 5 类事件/契约改名，typecheck 覆盖不全（见 §4） |
| 是否需架构性重构 | ❌ 不需要 | 改动集中在 projection 层 5 个文件 + 测试夹具 |
| 预估工作量 | 0.5–1 人日 | 主要为机械改名 + 1 处功能重建（system prompt） |
| 建议版本 | `v0.3.0` | 破坏性适配，按 semver 走 minor |

**核心判断**：这不是「插件被淘汰」，而是「本插件照抄的上游参照物 `dsh-client-ui-trajectory` 在 0.1.5 完成了一次事件词表迁移，本插件需要跟随」。上游新版已给出全部迁移写法，可 1:1 对照移植（见 §5）。

---

## 1. 事实基线（实测）

### 1.1 版本差距

| 项 | 版本 |
|---|---|
| 项目 `package.json` 钉定（peer + dev，共 26 处） | `0.1.2-alpha.4` |
| 本机全局 dsh 运行时 | `0.1.5-rc.1` |
| npm `dist-tags` | `latest = 0.1.5-rc.1`、`alpha = 0.1.5-alpha.2`、`next = 0.1.5-rc.1` |
| 中间遗漏版本 | `0.1.2-alpha.5`、`0.1.2-rc.1`、`0.1.3-alpha.2`、`0.1.5-alpha.1`、`0.1.5-alpha.2` |

即项目跨了 **3 个 minor**（0.1.2 → 0.1.3 → 0.1.5）未跟进。

### 1.2 实测方法（可复现）

1. 把项目复制到 `_dsh-adapt-check/app`（排除 `node_modules`/`lib`/`.git`/`*.tgz`）；
2. 将 `package.json` 中 26 处 `0.1.2-alpha.4` 全量替换为 `0.1.5-rc.1`，删除 `pnpm-lock.yaml`；
3. `pnpm install --ignore-scripts`（成功，42s）；
4. `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`；
5. `node node_modules/vitest/vitest.mjs run`。

### 1.3 实测结果

```
tsc --noEmit  : 27 errors  (TS2339 ×16, TS2367 ×9, TS2379 ×1, TS2345 ×1)
vitest run    : Test Files 7 passed (7) | Tests 23 passed (23)
```

> ⚠️ **测试全绿具有误导性**：vitest 不做类型检查，且现有测试断言的仍是**旧事件名**（`tests/assistant-definition.client.spec.ts` 用 `'assistant/chunk'`），因此改名路径上的测试实为**空转通过**，不构成回归保护。

### 1.4 报错分布

| 文件 | 错误数 | 根因 |
|------|--------|------|
| `src/client/projection/assistant-definition.ts` | 14 | `assistant/chunk` 改名（§3.1） |
| `src/client/projection/tool-definition.ts` | 8 | `tool/code-dispatch*` 改名（§3.2） |
| `src/client/projection/surface-definition.ts` | 2 | `SurfaceOp.replace` 字段改名（§3.3） |
| `src/client/projection/request-header-definition.ts` | 1 | `EpochHeader.system` 移除（§3.4） |
| `tests/assistant-definition.client.spec.ts` | 2 | 测试夹具陈旧（§7） |

---

## 2. 不需要改的部分（逐条已验证）

这些是「插件还能挂上去」的原因，**不要**在适配时误改：

| # | 机制 | 0.1.5 实况 | 证据 |
|---|------|-----------|------|
| 1 | 静态 bundle 清单字段 | `dsh.bundle.patch` 仍是官方在用的唯一形态 | `@deepseek-ai/dsh-base`、`dsh-web-app`、`dsh-acp-app` 等 6 个官方包均声明 `{"bundle":{"patch":"./cordis.patch.yml"}}` |
| 2 | 客户端插件声明 | `dsh.client.inject` + `platform` 保留（新增可选 `immediately`） | `dsh-client-ui-trajectory` 0.1.5 的 `dsh.client` 原文 |
| 3 | `@deepseek-ai/dsh-client-ui-primitives` 作为运行时外部依赖 | **仍然合法**：它是浏览器端**平台种子模块** | web 前端种子表 `staticModules` = `react` / `react/jsx-runtime` / `react-dom` / `react-dom/client` / `cordis` / `dsh-client-store` / `dsh-client-ui-slots` / `dsh-client-ui-primitives` / `dsh-client-ui-dockkit`（`dsh-web-frontend/dist/assets/index-*.js`） |
| 4 | `conversation.view` 槽位契约 | 逐字不变：`{ kind:'list', scope:'session', owner: ConvViewOwnerProps }` | `dsh-client-ui-conversation/.../contract/slots.d.ts` 两版对照 |
| 5 | 目标激活 API | `uiConversation.binding(id).target(name)` / `.activate()` 逐字不变 | `conversation/assembly.d.ts` 的 `ConversationBinding` 两版**完全一致** |
| 6 | 视图标准钩子 | `UseConversation = SnapshotSelectorHook<ConversationSnapshot>` 不变 | `contract/slots.d.ts` L107 vs L77 |
| 7 | `locale` / `sessions` / `session.loadOlder` | 均未报错 | 27 个错误中无一处涉及 |

> **注意**：`profiles/node_modules/@deepseek-ai/` 下有 10 个**失效 junction**（含 `dsh-client-ui-primitives`、`dsh-client-ui-slots`），这是 dsh 从旧版升级后 npm 裁剪依赖树留下的残留。经核实它们**不影响插件运行**（浏览器端由种子表供给），但会干扰 `tsc` 的模块解析直觉，排查时不要被误导。

---

## 3. 必须适配的破坏性变更（5 类根因）

### 3.1 `assistant/chunk` → `assistant/live-chunk`

| | |
|---|---|
| 旧 | 持久化事件 `'assistant/chunk'`，载荷 `{ turn, step, chunk: StreamChunk }` |
| 新 | **客户端专属瞬时事件** `'assistant/live-chunk'`，载荷 `{ seq, time, data: { attemptId, turn, step, chunk } }` |
| 新增 | 持久化事件 `'assistant/attempt'`：`{ turn, step, stream: AssistantStreamRecord[] }` |
| 证据 | `dsh-session` 的 `KNOWN_SESSION_EVENT_TYPES` 两版对照；`dsh-api-session-controller/.../contract/events.d.ts` 新定义 `AssistantLiveChunkEvent` |

**好消息**：`event.seq`、`event.time`、`event.data.turn/step/chunk` 访问路径**完全不变**，只需改类型字符串判定。

**本项目命中 5 处**：`assistant-definition.ts` L109、L184、L298、L319、L351。

### 3.2 `tool/code-dispatch(-start)` → `tool/ptc-dispatch(-start)`

| | |
|---|---|
| 旧 | `'tool/code-dispatch-start'`、`'tool/code-dispatch'` |
| 新 | `'tool/ptc-dispatch-start'`、`'tool/ptc-dispatch'` |
| 性质 | **纯改名**。载荷类型两版同名同形（`PtcDispatchStartEventData` / `PtcDispatchEventData`，字段 `parentCallId` / `subCallId` 不变） |
| 证据 | `dsh-tools/lib/types/types.d.ts` 两版对照，仅事件名字符串不同 |

**本项目命中 6 处**：`tool-definition.ts` L132(×2)、L139、L142、L218(×2)。

### 3.3 `SurfaceOp.replace` 字段改名

```diff
  export type SurfaceOp = 'append' | {
      op: 'replace';
-     start: SessionSeq;
-     end: SessionSeq;
+     startSeq: SessionSeq;
+     endSeq: SessionSeq;
  };
```
- 证据：`dsh-session/lib/types/types.d.ts`（旧 L403 / 新 L429）
- 附带：`SurfaceIntent` 变为泛型 `SurfaceIntent<T extends SurfaceEventType>`
- 附带：`isSurfaceEligibleType` 覆盖的事件类型由 **3 个增至 4 个**，新增 `system/message`
- 本项目命中：`surface-definition.ts` L36

### 3.4 `EpochHeader.system` 移除 → `system/message` 表面事件

这是**唯一一处功能级（非改名）变更**，也是改动量最大的地方。

| | |
|---|---|
| 旧 | 系统提示词文本内联在请求头：`request/header.data.header.system?: string` |
| 新 | `EpochHeader` 只剩 `{ config, adapterDefaults?, tools? }`；系统提示词改由**一等表面事件** `system/message` 承载，可被 replace 类表面操作改写 |
| 证据 | `dsh-session/lib/types/types.d.ts` 的 `EpochHeader` 两版对照；新版 `SessionEventMap` 新增 `'system/message': { turn, step, message: SystemMessage }` |

**dsh 为此专门提供了两个纯函数接口**（0.1.5 新增，正是为 trajectory / 本插件这类「目标专属 Definition」准备的）：

```ts
// ctx.uiConversation 上的服务方法（cross-plugin value import 在 client bundle 中被禁止，故以服务方法暴露）
inspectSystemPrompt(previous: SystemPromptState | undefined, event: SessionEvent): SystemPromptState
inspectRequestPrompt(
  previous: ConversationPromptSnapshot | undefined,
  event: SessionEvent<'request/header'>,
  system: SystemPromptNode | undefined,
): RequestPromptInspection
```
- 证据：`dsh-client-ui-conversation/.../conversation/assembly.d.ts`（`UiConversation` 类 L81 / L94）

**上游 trajectory 的采纳写法**（可直接照抄）：
```js
// lib/client.js L1299-1300
ctx.uiConversation.events.register(
  trajectorySystemMessageDefinition((previous, event) => ctx.uiConversation.inspectSystemPrompt(previous, event)))
ctx.uiConversation.events.register(
  trajectoryRequestHeaderDefinition((previous, event, system) => ctx.uiConversation.inspectRequestPrompt(previous, event, system)))
```

**本项目命中**：`request-header-definition.ts` L19（`header.system ?? ''`）、L31（`systemChanged` 判定），且 `WorkflowView.tsx` L236/L253/L386 消费的 `request.prompt.system` 会**整块变空**。

### 3.5 `ChunkRowEvent` / `chunkrow/*` 机制整体移除

| | |
|---|---|
| 旧 | `SessionEventLike = SessionEvent \| ChunkRowEvent`；entry 判别符含 `'chunks'`；历史流式内容压缩为 `chunkrow/text-chunks`、`chunkrow/reasoning-chunks`、`chunkrow/tool-call-chunks` |
| 新 | `SessionEventLike = SessionEvent \| AssistantLiveChunkEvent`；entry 判别符改为 `'transient'`；新增 `SessionEventChange` 变体 `'settle-assistant'`（携带 `attemptId`）；`MutableSessionEventSource` 新增 `settleAssistant()` |
| 证据 | `dsh-api-session-controller/.../contract/events.d.ts` 两版对照；旧版 `dsh-session/lib/types/chunk-rows.d.ts` 在新版**已删除**；新版 trajectory `lib/client.js` 中 `chunkrow` 引用数为 **0**（旧版有 12+ 处） |

**本项目命中**：`surface-definition.ts` L14 注释、L16 `!event.type.startsWith('chunkrow/')`。

### 3.6 附带：`assistant/message` 新增必填 `stream`

```diff
  'assistant/message': {
      turn: number; step: number;
      message: AssistantMessage;
+     stream: AssistantStreamRecord[];   // 新增必填：精确计时的模型流
      usage?: TokenUsage;
      interrupted?: true;
  }
```
- 证据：`dsh-session/lib/types/types.d.ts` `SessionEventMap` 两版对照
- 影响：仅影响**测试夹具**（生产路径只读不构造）

---

## 4. typecheck 抓不到的静默失效（重点）

类型检查只覆盖「显式引用了已消失符号」的路径。以下问题**编译期无声**，必须人工处理：

| # | 位置 | 问题 | 后果 |
|---|------|------|------|
| 1 | `surface-definition.ts` L16 | `!event.type.startsWith('chunkrow/')` —— `startsWith` 接受任意 string，不报错 | 新版不存在 `chunkrow/*`，该守卫**恒为 true**，失效；`AssistantLiveChunkEvent` 会被当作 `SessionEvent` 传入 `isAppendSurfaceEvent`/`isReplacementSurfaceEvent` |
| 2 | `surface-definition.ts` L22 | 判定依赖 `isAppendSurfaceEvent \|\| isReplacementSurfaceEvent` | 新版 `system/message` 进入表面事件集（3→4），会**新产生** `kind:'workflow-surface-event'` 节点；需明确决定其展示方式 |
| 3 | `WorkflowView.tsx` L236/253/386 | 消费 `request.prompt.system` | 由 `EpochHeader.system` 供给，新版恒为空 → 「系统提示词」面板与计数**静默变空** |
| 4 | `WorkflowView.tsx`「请求链路」 | 依赖 assistant 流式块构建助手行 | 事件改名后 `updateChunk`/`fallbackState` 分支**永不命中** → 流式过程行缺失（终态 `assistant/message` 仍在，故不会报错，只是少内容） |
| 5 | `tool-definition.ts` | PTC 派发子树（父调用 → 子调用） | dispatch 事件永不匹配 → **子调用树消失** |

> 这 5 条是本方案的真实价值所在：**只修 27 个类型错误不足以完成适配**。

---

## 5. 改动清单（逐文件）

> 参照实现：`@deepseek-ai/dsh-client-ui-trajectory@0.1.5-rc.1` 的 `lib/client.js` 与 `lib/types/client/*.d.ts`。
> 本插件的 `src/client/projection/` 与上游 trajectory 的文件一一对应（`*-definition.ts` / `snapshot-builder.ts` / `contract.ts` / `event-projection.ts` / `record.ts` / `layout.ts`），可逐文件对照移植。

| 文件 | 改动 | 类型 |
|------|------|------|
| `src/client/projection/assistant-definition.ts` | 5 处 `'assistant/chunk'` → `'assistant/live-chunk'`；确认 `data.turn/step/chunk`、`seq`、`time` 访问不变 | 机械 |
| `src/client/projection/tool-definition.ts` | 6 处 `'tool/code-dispatch-start'` → `'tool/ptc-dispatch-start'`、`'tool/code-dispatch'` → `'tool/ptc-dispatch'` | 机械 |
| `src/client/projection/surface-definition.ts` | ① L36 `start/end` → `startSeq/endSeq`；② L16 移除 `chunkrow/` 守卫，改为排除 `'assistant/live-chunk'`（对齐上游：上游已彻底删除该判定）；③ 更新 L14 注释；④ 明确 `system/message` 的处理策略 | 机械 + 决策 |
| `src/client/projection/request-header-definition.ts` | 改为**闭包接收 inspector**：`registerWorkflowRequestHeaderDefinition(ctx)` 内部用 `ctx.uiConversation.inspectRequestPrompt` 构造 Definition；删除 `header.system` 读取 | **功能重建** |
| `src/client/projection/system-message-definition.ts` | **新增**：仿 `trajectorySystemMessageDefinition`，注册 `system/message`（含非 append 的表面替换）节点，经 `ctx.uiConversation.inspectSystemPrompt` 求值，产出系统提示词节点 | **新增** |
| `src/client/projection/contract.ts` | 新增 system-message 节点类型；若 `WorkflowSurfaceRecord` 引用 `SurfaceOp` 字段需同步 | 小改 |
| `src/client/projection/snapshot-builder.ts` | 装配新节点；`request.prompt.system` 改由 system 节点供给 | 小改 |
| `src/client/index.ts` | 注册新增的 system-message Definition | 小改 |
| `src/client/WorkflowView.tsx` | 消费新的 system 节点（面板与计数） | 小改 |
| `src/client/locales.ts` | 可能需补 system 节点相关文案 | 小改 |
| `tests/assistant-definition.client.spec.ts` | 夹具补 `stream: []`；`'assistant/chunk'` → `'assistant/live-chunk'` | 机械 |
| `package.json` | 26 处依赖 `0.1.2-alpha.4` → `0.1.5-rc.1`；`pnpm-lock.yaml` 同步重生成 | 机械 |
| `AGENTS.md` / `README.md` | 更新「适配面固定 dsh@0.1.5-rc.1」与兼容版本表 | 文档 |

### 关于旧版兼容分支（重要结论）

**不需要**保留 `'assistant/chunk'` / `'tool/code-dispatch'` 的兼容分支。

依据：dsh 0.1.5 内置会话格式迁移链 `dsh-session-format-v0-to-v1` → `v1-to-v2` → `v2-to-v3`，其中 `v2-to-v3` 已实现对 `tool/code-dispatch*` ↔ `tool/ptc-dispatch*` 的**双向**映射（`lib/index.js` L826-832 为 v2→v3，L482-488 为 v3→v2）。旧会话日志由平台在读路径自动升级，插件只需面向新词表。

---

## 6. 分阶段实施建议

### P0 —— 词表对齐（让 CI 重新变绿，恢复主要功能）
1. 升依赖至 `0.1.5-rc.1`，重生成 `pnpm-lock.yaml`；
2. `assistant-definition.ts` / `tool-definition.ts` 事件改名（§3.1、§3.2）；
3. `surface-definition.ts` 的 `startSeq/endSeq` + `chunkrow` 守卫（§3.3、§3.5）；
4. 测试夹具补 `stream` 字段；
5. 临时处理 `request-header-definition.ts`：`system` 置空并加 TODO，保证先编译通过。

**验收**：`pnpm run typecheck` 0 错误；`pnpm test` 全绿且**新测试真实命中新事件名**。

### P1 —— 系统提示词重建（恢复静默丢失的功能）
1. 新增 `system-message-definition.ts`，采用 `ctx.uiConversation.inspectSystemPrompt`；
2. 重写 `request-header-definition.ts`，采用 `ctx.uiConversation.inspectRequestPrompt` 闭包注入；
3. 打通 `snapshot-builder.ts` → `contract.ts` → `WorkflowView.tsx` 的 system 节点消费；
4. 补 `system/message`（含替换语义）的单测。

**验收**：「系统提示词」面板有内容；请求头变更分类（initial / system / tools / system-and-tools）在系统提示词被 replace 时仍正确。

### P2 —— 收尾与加固
1. 对照上游 trajectory 0.1.5 复核 `snapshot-builder` / `layout` / `event-projection` 是否还有其他漂移；
2. 补 PTC 派发子树（`tool/ptc-dispatch*`）的回归测试；
3. 更新 `AGENTS.md`（适配面版本、新增文件的「改哪块先读什么」条目）与 `README.md` 兼容版本表；
4. 打 `v0.3.0`，产出 tgz，重装到 `web` profile 并做浏览器端冒烟（Network 中 `/plugins/dsh-plugin-agent-workflow/client.js?rev=…` 返回 200，Console 无 `Failed to load plugins`）。

---

## 7. 测试与验收

| 项 | 现状 | 适配后要求 |
|---|------|-----------|
| `pnpm run typecheck` | ❌ 27 错误 | 0 错误 |
| `pnpm test` | ⚠️ 23/23 空转通过 | 全绿且用例**真实覆盖**新事件名 |
| `pnpm pack` | 未验证 | 成功产出 tgz |
| 浏览器端 | 未验证 | 标签页出现；流式行、PTC 子调用树、系统提示词面板均正常 |

> CI 闸门（`.github/workflows/ci.yml`：typecheck + test + pack）在 P0 之前会**持续红**，这是预期的。

---

## 8. 风险与决策点

| # | 风险 / 决策 | 说明 | 建议 |
|---|------------|------|------|
| 1 | **0.1.5 尚为 RC** | npm `latest` 已是 `0.1.5-rc.1`，但仍是 rc 而非 stable | 可先升 rc；stable 发布后跟进一次小版本。若追求稳妥，等 stable |
| 2 | 是否维持 `0.1.2-alpha.4` 双轨兼容 | 双轨需同时维护两套事件词表与两版 system prompt 供给路径，复杂度翻倍 | **不建议**。单轨升到 0.1.5，旧日志交给 dsh 的格式迁移 |
| 3 | `peerDependencies` 范围策略 | 当前为精确钉定（`0.1.2-alpha.4`） | 建议升为 `^0.1.5-rc.1` 或精确 `0.1.5-rc.1`；精确钉定更利于复现，与项目既有约定一致 |
| 4 | 上游 trajectory 后续继续漂移 | 本插件的投影层是 trajectory 的衍生实现，上游每次改词表都会再次冲击本项目 | 建议在 P2 增加一条「上游对照清单」记录，或在 CI 加一个「与 trajectory 事件词表一致性」的守护测试 |
| 5 | 静默降级难以察觉 | §4 的 5 条不会报错，只让界面内容变少 | 建议为「流式行 / PTC 子树 / 系统提示词」各加一条断言型单测，作为长期护栏 |

---

## 附录 A：证据索引

| 结论 | 证据位置 |
|------|---------|
| 事件词表增删 | `@deepseek-ai/dsh-session/lib/index.js` 的 `KNOWN_SESSION_EVENT_TYPES`（两版对照） |
| `assistant/live-chunk` 定义 | `@deepseek-ai/dsh-api-session-controller/lib/types/client/contract/events.d.ts` |
| `SurfaceOp` 字段改名 | `@deepseek-ai/dsh-session/lib/types/types.d.ts`（旧 L403 / 新 L429） |
| `EpochHeader.system` 移除 | 同上（旧 L201 / 新 L208） |
| `system/message` 事件 + `SystemPromptNode` | `@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/request-inspection.d.ts`、`contract/system-prompt.d.ts` |
| inspector 服务方法 | `@deepseek-ai/dsh-client-ui-conversation/lib/types/client/conversation/assembly.d.ts`（`UiConversation` L81/L94） |
| 上游采用写法 | `@deepseek-ai/dsh-client-ui-trajectory/lib/client.js` L746/832/843/867/1188/1299/1300/1634 |
| 平台种子模块表 | `@deepseek-ai/dsh-web-frontend/dist/assets/index-*.js` 的 `staticModules` |
| 旧日志自动迁移 | `@deepseek-ai/dsh-session-format-v2-to-v3/lib/index.js` L482-488、L826-832 |
| 清单字段仍受支持 | `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 等的 `package.json` 的 `dsh.bundle` |

## 附录 B：复现实验

```powershell
$src = 'D:\Users\AZ-Hypon\Documents\dshWorkSpace\dsh-plugin-agent-workflow'
$dst = 'D:\Users\AZ-Hypon\Documents\dshWorkSpace\_dsh-adapt-check\app'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Get-ChildItem -LiteralPath $src -Force |
  Where-Object { $_.Name -notin @('node_modules','lib','.git','coverage') -and $_.Name -notlike '*.tgz' } |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $dst -Recurse -Force }

$p = Join-Path $dst 'package.json'
Set-Content -LiteralPath $p -Value ((Get-Content $p -Raw) -replace '0\.1\.2-alpha\.4','0.1.5-rc.1') -NoNewline -Encoding UTF8
Remove-Item (Join-Path $dst 'pnpm-lock.yaml') -Force

Set-Location $dst
pnpm install --ignore-scripts --no-frozen-lockfile
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit   # → 27 errors
node node_modules/vitest/vitest.mjs run                          # → 23 passed（空转）
```

> 注：直接 `pnpm run typecheck` 会触发 `prepare` 脚本重跑构建（`pnpm install` 的依赖校验），导致输出混杂；调试时请直接调用 `node node_modules/typescript/bin/tsc`。

---

## 附录 C：实施记录（2026-09-02 完成）

### 与方案的差异

| # | 方案原定 | 实际做法 | 理由 |
|---|---------|---------|------|
| 1 | `system-message-definition.ts` 仿上游发出 `request-header` / `system-prompt` 节点 | 采用**纯状态型 Context**（不声明 `target`，也不声明 `buildViewNode`） | 契约要求 `target` 与 `buildViewNode` **同时声明或同时省略**（`dsh-client-ui-conversation` L2274 运行时校验），且 `target` 注释明确 "omitted for state-only Contexts"。本插件的系统提示词在**请求详情面板内**按「该请求实际生效内容」呈现，独立成卡会与面板重复 |
| 2 | 新增 `'system-prompt'` 贡献类型并改视图 | **未引入**，视图层零改动 | 同上；`request.prompt.system` 经 `inspectRequestPrompt` 恢复正确后，既有面板与 `promptChange` 分类即自动恢复 |
| 3 | `WorkflowSurfaceRecord` 字段「若引用 `SurfaceOp` 需同步」 | 直接改名为 `startSeq` / `endSeq` | 对齐 dsh 词表（本次适配的目的），而非在边界做映射转换 |
| 4 | 未预见 | 新增并提交根目录 `pnpm-workspace.yaml` | pnpm 11 内置 24 小时 `minimumReleaseAge` 策略（cutoff 实测 = 当前时间 − 24h）会使 CI 的 `pnpm install --frozen-lockfile` **直接失败**；`minimumReleaseAgeExclude` 是官方放行口 |
| 5 | 未预见 | `assistant/attempt` **有意不处理** | 与上游 trajectory 0.1.5 一致（其重试呈现由 `llm/retry` 覆盖）；上游对该事件匹配数为 0 |

### 实际改动

**新增**
- `src/client/projection/system-message-definition.ts` — 经 `uiConversation.inspectSystemPrompt` 追踪有效系统提示词节点
- `tests/system-prompt.client.spec.ts` — 8 例：状态型 Context 形状、匹配条件、inspector 传参、合成请求头、基线取舍
- `tests/tool-dispatch.client.spec.ts` — 4 例：`tool/ptc-dispatch*` 改名的回归护栏 + 子/孙调用嵌套
- `pnpm-workspace.yaml` — pnpm 供应链时限放行名单
- `docs/dsh-0.1.5-adaptation-plan.md` — 本文件

**修改**
- `package.json` — 26 处依赖钉定 `0.1.2-alpha.4` → `0.1.5-rc.1`；版本 `0.2.1` → `0.3.0`
- `pnpm-lock.yaml` — 全量重解析
- `src/client/index.ts` — 注册 `registerWorkflowSystemMessageDefinition`
- `assistant-definition.ts` — 5 处 `'assistant/chunk'` → `'assistant/live-chunk'`
- `tool-definition.ts` — 6 处 `'tool/code-dispatch*'` → `'tool/ptc-dispatch*'`
- `surface-definition.ts` — `startSeq`/`endSeq`；移除失效的 `chunkrow/` 守卫，改为排除 `'assistant/live-chunk'`
- `request-header-definition.ts` — 重写为 `inspectRequestPrompt` 闭包注入
- `contract.ts` — 新增 `WorkflowSystemMessageState`；`WorkflowSurfaceRecord` 字段改名
- `snapshot-builder.ts` — 同步 `operation.startSeq/endSeq`
- `tests/assistant-definition.client.spec.ts` — 夹具补 `stream`、改名、新增 `liveChunk()` helper
- `tests/registration.client.spec.tsx` — 补两条注册断言
- `AGENTS.md` / `README.md` — 版本、结构、数据契约、事件词表约束、pnpm 策略说明

### 验收结果

| 闸门 | 结果 |
|------|------|
| `pnpm install --frozen-lockfile`（CI 安装命令） | exit 0 |
| `pnpm run typecheck` | exit 0，**0 错误**（适配前基线 27） |
| `pnpm test` | 9 文件 / **35 测试通过**（适配前 7 文件 / 23 测试） |
| `pnpm pack` | exit 0，产出 `dsh-plugin-agent-workflow-0.3.0.tgz` |
| 产物体检 | 外部 `require` 仍仅 `@deepseek-ai/dsh-client-ui-primitives`（平台种子模块）；`__ModuleLoader__.load` 的 `id` = 包名 |

### 尚未完成

- **浏览器端冒烟**：需重装到 `web` profile 并重启 dsh，由人工确认标签页、流式行、PTC 子调用树、系统提示词面板。
- 事件覆盖集已与上游 trajectory 0.1.5 逐项比对**完全一致**（各 17 个事件类型）；`StreamChunk` 联合类型两版**逐字相同**。
