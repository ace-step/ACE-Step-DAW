# Issue: from-silence lego 请求应发送选区时长与 repainting 0/-1

> **说明**：若无法在仓库创建 GitHub Issue，可将本文复制到 GitHub「New issue」；PR 描述中也会引用相同内容。

## 问题描述

在 **Generate from silence** + **chunk（选区短于整条时间轴）** 场景下，服务端 DiT 的 `text_prompt` 中 Metas 可能出现 `duration: 0 seconds`，生成结果异常（噪声等）。

## 根因（客户端）

- `generateClipInternal` 将 `audio_duration` 设为 `getAudioDuration()`（整条工程时间轴长度），而不是 **当前 clip / Select Window 的长度**。
- From-silence 路径上传的是 `generateSilenceWav` 生成的 **极短占位 WAV**（0.1s），与「要生成的段落长度」无关；服务端若按解码后的波形长度参与 Metas，会与真实选区不一致。

## 期望行为

与 ACE-Step API 约定对齐（from silence）：

| 字段 | 期望值 |
|------|--------|
| `repainting_start` | `0` |
| `repainting_end` | `-1` |
| `audio_duration` | **选区 / clip 时长（秒）**，且 `> 0` |

有 cumulative **上下文** 时：保持原有行为（repaint 区间为时间轴上的 clip 范围，`audio_duration` 为工程时间轴长度）。

## 方案

- 抽取 `computeLegoTimingParams`（`src/services/legoApiTiming.ts`）统一计算上述字段。
- `generationPipeline` 中 lego 任务使用该结果。
- 补充单元测试与 `docs/release_task_lego_mapping.md` 说明 DAW → `/release_task` 映射。

## 验收建议

1. From silence + 拖选一段短于总长的 Select Window，发起多轨/单轨生成，确认请求体中 `audio_duration` 等于选区秒数，`repainting_start` / `repainting_end` 为 `0` / `-1`。
2. From context 路径回归：repaint 区间与 `audio_duration` 与改前一致。

## 类型

`bug` / `generation`
