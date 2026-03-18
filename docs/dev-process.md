# AceStudio Lite — 开发流程规范

## 每日开发流程

### 1. 竞品深度调研（每日必做，开发前执行）

**核心原则**: 不是粗看一遍功能列表，而是深入到每个功能的细微交互设计。

**每日调研任务**:
- 选择当天要开发的功能对应的竞品文档，**逐字逐句**阅读
- 重点关注：交互细节、边界情况、参数范围、视觉反馈、快捷键、错误处理
- 更新 `docs/daw-competitive-analysis.md` 补充新发现的细节
- 在开发任务中引用具体的竞品设计决策

**调研对象（按功能模块轮换深入）**:

| 功能模块 | 必读文档 |
|---------|---------|
| 时间线/编排 | Ableton Arrangement View 完整手册章节 |
| 混音器 | Ableton Mixing 章节（已读但需深入）、FL Studio Mixer 文档 |
| MIDI/钢琴卷帘 | Ableton MIDI Editing、FL Studio Piano Roll、GarageBand Piano Roll |
| 效果器 | Ableton Audio Effects Reference（每个效果器的参数）|
| 乐器 | Ableton Instrument Reference、FL Studio Instruments |
| 录音 | Ableton Recording、GarageBand Recording |
| 自动化 | Ableton Automation and Editing 章节 |
| 浏览器/Loop | Ableton Browser、FL Studio Browser |
| 路由/信号流 | Ableton Routing and I/O（极其重要）|

**调研深度标准**:
- ❌ "Ableton 有 Group Track" — 太浅
- ✅ "Ableton Group Track: 可嵌套、折叠后显示子轨剪辑概览、Session View 中组槽有独立启动/停止按钮、Cmd+Click 多选分组、分组颜色可一键应用到所有子轨、output 默认路由到 Group Track 但可手动改、可做纯文件夹用" — 这才够

### 2. 规划与设计

- 基于调研结果，细化当日开发任务的具体交互设计
- 对比竞品细节，决定哪些照搬、哪些改进、哪些跳过
- 更新 product-roadmap.md 标记进展

### 3. 开发（双模型策略）

**🧠 Claude Opus** — 规划、调研、代码审查、测试分析、GIF 录制、发版
**⚡ Codex (gpt-5.4)** — 实际编码任务（--full-auto 模式，沙箱内执行）

开发流程：
1. Claude Opus: 读竞品文档 → 写详细开发任务（含交互细节）
2. Codex: `codex exec --full-auto "任务描述"` 执行编码
3. Claude Opus: `npm run build` 验证 → 浏览器截图测试 → 发现问题
4. Codex: 修复问题
5. Claude Opus: commit + GIF + 发版

**使用 Codex 的命令模板:**
```bash
cd /path/to/bandlab && codex exec --full-auto "你的编码任务"
```
- `--full-auto`: 沙箱内自动批准文件写入
- `--yolo`: 无沙箱无审批（仅用于紧急修复）
- PTY 必须开启 (`pty: true`)

**什么时候用 Codex vs Subagent:**
- 编码量大的新功能 → Codex（节省 Claude 额度）
- 需要读大量上下文的调研/规划 → Claude Opus subagent
- 小修复/单文件改动 → 直接 edit 工具

### 4. 测试

- 浏览器截图/GIF 验证
- 对照竞品功能检查遗漏
- 修 bug 后重新验证

### 5. 发版

- Git commit
- 录制 GIF demo
- 发送到 Discord

### 6. 系统测试与重构（每 5 个版本必做）

**触发条件**: 每开发 5 个 patch 版本（v0.0.5, v0.0.10, v0.0.15...）后暂停新功能开发。

**全面测试清单**:
- [ ] 冷启动测试：清除缓存，从零打开页面，确认所有组件正常渲染
- [ ] 用户流程模拟：
  - 创建项目 → 添加音轨 → 导入音频 → 播放 → 调整混音 → 导出
  - 创建 MIDI 轨 → 打开 Piano Roll → 绘制音符 → 播放 → 添加效果器
  - 创建鼓机轨 → 编辑步进 → 播放 → 调整 swing
  - 多轨同时播放 → 独奏/静音 → 调整音量/Pan
- [ ] 交互边界测试：
  - 快速连续点击所有按钮
  - 极端缩放（最小/最大）
  - 拖拽到边界外
  - 空状态下的所有操作
  - 大量轨道（10+轨）性能
  - 浏览器窗口大小变化/响应式
- [ ] 视觉审查（截图逐页对比）：
  - 所有组件对齐正确
  - 暗色主题一致性
  - 按钮状态（hover/active/disabled）
  - 文字可读性
  - 间距和留白
- [ ] 音频引擎测试：
  - 播放/暂停/停止无杂音
  - 效果器链不崩溃
  - 多轨同时播放
  - BPM 改变后节拍同步
- [ ] 代码质量：
  - TypeScript 严格模式无报错
  - 未使用的 import/变量
  - 重复代码提取为公共方法
  - 组件是否需要拆分
  - Store 结构是否合理

**重构原则**:
- 不改功能，只改结构
- 提取公共组件和 hooks
- 统一命名规范
- 清理冗余代码
- 性能优化（Canvas 重绘优化、状态更新粒度）

### 7. 日报（每天 7PM PDT 自动）

- 今日完成
- 竞品调研新发现
- 测试发现的问题
- 明日计划
- 阻塞项

---

## 竞品文档索引

### Ableton Live 12 完整手册
- 根目录: https://www.ableton.com/en/manual/
- Mixing: https://www.ableton.com/en/manual/mixing/
- Arrangement View: https://www.ableton.com/en/manual/arrangement-view/
- Session View: https://www.ableton.com/en/manual/session-view/
- MIDI Editing: https://www.ableton.com/en/manual/editing-midi-notes-and-velocities/
- Audio Editing: https://www.ableton.com/en/manual/audio-clips-tempo-and-warping/
- Instruments & Effects: https://www.ableton.com/en/manual/working-with-instruments-and-effects/
- Routing: https://www.ableton.com/en/manual/routing-and-i-o/
- Automation: https://www.ableton.com/en/manual/automation-and-editing-envelopes/
- Recording: https://www.ableton.com/en/manual/recording-new-clips/
- Browser: https://www.ableton.com/en/manual/working-with-the-browser/
- Audio Effects: https://www.ableton.com/en/manual/live-audio-effect-reference/
- MIDI Effects: https://www.ableton.com/en/manual/live-midi-effect-reference/
- Instruments: https://www.ableton.com/en/manual/live-instrument-reference/

### FL Studio
- Features: https://www.image-line.com/fl-studio/features/
- Online Manual: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/

### GarageBand
- User Guide: https://support.apple.com/guide/garageband/welcome/mac

### REAPER
- User Guide: https://www.reaper.fm/userguide.php

---

_这不是一次性文档，是每天都要执行的流程。_
