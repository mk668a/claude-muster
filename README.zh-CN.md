# claude-muster

<p align="center">
  <img src="./assets/header.jpg" alt="claude-muster — orchestrate every agent, from one root" width="100%">
</p>

[English](./README.md) · [日本語](./README.ja.md) · 中文 · [한국어](./README.ko.md) · [Español](./README.es.md) · [Français](./README.fr.md)

**统御每一个 agent，从同一个根。**

让每个仓库自己的 Claude 在它自己的文件夹里、带着它本来的 skill、agent、hook 和设置干活，你就能从同一个 Claude 会话里横跨所有仓库工作。

## 你会遇到的情况

假设你的工作目录里并排放着好几个独立的 git 仓库：

```
~/work/
├── webapp/    → 有 .claude/skills/deploy, .claude/commands/release
├── api/       → 有 .claude/skills/lint, .claude/agents/db-reviewer, .claude/hooks/pre-commit
└── mobile/    → 有 .claude/commands/build
```

每个仓库都带着自己的 `.claude/`：团队写好的 skill、agent、command、hook 和设置。

在 `api/` **里面** 打开 Claude Code，你就能用上 api 的全套工具。这没问题。可一旦为了横跨三个仓库一起干活而在 `~/work/` 打开它，那套工具就消失了。因为 Claude Code 只从当前文件夹以及它上层的文件夹读取 `.claude/`，从不往下看。

最直接的办法是把东西全往上搬：把每个仓库的 `.claude/` 复制或 symlink 进 `~/work/.claude/`。skill 是能这么用，但其余的会悄悄出问题。一个原本要在 `api/` 里跑的 hook，现在从 `~/work/` 以错误的工作目录运行。某个仓库的 `deny` 权限，会无声地挡住其他每一个仓库的操作。两个都设了 `API_URL` 的仓库，会被挤成同一个值而冲突。agent 只能靠复制，于是越来越陈旧。结果你不是在工作，而是在给一个混在一起的 `.claude/` 当保姆。

## claude-muster 做的事

它反着来。与其把每个仓库的工具往 *上* 拉进同一个会话，它把各仓库的 `.claude/` 原封不动留在原地，让 **那个仓库自己的 Claude 在那个仓库里** 运行。你根目录上的 Claude 变成一个编排者（orchestrator）：它判断某个任务属于哪个仓库，把任务交出去，再把结果读回来。

```console
$ cd ~/work
$ claude-muster repos

  3 repos you can dispatch to:

  webapp
  api
  mobile

$ claude-muster dispatch api "修好 handler.ts 里那个失败的测试"

  [api] ok

  找到了：handler.ts 调的是旧的两参数版 `parse()`。改掉这处调用，测试就通过了。
```

子进程是在 `api/` **里面** 跑的 `claude`，所以它拥有 api 真实的工作目录、环境变量、skill、agent、hook 和权限，就跟你自己在那儿打开 Claude 一模一样。什么都没复制，什么都没合并。没有会陈旧的东西，也没有要清理的东西。

更妙的是，装上路由 skill 之后，根目录的 Claude 就学会自己干这件事了：

```console
$ claude-muster install     # 往 ~/work/.claude/ 里加一个小 skill

$ claude
> 修好 api 里那个失败的测试，顺便告诉我 web 的构建命令是什么

  （Claude dispatch 到 api，dispatch 到 web，把两边的结果都报告回来）
```

想让根目录的 Claude 在会话一开始就知道有哪些仓库，而不必等 skill 触发？加上 `--hook`：

```console
$ claude-muster install --hook    # 同时在 ~/work/.claude/settings.json 里注册一个 SessionStart hook
```

这样，在这个文件夹里开的每个会话，开头都会带一行简报，说明它能 dispatch 到哪些仓库。这是 claude-muster 唯一写进你 `settings.json` 的东西，而 `uninstall` 会把它原样取出来。

这就是这个工具的全部。**claude-muster 自己从不调用 LLM。** `dispatch` 启动的是你本地的 `claude` CLI，它跑在你自己的认证、你自己的钱包上。claude-muster 只决定把活儿往哪儿送，再把回来的东西收齐。

## 安装

> **还没上 npm。** 目前请克隆下来自己构建。已经计划发布 `npx claude-muster`。

```bash
git clone https://github.com/mk668a/claude-muster
cd claude-muster
npm install && npm run build
npm link            # 让 `claude-muster` 在任何地方都能用
```

然后在任意工作区根目录运行它：

```bash
cd ~/work
claude-muster repos
```

需要 Node 18+。你还需要 `claude` CLI 在你的 `PATH` 上（`dispatch` 跑的就是它）。

不想 `npm link`？直接调用构建好的文件即可：`node /path/to/claude-muster/dist/cli.js`。

### 把 claude-muster 从机器上卸掉

注意区别：`claude-muster uninstall` 删的是 **某一个工作区里的路由 skill**，而 **不是** 工具本身。要卸掉工具本体，得撤销 `npm link` 并删掉克隆下来的目录：

```bash
npm rm -g claude-muster        # 或: npm unlink -g claude-muster，撤销 `npm link`
rm -rf /path/to/claude-muster  # 你克隆下来的那个文件夹
```

如果你没做 `npm link`，而是直接跑的 `node .../dist/cli.js`，那删掉克隆目录就够了。

## 用法

```bash
claude-muster repos                      # 列出你能 dispatch 的子仓库
claude-muster dispatch <repo> "<task>"   # 在那个仓库里跑 `claude -p "<task>"`
claude-muster dispatch --all "<task>"    # 把同一个任务展开到每个仓库
claude-muster install                    # 加上路由 skill，让根目录的 Claude 能委派任务
claude-muster install --hook             # 同时在会话开始时给根目录的 Claude 简报有哪些仓库
claude-muster uninstall                  # 从这个根目录移除 skill（以及任何 --hook 写入的条目）
claude-muster --version                  # 打印已安装的版本（短写: -v）
```

要撤销一次 install，就在当初 install 的同一个根目录运行 `claude-muster uninstall`。它会删掉 `muster-dispatch` skill；如果你用过 `--hook`，还会把 SessionStart 条目从 `settings.json` 里取出来（如果文件里再没别的内容，就连文件一起删掉）。它只会移除 claude-muster 加进去的东西。

想看自己是哪个版本，运行 `claude-muster --version`（或 `claude-muster -v`）。

常用的 flag：

```bash
--root <dir>     # 要扫描的工作区根目录（默认: 当前目录）
--json           # 把 dispatch / repos 的结果以 JSON 输出，供父会话解析
--timeout <ms>   # 子进程跑太久就把它杀掉
--depth <n>      # 向下找子 .claude/ 目录找多深（默认: 1）
--path <dir>     # 把机器上其他位置的仓库也纳进来；可重复
--force          # 覆盖已存在的 skill（配合 `install`）
-v, --version    # 打印版本
-h, --help       # 显示所有命令和 flag
```

### 发给一个仓库，或展开到全部

`dispatch <repo> "<task>"` 把一个自成一体的任务发给一个仓库。写任务时，就当作是在对一个刚在那个仓库里打开的全新 Claude 说话，因为它正是如此：子进程对你根目录里的对话毫无记忆，从零开始。

`dispatch --all "<task>"` 把同一个任务并行发给每个仓库并收齐结果。它是为普查和批量扫描而生的：*「你的测试命令是什么？」*、*「哪儿有关于 auth 的 TODO 吗？」*、*「把版本号升到 2.0」*。想自己来汇总答案时，把它和 `--json` 搭配使用。

### 可选配置

默认情况下，每个带 `.claude/` 的同级仓库都会被纳入。在根目录放一个 `claude-muster.json` 就能收窄范围：

```jsonc
{
  "include": ["webapp", "api/*", "services/**"],  // 要纳入的仓库（glob，相对于根目录）
  "exclude": ["legacy-*"],                          // 要跳过的仓库
  "depth": 2,                                        // 向下找几层（默认: 1）
  "paths": ["../shared-tools", "/abs/path/to/repo"]  // 机器上任意位置的额外仓库（也可用 --path）
}
```

## 它是怎么工作的

Claude Code 从每个仓库自己的文件夹以及它上层的文件夹读取该仓库的 `.claude/`。claude-muster 从不跟这套机制对着干，它只是把子仓库设为工作目录来启动 `claude`：

| 步骤 | 发生了什么 |
|---|---|
| **discover** | 遍历根目录，找出包含 `.claude/` 的同级目录（遵循 `claude-muster.json`）。 |
| **decide** | 根目录的 Claude（或命令行上的你）挑出某个任务属于哪个仓库。 |
| **dispatch** | 把 `cwd` 设为那个仓库，运行 `claude -p "<task>" --output-format json`。 |
| **collect** | 解析子进程的最终结果，交还给编排者。 |

因为子进程是一个真正扎根于自己仓库的 `claude` 进程，「全部复制」那套办法制造的每一个问题，在这里压根就不会出现：

- **工作目录是对的。** hook 和脚本都从它们当初为之而写的那个仓库里运行。
- **不会交叉触发。** 每个仓库的 hook 和权限只对那个仓库的会话生效，绝不波及其他。
- **不会变陈旧。** agent 是从仓库里实时读取的，从不复制。
- **环境变量不冲突。** 每个子进程都有自己独立的环境。
- **没有要清理的东西。** 没有 symlink、没有合并过的设置、没有清单文件。`install` 加一个 skill，`uninstall` 把它取走。

## 为什么可以放心依赖它

- **claude-muster 从不调用 LLM。** 它跑的是你本地的 `claude` CLI，用你的认证、你的钱包。没有 API key、没有它自己的网络、没有遥测。
- **它几乎不动你的磁盘。** `dispatch` 和 `repos` 只读你的文件夹来发现仓库。它唯一会写入的，是 `install` 装的那个路由 skill，而 `uninstall` 会把它取回。
- **每个子进程都是货真价实的那个东西。** dispatch 到 `api` 等同于你自己打开 `api/`，所以不会在「哪套工具在起作用」上出什么意外。

## 它（暂时）还不做的事

- **常驻的子会话。** 每次 `dispatch` 都是一次全新的、一次性的 `claude -p` 运行，所以子进程不记得你上次发给它的任务。给每个仓库保留一个预热好的长期会话，是已经规划好的后续。
- **其他机器上的仓库。** 本地文件系统上的任何位置都行（见 `paths`），但远程或网络上的仓库不行。
- **替你在模棱两可时拍板。** 如果一个任务可能属于好几个仓库，编排者应当发问而不是瞎猜。路由 skill 就是照这个原则写的。

## 你的账号，你说了算

`dispatch` 用的是你本地装好的 `claude` CLI，跑在你自己的 Anthropic 账号下（Claude 订阅或一个 API key）。claude-muster 从不提供、存储或分享任何凭据，并且用的是 Claude Code 有文档记载的无头模式（`claude -p`）。你自己负责让用法符合 [Anthropic 的条款与使用政策](https://www.anthropic.com/legal/aup)（按你自己的套餐）。

一个实用提醒：`dispatch --all` 会一次启动好几个 `claude` 进程，如果你展开的面铺得太广，可能会撞上 Anthropic 的速率限制。把并发数控制在合理范围。

## 许可证

MIT。
