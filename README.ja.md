# claude-muster

<p align="center">
  <img src="./assets/header.jpg" alt="claude-muster — orchestrate every agent, from one root" width="100%">
</p>

[English](./README.md) · 日本語 · [中文](./README.zh-CN.md) · [한국어](./README.ko.md) · [Español](./README.es.md) · [Français](./README.fr.md)

**すべてのエージェントを、ひとつの根から統べる。**

各リポジトリのClaudeを、そのリポジトリの中で、そのリポジトリ本来のskill・agent・hook・設定のまま動かす。あなたはひとつのClaudeセッションから、すべてのリポを横断して作業できる。

## こんな状況

作業フォルダの中に、独立したgitリポジトリがいくつも並んでいるとする。

```
~/work/
├── webapp/    → .claude/skills/deploy, .claude/commands/release を持つ
├── api/       → .claude/skills/lint, .claude/agents/db-reviewer, .claude/hooks/pre-commit を持つ
└── mobile/    → .claude/commands/build を持つ
```

各リポは自分の`.claude/`（チームが書いたskill・agent・command・hook・設定）を抱えている。

`api/`の**中**でClaude Codeを開けばapiの道具一式が使える。ここまではいい。ところが横断作業のために`~/work/`で開いた瞬間、その道具は消える。Claude Codeは`.claude/`を「今いるフォルダと、その上のフォルダ」からしか読まず、下のフォルダは見ないからだ。

素直な対処は「全部上に引き上げる」こと。各リポの`.claude/`を`~/work/.claude/`にコピー、またはsymlinkする。skillはそれで動く。だが残りは静かに壊れる。`api/`の中で動く前提で書かれたhookは、`~/work/`から間違った作業ディレクトリで走る。あるリポの`deny`権限が、他の全リポの作業を黙ってブロックする。両方が`API_URL`を設定していれば、ひとつの値に潰れて衝突する。agentはコピーするしかないので、古くなっていく。気づけば作業ではなく、混ざり合った`.claude/`の子守りに時間を使っている。

## claude-musterがすること

claude-musterは逆をやる。すべての道具をひとつのセッションに**引き上げる**のではなく、各リポの`.claude/`をその場に残したまま、**そのリポのClaudeを、そのリポの中で**走らせる。根で開いたClaudeはオーケストレーターになる。タスクがどのリポのものかを判断し、そのリポに渡し、結果を受け取る。

```console
$ cd ~/work
$ claude-muster repos

  3 repos you can dispatch to:

  webapp
  api
  mobile

$ claude-muster dispatch api "handler.tsの落ちてるテストを直して"

  [api] ok

  原因は handler.ts が旧 2 引数の `parse()` を呼んでいたこと。呼び出しを直してテストは通った。
```

子は`api/`の**中**で`claude`を走らせた。だからapi本来の作業ディレクトリ・環境変数・skill・agent・hook・権限を、あなたが自分でapiを開いたときとまったく同じように持っている。何もコピーしていない。何もマージしていない。古くなるものも、後始末するものもない。

さらに、ルーティングskillをインストールすれば、根のClaudeが自分でこれをやれるようになる。

```console
$ claude-muster install     # ~/work/.claude/ に小さな skill を追加

$ claude
> api の落ちてるテストを直して、ついでに web のビルドコマンドを教えて

  （Claude が api に dispatch し、web に dispatch し、両方の結果を報告する）
```

skillの発火を待たず、セッション開始の瞬間から根のClaudeに「委譲先のrepo」を知らせたい場合は`--hook`を付ける。

```console
$ claude-muster install --hook    # ~/work/.claude/settings.json に SessionStart フックも登録
```

これで、このフォルダで開く各セッションが「どのrepoにdispatchできるか」の一行要約付きで始まる。claude-musterが`settings.json`に書き込むのはこれだけで、`uninstall`がそれを正確に元へ戻す。

これがこのツールのすべて。**claude-muster自身はLLMを一切呼ばない。** `dispatch`が起動するのはあなたのローカルの`claude` CLIで、あなたの認証・あなたの財布で動く。claude-musterは「どこに送るか」を決めて、返ってきたものを集めるだけだ。

## インストール

> **まだnpm未公開。** 今はクローンしてビルドしてほしい。`npx claude-muster`での公開は予定している。

```bash
git clone https://github.com/mk668a/claude-muster
cd claude-muster
npm install && npm run build
npm link            # どこからでも `claude-muster` が使えるようになる
```

あとはワークスペースのルートで実行する。

```bash
cd ~/work
claude-muster repos
```

Node 18+。`dispatch`が走らせるので、`claude` CLIが`PATH`にあることも必要。

`npm link`を使いたくなければ、ビルド済みファイルを直接呼んでもいい: `node /path/to/claude-muster/dist/cli.js`。

### claude-muster本体をPCから削除する

区別に注意: `claude-muster uninstall`が消すのは**ひとつのワークスペースのルーティングskill**であって、ツール本体ではない。ツール自体をアンインストールするには、`npm link`を取り消してクローンを削除する。

```bash
npm rm -g claude-muster        # または: npm unlink -g claude-muster（`npm link` を取り消す）
rm -rf /path/to/claude-muster  # クローンしたフォルダ
```

`npm link`をせず`node .../dist/cli.js`を直接呼んでいた場合は、クローンを削除するだけでよい。

## 使い方

```bash
claude-muster repos                      # dispatch できる子リポを一覧
claude-muster dispatch <repo> "<task>"   # そのリポの中で `claude -p "<task>"` を走らせる
claude-muster dispatch --all "<task>"    # 同じタスクを全リポに展開
claude-muster install                    # 根の Claude が委譲できるよう、ルーティング skill を追加
claude-muster install --hook             # 起動時に根の Claude へ repo 一覧を知らせるフックも追加
claude-muster uninstall                  # この根から skill（と --hook のエントリ）を削除
claude-muster --version                  # インストール済みのバージョンを表示（短縮形: -v）
```

アンインストールするには、installしたのと同じ根で`claude-muster uninstall`を実行する。`muster-dispatch` skillを削除し、`--hook`を使っていた場合はSessionStartエントリを`settings.json`から取り去る（他に何も残らなければファイルごと削除）。claude-musterが追加したものだけを削除する。

バージョンを確認するには`claude-muster --version`（または`claude-muster -v`）を実行する。

主なフラグ:

```bash
--root <dir>     # スキャンするワークスペースルート（既定: カレント）
--json           # dispatch / repos の結果を JSON で出力（親セッションが parse する用）
--timeout <ms>   # 子が動きすぎたら打ち切る
--depth <n>      # 子の .claude/ をどこまで深く探すか（既定: 1）
--path <dir>     # マシン上の別の場所にあるリポも対象に含める（複数可）
--force          # 既存の skill を上書き（install 時）
-v, --version    # バージョンを表示
-h, --help       # 全コマンドとフラグを表示
```

### 1リポに送る、または全部に展開する

`dispatch <repo> "<task>"`は、ひとつの完結したタスクをひとつのリポに送る。タスクは「そのリポで開いたばかりのClaude」に頼むつもりで書くこと。子は根の会話を一切覚えていない、まさにその状態から始まるからだ。

`dispatch --all "<task>"`は同じタスクを全リポに並列で送り、結果をまとめる。調査や一斉作業のためのものだ。*「テストコマンドは？」*、*「authまわりのTODOはどこかにある？」*、*「バージョンを2.0に上げて」*。自分で結果を集計したいときは`--json`と組み合わせる。

### 任意の設定

既定では`.claude/`を持つ兄弟リポすべてが対象になる。`claude-muster.json`をルートに置けば絞れる。

```jsonc
{
  "include": ["webapp", "api/*", "services/**"],  // 対象にするリポ（glob、ルート相対）
  "exclude": ["legacy-*"],                          // 除外するリポ
  "depth": 2,                                        // 何階層下まで探すか（既定: 1）
  "paths": ["../shared-tools", "/abs/path/to/repo"]  // マシン上の別の場所にあるリポ（--path でも可）
}
```

## しくみ

Claude Codeは各リポの`.claude/`を「そのリポ自身のフォルダと、その上」から読む。claude-musterはそれに逆らわない。ただ`claude`を、子リポを作業ディレクトリにして起動するだけだ。

| ステップ | 内容 |
|---|---|
| **discover** | ルートを歩いて`.claude/`を持つ兄弟ディレクトリを探す（`claude-muster.json`を尊重）。 |
| **decide** | 根のClaude（またはコマンドラインのあなた）が、タスクをどのリポに送るか決める。 |
| **dispatch** | `cwd`をそのリポにして`claude -p "<task>" --output-format json`を走らせる。 |
| **collect** | 子の最終結果をparseし、オーケストレーターに返す。 |

子はそのリポに根ざした本物の`claude`プロセスなので、「全部コピー」方式が生むあらゆる問題が、そもそも起きない。

- **作業ディレクトリが正しい。** hookやスクリプトは、それが書かれたリポから走る。
- **クロス発火しない。** 各リポのhookと権限は、そのリポのセッションにだけ効き、他には及ばない。
- **古くならない。** agentはリポからliveで読まれ、コピーされない。
- **環境変数が衝突しない。** 各子プロセスが独立した環境を持つ。
- **後始末がない。** symlinkもマージ済み設定もmanifestもない。`install`がskillをひとつ足し、`uninstall`が取り去る。

## 安心して頼れる理由

- **claude-musterはLLMを一切呼ばない。** 走らせるのはあなたのローカルの`claude` CLI、あなたの認証・あなたの財布。独自のAPIキーもネットワークもテレメトリもない。
- **ディスクをほぼ変更しない。** `dispatch`と`repos`はリポ発見のためにフォルダを読むだけ。書き込むのは`install`のルーティングskillだけで、`uninstall`が元に戻す。
- **子は本物そのもの。** `api`へのdispatchは、自分で`api/`を開くのと同じ。どの道具が効いているかで驚かされることはない。

## まだやらないこと

- **常駐する子セッション。** `dispatch`は毎回まっさらな単発の`claude -p`実行なので、子は前回送ったタスクを覚えていない。リポごとに温まったセッションを保つのは今後の課題。
- **他マシンのリポ。** ローカルファイルシステム上ならどこでも動く（`paths`参照）が、リモートやネットワーク越しのリポは対象外。
- **曖昧なときに勝手に決めること。** タスクが複数リポにまたがりうるなら、オーケストレーターは推測せず尋ねるべきだ。ルーティングskillはそう振る舞うよう書いてある。

## あなたのアカウント、あなたの規約

`dispatch`が走らせるのは、あなたがローカルに入れた`claude` CLIを、あなた自身のAnthropicアカウント（ClaudeサブスクリプションかAPIキー）で動かしたものだ。claude-musterは認証情報を提供も保存も共有も一切せず、Claude Codeの文書化されたヘッドレスモード（`claude -p`）を使うだけ。あなたのプランについて[Anthropicの規約と利用ポリシー](https://www.anthropic.com/legal/aup)を守る責任は、あなた自身にある。

## ライセンス

MIT。
</content>
</invoke>
