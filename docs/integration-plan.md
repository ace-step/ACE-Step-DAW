# AceStudio Lite — 整合计划

> 基于 ACE-Step DAW 的 fork，整合我们自研的增强功能
> 分支: dev/acestudio-lite

## 架构对比

### ACE-Step DAW 已有（直接复用）
- ✅ React 19 + TypeScript + Vite + Tailwind v4 + Zustand
- ✅ 多轨时间线 (Timeline, ClipBlock, TrackLane, TimeRuler)
- ✅ Transport 控制 (TransportBar, useTransport)
- ✅ ACE-Step API 客户端 (aceStepApi.ts) — native + completion 模式
- ✅ LEGO 生成管线 (generationPipeline.ts) — 累积上下文生成
- ✅ 音频引擎 (AudioEngine + TrackNode + 波形减法)
- ✅ 项目持久化 (projectStorage.ts + IndexedDB)
- ✅ WAV 导出 (exportMix.ts)
- ✅ 项目管理 (NewProjectDialog, ProjectListDialog, SettingsDialog)
- ✅ 音频导入 (useAudioImport)
- ✅ 键盘快捷键 (useKeyboardShortcuts)
- ✅ 波形可视化 (useWaveform, waveformPeaks)
- ✅ Mixer 面板 (MixerPanel)
- ✅ 乐器选择器 (InstrumentPicker)
- ✅ Smart Controls 面板
- ✅ Sequencer 编辑器
- ✅ Clip 版本管理
- ✅ 批量生成 / Add Layer / Multi-Track Generate

### 我们自研需要整合进来的增强
- 🆕 Piano Roll (Canvas MIDI 编辑器 — Ableton 级交互)
- 🆕 6 种内置合成器 (Tone.js PolySynth 预设)
- 🆕 MIDI 录制 + Web MIDI API
- 🆕 6 种效果器 + 设备链 UI (EQ/Comp/Reverb/Delay/Distortion/Filter)
- 🆕 鼓机 Step Sequencer + Beat Pads
- 🆕 合成鼓音色 (16 种, Tone.js)
- 🆕 Loop 浏览器 (15 合成 Loop)
- 🆕 音频录音 (麦克风/Count-In/实时波形)
- 🆕 自动化系统 (Breakpoint 包络/Draw Mode)
- 🆕 AI 建议 + AI 歌词生成

## 整合策略

### Phase 1: 基础整合 (v0.0.11)
1. 安装 Tone.js 依赖
2. 把我们的 Piano Roll 组件迁移进来（适配 ACE-Step DAW 的类型系统）
3. 把效果器引擎和 UI 迁移进来
4. 确保 ACE-Step DAW 原有功能不受影响

### Phase 2: 鼓机 + Loop (v0.0.12)
1. 迁移鼓机 (StepSequencer + BeatPad + drumEngine)
2. 迁移 Loop 浏览器
3. 适配到 ACE-Step DAW 的 track/clip 数据模型

### Phase 3: 录音 + 自动化 (v0.0.13)
1. 迁移音频录音引擎
2. 迁移自动化系统
3. 整合到现有的 Timeline 渲染

### Phase 4: 新功能扩展 (v0.0.14+)
- text2sample 模式支持
- Cover 生成 UI
- Repaint/编辑 UI
- AI Chat 助手面板
- LoRA 模型选择器

## 技术注意事项

### 类型系统适配
ACE-Step DAW 用 `Clip` 而我们用 `Region`，需要映射：
- Clip.id ↔ Region.id
- Clip.prompt/lyrics ↔ (ACE-Step 特有)
- Clip.audioKey ↔ Region.audioBuffer
- Track.clips ↔ Track.regions

### 音频引擎
ACE-Step DAW 用原生 Web Audio API (AudioEngine + TrackNode)
我们用 Tone.js
策略：保留 ACE-Step 的引擎用于播放，Tone.js 用于合成器/效果器/鼓机

### 状态管理
两边都用 Zustand + immer，结构相似，可以直接扩展
