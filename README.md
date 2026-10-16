# ZCode OpenAI OAuth Patcher

**中文** | [English](README_EN.md)

给 ZCode 桌面版加入独立的 **OpenAI 模型供应商**。通过 ChatGPT 订阅 OAuth 登录后，可使用当前账号被授权的 GPT 模型，同时保留原有 Z.ai / BigModel 应用身份。

## 平台状态

| 平台 | 状态 |
|---|---|
| Windows | 支持原有静态补丁与实验性 runtime patch 流程 |
| Linux AppImage | 支持独立 AppDir 流程，不修改官方 AppImage |

### 已验证

- Windows profile：ZCode **3.10.2、3.11.2、3.14.3、3.14.5、3.15.3**
- Linux 端到端：**Fedora Linux 44 x86-64 + ZCode 3.15.3 AppImage + Node.js 22.23.1**
- Linux 实测通过：**25/25 compatibility probe、完整 patch/repack dry-run、patched AppDir 启动、OpenAI Provider UI、浏览器 OAuth、模型连接、现有 MCP / skills 保持可用**

Linux 版本是否可部署仍以实际 `--probe`、`--dry-run` 和运行测试为准；Windows 某个 profile 已验证，不代表同版本 Linux bundle 自动获得验证。

## Linux / AppImage 快速使用

Linux 流程不会修改原始 `zcode.AppImage`。它会临时解包、严格校验 profile、生成独立 patched AppDir，并保留上一份 patched AppDir 供回滚。

```bash
git clone https://github.com/unsocialz2/zcode-openai-oauth.git
cd zcode-openai-oauth

bash patch-linux.sh --probe
bash patch-linux.sh --dry-run
bash patch-linux.sh --install
zcode-openai-oauth
```

默认官方 AppImage：

```text
~/.local/bin/zcode.AppImage
```

默认 patched AppDir：

```text
~/.local/share/zcode-openai-oauth/ZCode.AppDir
```

默认启动器：

```text
~/.local/bin/zcode-openai-oauth
```

启动后进入：

```text
Settings -> Model Providers -> OpenAI -> Connect OpenAI
```

然后在浏览器完成 OAuth。

完整 Linux 文档见 [LINUX.md](LINUX.md)。

## Linux 更新与回滚

查看当前 patched 版本，以及官方 AppImage 是否已变化：

```bash
bash patch-linux.sh --status
```

官方 AppImage 更新后，不要直接覆盖 patched AppDir。先执行：

```bash
bash patch-linux.sh --probe
```

若 probe 通过，再执行：

```bash
bash patch-linux.sh --update
```

若新版本没有 verified profile，或关键结构发生变化，工具会 fail closed，当前可用 patched AppDir 不会被替换。

回滚到上一份 patched AppDir：

```bash
bash patch-linux.sh --rollback
```

推荐更新流程：

```bash
git pull
bash patch-linux.sh --status
bash patch-linux.sh --probe
bash patch-linux.sh --update
```

这不能保证所有未来版本自动兼容，但可以把更新流程变成“先验证、成功后替换、失败不动、可快速回滚”。

## Windows 快速使用

```bat
git clone https://github.com/unsocialz2/zcode-openai-oauth.git
cd zcode-openai-oauth
patch.bat
```

常用命令：

```bat
node patch.js --probe
node patch.js --dry-run
node patch.js --no-deploy
node patch.js --self-test
node patch.js --restore
node patch.js --dir <路径>
```

## 当前功能

- OpenAI 是独立一级 provider，不会替换 Z.ai / BigModel 应用账号。
- OpenAI 页面提供连接、断开连接与状态显示。
- 模型列表从 Codex catalog 动态同步，并按当前账号 / workspace entitlement 显示。
- 用户手动添加的模型、显式规则、上下文覆盖、排序以及其他 provider 配置在同步时保持不变。
- 首次连接、启动、token 刷新和手动刷新会同步在线模型目录。
- 请求走适配 ChatGPT/Codex 订阅后端的 Responses API 流程，包括 `store:false` 与 streaming。

## 兼容策略

本项目默认 **fail closed**：

- exact-version profile 必须匹配；
- 所有关键 anchor / resolver、语法检查、postcondition 和关键不变量必须通过；
- 未知版本只允许 probe 分析，不允许静默部署；
- 不猜测 minified 变量，也不做模糊替换；
- 新版 profile 尽量使用 structural resolver 以降低小版本维护成本，但无法保证任意未来版本无条件兼容。

## 主要文件

- `patch.js` — 核心 patch / probe / repack / Windows deploy 引擎
- `patch-core.cjs` — semantic transform、structural resolver、关键不变量
- `profiles/` — 精确版本 profile
- `transforms/` — semantic transform 定义
- `runtime/` — Windows 实验性 runtime patch 模式
- `linux-appimage.js` — Linux AppImage 解包、校验、安装、状态、更新与回滚
- `patch-linux.sh` — Linux 入口脚本
- `LINUX.md` — Linux 详细说明与验证矩阵

## 许可证

MIT，见 [LICENSE](LICENSE)。

## 免责声明

本项目用于学习与研究。它使用 Codex CLI 的公开 OAuth client 与观察到的 ChatGPT/Codex 后端行为，而不是常规 OpenAI API 计费路径。请遵守 OpenAI 与 ZCode 的服务条款；未公开接口行为可能变化，使用风险由使用者自行承担。
