# DeepSeek Harness Agent 工作流

中文 | [English](README.md)

`dsh-plugin-agent-workflow` 为 DeepSeek Harness Web UI 添加可独立安装的“工作流”标签页。它把每轮用户对话呈现为模型请求、响应与工具调用序列，既不导入、替换，也不修改内置的“轨迹”标签页。

## 功能

- 固定且独立滚动的用户轮次列表，显示提示词摘要、时间、调用总数和生命周期状态。
- 虚拟化模型调用行，请求、响应与工具卡片可横向滚动。
- 把当次请求中记录的 `system`、提供方无关 `messages[]` 与 `tools` 显示为可折叠 JSON 树，并提供复制和放大弹窗。
- 分别显示未缓存输入、缓存读取、缓存写入与输出 token。
- 显示工具运行中、完成和失败状态，以及耗时和结果摘要。
- 接入 `dsh@0.1.0-rc.7` 会话宿主的限高布局，让工作流页面内部负责滚动。

插件根据 Session 中真实记录的事件生成页面，不会从 Harness 源码中重建提示词，也不会增加任何模型可见输入或工具。

## 兼容范围

`0.1.x` 版本仅面向 `dsh@0.1.0-rc.7`。DeepSeek Harness 预发布版本之间的客户端 API 可能变化，因此升级宿主时也要根据 peer dependency 同步升级插件。

## 安装

把带标签的源码版本安装到 Web profile：

```sh
npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web add \
  github:xuanyuanzhifeng/dsh-plugin-agent-workflow#v0.1.0 --workspace-root
```

测试当前 `main` 分支时可以省略标签：

```sh
npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web add \
  github:xuanyuanzhifeng/dsh-plugin-agent-workflow --workspace-root
```

Git 依赖通过包内的 `prepare` 脚本从源码构建。pnpm 第一次安装时可能阻止执行该脚本；如果安装日志提示 build 被忽略，请把 pnpm 打印的准确包键加入 Web profile 的 `pnpm-workspace.yaml`，例如：

```yaml
allowBuilds:
  dsh-plugin-agent-workflow: true
```

然后重新执行安装命令并重启 `dsh web`。只应为可信的源码版本授权；固定 release 标签或 commit 可以防止安装内容随分支变化。

移除工作流标签页而不影响“轨迹”：

```sh
npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web remove \
  dsh-plugin-agent-workflow --workspace-root
```

## 开发

需要 Node.js `^22.19.0` 或 `>=24.0.0` 与 pnpm 11。

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm test
pnpm pack
```

`pnpm run build` 会在 `lib/` 下生成宿主入口、浏览器 closure-factory bundle、内联 CSS module、source map 和类型声明。`pnpm test` 会先重新构建，使客户端 bundle 测试覆盖用户实际安装的产物。

## 已知限制

- 汇总只覆盖客户端已加载的 Session 历史。页面打开时会请求更早的数据，但不会把无法取得的历史前缀计入总量。
- JSON 展开状态与卡片选中状态只保存在本地 UI 中，没有深链接地址。
- 同一次响应中的多次工具调用显示为可横向滚动的线性序列，而不是分支图。

## 许可证

MIT
