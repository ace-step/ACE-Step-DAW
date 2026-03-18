# ACE-Step DAW — 开发流程规范

> 项目: ChuxiJ/ACE-Step-DAW (dev/acestudio-lite 分支)
> 每一步都不能跳过。

## 每版本开发流程（严格执行）

### Step 1: 竞品深度调研 🔍
- 选择当前版本要开发的功能，逐字读对应的竞品文档
- 深度标准：交互细节级别（不是功能列表级别）
- 输出：更新 docs/research-notes/ 并引用具体设计决策
- Skills 辅助：利用已安装的 23 个 skills 中相关的

### Step 2: 敏捷规划 📋
- 基于调研写出具体开发任务（含交互细节）
- 决定：照搬竞品 / 改进 / 跳过
- 更新 roadmap
- Skills: agile-toolkit, task-development-workflow

### Step 3: UI/UX 设计审计 🎨
- 在编码前先设计 UI 方案
- 对照竞品截图确认布局/交互
- 审查配色、间距、视觉层级
- Skills: ui-ux-pro-max, ui-audit, happy-hues, distinctive-design-systems

### Step 4: 编码（三模型协作）💻
- 🧠 **Claude Opus (1M)**: 规划任务、写 prompt、架构决策
- 🔧 **Claude Code CLI**: 精细适配、需要深度上下文的编码
- ⚡ **Codex (gpt-5.4)**: 大量代码生成、机械性任务
- **并行执行**：Claude Code 做功能开发时，Codex 可同时做测试/审查
- Skills: nextjs-expert, react-expert, zustand-patterns, typescript-mastery, clean-code-review, software-architect

### Step 5: 代码审查 🔬
- TypeScript 严格检查 (npx tsc --noEmit)
- Build 验证 (npm run build)
- 扫描 unused imports、console.log、any 类型
- Skills: clean-code-review

### Step 6: 浏览器测试 🖥️
- 启动 dev server → 浏览器打开
- 截图验证 UI 渲染
- 模拟用户操作（点击、拖拽、输入）
- 对照竞品检查遗漏
- 发现的 bug 立即修复

### Step 7: 配色校验 🎨
- 检查暗色主题一致性
- 验证对比度（WCAG 标准）
- 确认颜色使用跟 DAW 行业标准一致
- Skills: happy-hues, accessibility, ui-audit

### Step 8: 发版 📦
- Git commit（描述性 message）
- Git push 到 GitHub
- 录制 GIF demo（浏览器截图序列 → ffmpeg）
- 发送 GIF + 更新到 Discord

### Step 9: 每 5 版全面系统测试 🛡️
触发条件：v0.0.15, v0.0.20, v0.0.25...

**测试清单**:
- 冷启动测试
- 完整用户流程模拟（创建项目→添加轨道→AI生成→编辑→混音→导出）
- 交互边界测试（极端操作、空状态、大量数据）
- 视觉审查（截图逐页对比）
- 音频引擎测试
- 代码质量扫描
- Skills: test-master, e2e-testing-patterns

**重构原则**:
- 不改功能，只改结构
- 提取公共组件/hooks
- 统一命名
- 清理冗余
- 性能优化

---

## 三模型分工

| 模型 | 角色 | 何时用 | 额度 |
|------|------|--------|------|
| 🧠 Claude Opus (1M) | 大脑 | 调研、规划、审查、测试分析、发版 | 公司 API（省） |
| 🔧 Claude Code CLI | 精细执行 | 适配、重构、需上下文的编码 | 个人免费 6 月 |
| ⚡ Codex (gpt-5.4) | 快速执行 | 大量编码、新功能、测试 | 赞助免费 6 月 |

**关键**：空闲 agent 要用起来！Claude Code 编码时 Codex 做测试，反之亦然。

---

## 竞品文档索引

### Ableton Live 12
- Mixing: https://www.ableton.com/en/live-manual/12/mixing/
- Arrangement: https://www.ableton.com/en/live-manual/12/arrangement-view/
- MIDI Editing: https://www.ableton.com/en/live-manual/12/editing-midi/
- Audio Effects: https://www.ableton.com/en/live-manual/12/live-audio-effect-reference/
- Instruments: https://www.ableton.com/en/live-manual/12/live-instrument-reference/
- Routing: https://www.ableton.com/en/live-manual/12/routing-and-i-o/
- Automation: https://www.ableton.com/en/live-manual/12/automation-and-editing-envelopes/
- Recording: https://www.ableton.com/en/live-manual/12/recording-new-clips/
- Browser: https://www.ableton.com/en/live-manual/12/working-with-the-browser/

### 参考项目
- ACE-Step DAW (upstream): https://github.com/ace-step/ACE-Step-DAW
- ACE-Step 1.5 API: https://github.com/ace-step/ACE-Step-1.5

---

_每一步都不能跳过。速度不如质量重要。_
