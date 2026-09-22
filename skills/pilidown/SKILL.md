---
name: "pilidown"
description: "Bilibili 视频/音频/合集/弹幕/字幕下载与数据查询工具。FFmpeg 优先无损封装，无 FFmpeg 时自动无感降级为纯原生内置流式合并；支持提取音频、批量下合集、导出弹幕/字幕、查收藏/历史。触发词：下载B站视频、B站视频下载、下载B站音频、B站音频提取、B站合集下载、下载合集、B站弹幕、B站字幕、B站收藏夹、B站历史记录、pilidown。"
---

# pilidown - Bilibili Downloader Skill

轻量级 B 站 CLI 与 Agent 技能（仅需 Node.js 20+；优先使用系统 FFmpeg 权威流复制无损封装，在缺少 FFmpeg 的纯净环境中自动平滑降级为纯代码级内置流式合并）。
- **执行路径**：`<skill_dir>/bin/pilidown.cmd`（Windows）或 `<skill_dir>/bin/pilidown`（Unix/macOS）。下文简写为 `pilidown`。
- **运行机制**：预打包单文件（`bin/cli.cjs`），开箱即用。具备“FFmpeg 优先 + 内置原生合并自动兜底”的双轨融合引擎与断点直写能力。

## 标准执行生命周期 (Execution Lifecycle)

1. **预检与确认（Checkpoints）**：
   - **登录状态**：执行下载前可运行 `pilidown status --json` 检查登录态（已登录可达 1080P，未登录通常 360P）。
   - **交互登录确认**：调用 `pilidown login` 前必须征求用户同意（会启动扫码页面或终端二维码）。
   - **高消耗确认**：下载大型合集（`--collection`）或全部分P（`--all`）前，应向用户说明总集数并确认。
2. **结构化执行（Execution）**：
   - Agent 内部调用一律追加 `--json`，以 JSON Lines 流式解析结果与退出码（0 = 成功，1 = 失败）。仅在向用户直接展示终端输出时才省略 `--json`。
   - 禁止在 `download` 前冗余调用 `info` 或 `stream`（下载命令内部会自动协商元数据与流地址）。
3. **交付与自愈（Delivery & Recovery）**：
   - 检查返回的 `failures` 数组与错误码，若遇异常按下方 SOP 自动恢复或降级。

## 意图与命令速查矩阵 (Command Routing Matrix)

| 用户意图 | 推荐命令模板 | 关键参数说明 |
|---|---|---|
| **下载单视频** | `pilidown download <url-or-bv> --output <dir>` | 优先使用系统 FFmpeg 流复制封装；无 FFmpeg 时自动无感降级为 fMP4 直通合并（O(1) 内存）。可追加 `-q <qn>` 或 `--page <n>`。 |
| **强制纯内置合并** | `pilidown download <url-or-bv> --builtin-merge --output <dir>` | 显式跳过系统 FFmpeg，强制走纯 Node.js 代码级合并。 |
| **下载合集** | `pilidown download <url-or-bv> --collection --output <dir>` | 自动遍历 UGC 合集全部集数；输出 `{season}-ep{N}-{title}.mp4`。 |
| **仅提取音频** | `pilidown download <url-or-bv> --audio-only --output <dir>` | 输出原生最高品质 `.m4a`（无二次转码损耗）。 |
| **MP4 兼容模式** | `pilidown download <url-or-bv> --container mp4 --output <dir>` | 渐进式双轨 MP4 合并（带 5 倍内存预检护栏，防 OOM）。 |
| **保留分离流** | `pilidown download <url-or-bv> --no-merge --output <dir>` | 保留下载完毕的 `.m4v` 视频轨与 `.m4a` 音频轨供下游工具调用。 |
| **导出弹幕** | `pilidown danmaku <url-or-bv> --format ass --output <file>` | 格式可选 `ass`（推荐）、`xml`、`raw`。带 `--json` 时须配 `--output`。 |
| **导出字幕** | `pilidown subtitle <url-or-bv> --format srt --output <file>` | 格式可选 `srt`、`json`、`ass`。 |
| **查画质与编码** | `pilidown stream <url-or-bv> --json` | 动态探测视频真实可用画质与编码；基本信息用 `pilidown info <url-or-bv>`。 |
| **登录与状态探测** | `pilidown status --json`<br>`pilidown login` | `status` 检查登录态；`login` 启动交互式扫码。 |
| **用户收藏/历史** | `pilidown fav <mid> --json`<br>`pilidown history --json`<br>`pilidown space <mid> --pub --json` | 需本地已登录，输出紧凑结构化数据。 |
| **番剧与课程** | `pilidown bangumi <url> --json`<br>`pilidown cheese <url> --json` | 剧集元数据与分集流地址探测。 |

## 错误码分类与容灾接盘 SOP (Error Recovery)

| 错误特征 / 错误码 | 原因与自愈动作 |
|---|---|
| **-352 风控拦截** | 系统自动注入 buvid3 并重试，无需人工干预。 |
| **-101 未登录** | 提示用户执行 `pilidown login` 扫码登录。 |
| **E_DISK 磁盘不足** | 释放磁盘空间或指定其他驱动器路径（`--output`）。 |
| **E_EXPIRED_URL 签名过期** | B 站临时 URL 超时，直接重新运行命令即可自动换取新签名断点续传。 |
| **断点损坏 / 重来** | 默认开启断点续传（`.part` + `.partstate.json`）；若需彻底重来，追加 `--no-resume`。 |

### 合并容灾机制说明 (Muxing Fallback Architecture)
1. **自动双轨容灾**：程序优先尝试系统 `ffmpeg -c copy` 流复制封装；若系统中未安装 FFmpeg，或 FFmpeg 运行时异常报错，系统会自动记录 Warn 并**平滑降级调用内置纯 JS 合并器**，绝不中断下载流程。
2. **极端双崩兜底**：若两级合并均遭遇流彻底损坏（退出码 1 且报错含 `E_MERGE`），原始分离流 `.m4v` 和 `.m4a` 仍会完好保留在目标目录，可提示用户检查磁盘或保留流。
