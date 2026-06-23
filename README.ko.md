# claude-muster

<p align="center">
  <img src="./assets/header.jpg" alt="claude-muster — orchestrate every agent, from one root" width="100%">
</p>

[English](./README.md) · [日本語](./README.ja.md) · [中文](./README.zh-CN.md) · 한국어 · [Español](./README.es.md) · [Français](./README.fr.md)

**모든 에이전트를, 하나의 뿌리에서 지휘하세요.**

각 저장소의 Claude를 그 저장소 안에서, 그 저장소 본래의 skill · agent · hook · 설정 그대로 돌립니다. 당신은 하나의 Claude 세션에서 모든 저장소를 가로지르며 작업하게 됩니다.

<p align="center">
  <img src="./assets/demo.gif" alt="하나의 세션에서 claude-muster 실행: 저장소 목록, 한 저장소 본래의 Claude로 작업 위임, 같은 작업을 모든 저장소에 한 번에 펼치기" width="100%">
</p>

<p align="center"><em>저장소를 찾고, 한 저장소 본래의 Claude에 작업을 보내고, 같은 작업을 모든 저장소에 한 번에 펼친다 — 모두 하나의 뿌리에서.</em></p>

## 이런 상황

작업 폴더 안에 독립된 git 저장소가 여러 개 나란히 놓여 있다고 해봅시다:

```
~/work/
├── webapp/    → .claude/skills/deploy, .claude/commands/release 를 가짐
├── api/       → .claude/skills/lint, .claude/agents/db-reviewer, .claude/hooks/pre-commit 을 가짐
└── mobile/    → .claude/commands/build 을 가짐
```

저장소마다 자기 `.claude/`(팀이 작성한 skill · agent · command · hook · 설정)를 품고 있습니다.

`api/` **안에서** Claude Code를 열면 api의 도구 일습을 그대로 쓸 수 있습니다. 여기까지는 좋습니다. 그런데 세 저장소를 한꺼번에 다루려고 `~/work/`에서 여는 순간 그 도구들이 사라집니다. Claude Code는 `.claude/`를 "지금 있는 폴더와 그 위쪽 폴더"에서만 읽을 뿐, 아래쪽 폴더는 절대 보지 않기 때문입니다.

가장 떠올리기 쉬운 해법은 "전부 위로 끌어올리기"입니다. 각 저장소의 `.claude/`를 `~/work/.claude/`로 복사하거나 symlink 하는 거죠. skill은 그걸로 동작합니다. 하지만 나머지는 조용히 망가집니다. `api/` 안에서 돌도록 작성된 hook이 이제 `~/work/`에서 엉뚱한 작업 디렉터리로 실행됩니다. 한 저장소의 `deny` 권한이 다른 모든 저장소의 작업을 말없이 막아 버립니다. 두 저장소가 모두 `API_URL`을 설정하면 하나의 값으로 뭉개져 충돌합니다. agent는 복사할 수밖에 없으니 점점 낡아 갑니다. 정신을 차려 보면 작업이 아니라, 뒤섞인 `.claude/`를 돌보는 데 시간을 쓰고 있습니다.

## claude-muster가 하는 일

claude-muster는 정반대로 합니다. 모든 도구를 하나의 세션으로 **끌어올리는** 대신, 각 저장소의 `.claude/`를 있던 자리에 그대로 두고 **그 저장소의 Claude를 그 저장소 안에서** 돌립니다. 뿌리에서 연 Claude는 오케스트레이터가 됩니다. 어떤 작업이 어느 저장소의 것인지 판단하고, 그 저장소에 작업을 넘기고, 결과를 받아 읽습니다.

```console
$ cd ~/work
$ claude-muster repos

  3 repos you can dispatch to:

  webapp
  api
  mobile

$ claude-muster dispatch api "handler.ts 에서 깨진 테스트를 고쳐줘"

  [api] ok

  찾았습니다: handler.ts 가 옛날 2-인자 `parse()` 를 호출하고 있었어요. 호출을 고쳤더니 테스트가 통과합니다.
```

자식은 `api/` **안에서** `claude`를 돌렸습니다. 그래서 api 본래의 작업 디렉터리 · 환경 변수 · skill · agent · hook · 권한을, 당신이 직접 api를 연 것과 똑같이 그대로 가지고 있습니다. 아무것도 복사하지 않았고, 아무것도 병합하지 않았습니다. 낡아 갈 것도, 치울 것도 없습니다.

여기에 더해 라우팅 skill을 설치하면, 뿌리의 Claude가 이걸 스스로 해내게 됩니다:

```console
$ claude-muster install     # ~/work/.claude/ 에 작은 skill 을 추가

$ claude
> api 의 깨진 테스트를 고치고, 김에 web 의 빌드 명령어가 뭔지 알려줘

  (Claude 가 api 에 dispatch 하고, web 에 dispatch 한 뒤, 둘 다의 결과를 보고)
```

skill이 발동하기를 기다릴 것 없이, 세션이 시작되는 순간부터 뿌리의 Claude에게 "어떤 저장소로 위임할 수 있는지" 알려 주고 싶다면 `--hook`을 붙이세요:

```console
$ claude-muster install --hook    # ~/work/.claude/settings.json 에 SessionStart 훅도 등록
```

이제 이 폴더에서 여는 모든 세션이 "어느 저장소로 dispatch 할 수 있는지"를 한 줄 요약으로 알려 주며 시작합니다. claude-muster가 `settings.json`에 쓰는 것은 이것뿐이며, `uninstall`이 그것을 정확히 원래대로 되돌립니다.

이게 이 도구의 전부입니다. **claude-muster 자신은 LLM을 절대 호출하지 않습니다.** `dispatch`가 띄우는 것은 당신 로컬의 `claude` CLI이고, 그것은 당신의 인증과 당신의 지갑으로 돌아갑니다. claude-muster는 그저 "어디로 보낼지"를 정하고 돌아온 것을 모을 뿐입니다.

## 설치

> **아직 npm에 없습니다.** 지금은 클론해서 빌드해 주세요. `npx claude-muster` 형태의 배포는 예정에 있습니다.

```bash
git clone https://github.com/mk668a/claude-muster
cd claude-muster
npm install && npm run build
npm link            # 어디서든 `claude-muster` 를 쓸 수 있게 함
```

그다음 아무 워크스페이스 루트에서 실행하면 됩니다:

```bash
cd ~/work
claude-muster repos
```

Node 18+ 가 필요합니다. 또한 `dispatch`가 그것을 실행하므로, `claude` CLI가 `PATH`에 있어야 합니다.

`npm link`를 쓰고 싶지 않다면 빌드된 파일을 직접 호출하세요: `node /path/to/claude-muster/dist/cli.js`.

### 당신의 머신에서 claude-muster 제거하기

차이에 주의하세요. `claude-muster uninstall`이 지우는 것은 **하나의 워크스페이스에 있는 라우팅 skill**이지, 도구 자체가 **아닙니다**. 도구 자체를 제거하려면 `npm link`를 되돌리고 클론을 삭제하세요:

```bash
npm rm -g claude-muster        # 또는: npm unlink -g claude-muster (`npm link` 를 되돌림)
rm -rf /path/to/claude-muster  # 클론한 폴더
```

`npm link`를 건너뛰고 `node .../dist/cli.js`를 직접 호출했다면, 클론을 삭제하기만 하면 됩니다.

## 사용법

```bash
claude-muster repos                      # dispatch 할 수 있는 자식 저장소를 나열
claude-muster dispatch <repo> "<task>"   # 그 저장소 안에서 `claude -p "<task>"` 를 실행
claude-muster dispatch --all "<task>"    # 같은 작업을 모든 저장소로 펼침
claude-muster install                    # 뿌리의 Claude 가 위임할 수 있도록 라우팅 skill 을 추가
claude-muster install --hook             # 세션 시작 시 뿌리의 Claude 에게 저장소 목록을 브리핑
claude-muster uninstall                  # 이 뿌리에서 skill(과 --hook 항목)을 제거
claude-muster --version                  # 설치된 버전을 출력 (짧은 형태: -v)
```

설치를 되돌리려면, 설치했던 바로 그 뿌리에서 `claude-muster uninstall`을 실행하세요. `muster-dispatch` skill을 제거하고, `--hook`을 썼다면 SessionStart 항목을 `settings.json`에서 빼냅니다(그 파일에 다른 것이 아무것도 남지 않으면 파일째로 삭제). claude-muster가 추가한 것만 제거합니다.

어떤 버전을 쓰고 있는지 확인하려면 `claude-muster --version`(또는 `claude-muster -v`)을 실행하세요.

유용한 플래그:

```bash
--root <dir>     # 스캔할 워크스페이스 루트 (기본값: 현재 디렉터리)
--json           # dispatch / repos 결과를 JSON 으로 출력 (부모 세션이 파싱하도록)
--timeout <ms>   # dispatch 한 자식이 너무 오래 돌면 종료
--depth <n>      # 자식 .claude/ 디렉터리를 얼마나 깊이까지 찾을지 (기본값: 1)
--path <dir>     # 이 머신의 다른 위치에 있는 저장소도 포함 (반복 지정 가능)
--force          # 기존 skill 을 덮어씀 (install 과 함께)
-v, --version    # 버전을 출력
-h, --help       # 모든 명령과 플래그를 표시
```

### 한 저장소로 보내기, 또는 전부로 펼치기

`dispatch <repo> "<task>"`는 하나의 완결된 작업을 하나의 저장소로 보냅니다. 작업은 "그 저장소에서 방금 새로 연 Claude"에게 시킨다고 생각하고 쓰세요. 자식은 뿌리의 대화를 전혀 기억하지 못하는, 바로 그 상태에서 시작하기 때문입니다.

`dispatch --all "<task>"`는 같은 작업을 모든 저장소로 병렬로 보내고 결과를 모읍니다. 조사나 일괄 작업을 위해 만들어졌습니다. *"테스트 명령어가 뭐야?"*, *"auth 관련 TODO가 어딘가에 있어?"*, *"버전을 2.0으로 올려줘"* 같은 것들이죠. 결과를 직접 집계하고 싶을 때는 `--json`과 함께 쓰세요.

### 선택적 설정

기본적으로 `.claude/`를 가진 형제 저장소가 모두 대상이 됩니다. `claude-muster.json`을 루트에 두면 범위를 좁힐 수 있습니다:

```jsonc
{
  "include": ["webapp", "api/*", "services/**"],  // 대상으로 삼을 저장소 (glob, 루트 기준 상대 경로)
  "exclude": ["legacy-*"],                          // 건너뛸 저장소
  "depth": 2,                                        // 몇 단계 아래까지 찾을지 (기본값: 1)
  "paths": ["../shared-tools", "/abs/path/to/repo"]  // 이 머신 어디든 있는 추가 저장소 (--path 로도 가능)
}
```

## 동작 방식

Claude Code는 각 저장소의 `.claude/`를 "그 저장소 자신의 폴더와 그 위쪽"에서 읽습니다. claude-muster는 그 규칙에 거스르지 않습니다. 그저 자식 저장소를 작업 디렉터리로 삼아 `claude`를 띄울 뿐입니다:

| 단계 | 일어나는 일 |
|---|---|
| **discover** | 루트를 훑어 `.claude/`를 가진 형제 디렉터리를 찾습니다 (`claude-muster.json`을 존중). |
| **decide** | 뿌리의 Claude(또는 커맨드라인의 당신)가 작업을 어느 저장소로 보낼지 정합니다. |
| **dispatch** | `cwd`를 그 저장소로 설정해 `claude -p "<task>" --output-format json`을 실행합니다. |
| **collect** | 자식의 최종 결과를 파싱해 오케스트레이터에게 돌려줍니다. |

자식은 자기 저장소에 뿌리내린 진짜 `claude` 프로세스이기 때문에, "전부 복사" 방식이 만들어 내던 모든 문제가 애초에 일어나지 않습니다:

- **작업 디렉터리가 올바릅니다.** hook과 스크립트는 그것이 작성된 저장소에서 실행됩니다.
- **교차 발화가 없습니다.** 각 저장소의 hook과 권한은 그 저장소의 세션에만 적용되고, 다른 저장소에는 절대 미치지 않습니다.
- **낡아 가는 것이 없습니다.** agent는 저장소에서 실시간으로 읽히고, 복사되지 않습니다.
- **환경 변수가 충돌하지 않습니다.** 각 자식 프로세스가 자기만의 환경을 가집니다.
- **치울 것이 없습니다.** symlink도, 병합된 설정도, manifest도 없습니다. `install`이 skill 하나를 더하고 `uninstall`이 그것을 빼냅니다.

## 안심하고 기댈 수 있는 이유

- **claude-muster는 LLM을 절대 호출하지 않습니다.** 돌리는 것은 당신 로컬의 `claude` CLI이고, 당신의 인증과 당신의 지갑으로 동작합니다. 자체 API 키도, 자체 네트워크도, 텔레메트리도 없습니다.
- **디스크를 거의 바꾸지 않습니다.** `dispatch`와 `repos`는 저장소를 찾기 위해 폴더를 읽기만 합니다. 유일하게 쓰는 것은 `install`의 라우팅 skill뿐이며, `uninstall`이 그것을 되돌립니다.
- **자식은 진짜 그 자체입니다.** `api`로 dispatch 하는 것은 당신이 직접 `api/`를 여는 것과 같습니다. 그래서 어떤 도구가 효력을 발휘하고 있는지에 대해 놀랄 일이 없습니다.

## (아직) 하지 않는 일

- **상주하는 자식 세션.** `dispatch`는 매번 완전히 새로운, 단발성 `claude -p` 실행입니다. 그래서 자식은 당신이 이전에 보낸 작업을 기억하지 못합니다. 저장소마다 데워진 세션을 오래 유지하는 것은 예정된 후속 작업입니다.
- **다른 머신의 저장소.** 로컬 파일 시스템 위라면 어디든 동작하지만(`paths` 참고), 원격이나 네트워크 너머의 저장소는 대상이 아닙니다.
- **모호할 때 대신 결정해 주기.** 한 작업이 여러 저장소에 걸칠 수 있다면, 오케스트레이터는 추측하지 말고 물어야 합니다. 라우팅 skill은 그렇게 행동하도록 작성되어 있습니다.

## 당신의 계정, 당신의 조건

`dispatch`는 당신이 로컬에 설치한 `claude` CLI를 당신 자신의 Anthropic 계정(Claude 구독이나 API 키)으로 실행합니다. claude-muster는 자격 증명을 제공하거나 저장하거나 공유하지 않으며, Claude Code의 문서화된 헤드리스 모드(`claude -p`)를 사용합니다. 당신의 플랜에 대해 [Anthropic의 약관과 사용 정책](https://www.anthropic.com/legal/aup)을 준수할 책임은 당신에게 있습니다.

실무적인 한 가지: `dispatch --all`은 여러 `claude` 프로세스를 한꺼번에 시작하므로, 폭넓게 펼치면 Anthropic의 rate limit에 걸릴 수 있습니다. 동시 실행 수를 적당히 유지하세요.

## 라이선스

MIT.
