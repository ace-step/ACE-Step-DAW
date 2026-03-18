# 功能差距分析：AceStudio Lite vs ACE-Step DAW

## AceStudio Lite 的 DAW 优势（需要完整迁入）

| 功能 | Lite 行数 | 当前整合 | 差距 |
|------|----------|---------|------|
| **Piano Roll** | 931 行 | 215 行 | ❌ 缺少：Canvas渲染、Velocity编辑器、Draw Mode、Grid Snap、键盘快捷键、Preview发声 |
| **Effect Chain UI** | 642 行 | 162 行 | ❌ 缺少：每种效果器自定义UI、频谱EQ可视化、压缩增益表、预设系统 |
| **Step Sequencer** | 312 行 | 已有(SequencerEditor) | ⚠️ 需对比功能差异 |
| **Beat Pad** | 111 行 | ❌ 不存在 | ❌ 需迁入 |
| **Loop Browser** | 377 行 | ❌ 不存在 | ❌ 需迁入 |
| **Mixer** | 365 行 | 已有(MixerPanel) | ⚠️ 需对比 VU meter、send effects |
| **Timeline** | 1551 行 | 已有 | ⚠️ 需对比：自动化叠加、录音实时波形 |
| **Recording Engine** | 573 行 | ❌ 不存在 | ❌ 需迁入（麦克风、Count-In、实时波形） |
| **Automation Engine** | 149 行 | ❌ 不存在 | ❌ 需迁入 |
| **Synth Engine** | ~200 行 | 122 行 | ⚠️ 需验证预设完整性 |
| **Drum Engine** | ~400 行 | 127 行 | ❌ 缺少：合成鼓音色、多Kit支持 |
| **Effects Engine** | ~300 行 | 107 行 | ❌ 缺少：LFO、完整参数控制 |

## ACE-Step DAW 的 AI 优势（已有，保留）

| 功能 | 行数 | 状态 |
|------|------|------|
| **LEGO 生成管线** | 700 行 | ✅ 保留 |
| **ACE-Step API 客户端** | 251 行 | ✅ 保留 |
| **上下文音频提取** | 120 行 | ✅ 保留 |
| **波形减法** | 35 行 | ✅ 保留 |
| **项目持久化** | 194 行 | ✅ 保留 |
| **WAV 导出** | 25 行 | ✅ 保留 |
| **批量生成 UI** | 303 行 | ✅ 保留 |
| **Add Layer 模态** | 579 行 | ✅ 保留 |
| **Smart Controls** | 已有 | ✅ 保留 |
| **Sequencer Editor** | 已有 | ✅ 保留 |
| **Assets Panel** | 已有 | ✅ 保留 |

## 整合优先级

### v0.0.12 — 核心 DAW 功能补全
1. 替换 PianoRoll.tsx 为完整 931 行版本（适配类型）
2. 替换 EffectChain.tsx 为完整 642 行版本
3. 迁入完整 SynthEngine / EffectsEngine / DrumEngine
4. 迁入 BeatPad

### v0.0.13 — 录音 + 自动化
1. 迁入 RecordingEngine（573 行）
2. 迁入 AutomationEngine（149 行）
3. 适配到现有 Timeline

### v0.0.14 — Loop + 辅助
1. 迁入 LoopBrowser
2. 对比增强 Mixer（VU meter、send effects）

### v0.0.15+ — 新功能
- text2sample / cover / repaint UI
- AI Chat 助手
- LoRA 选择器
