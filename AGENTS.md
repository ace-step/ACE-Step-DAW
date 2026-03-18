# AGENTS.md — ACE-Step DAW 开发规范

> 所有参与开发的 AI agent 必须遵守此文件。
> 仓库: ace-step/ACE-Step-DAW

---

## Git 工作流（PR 驱动，无例外）

### 分支
- `main` — 稳定版本，**只通过 PR merge**，禁止直接 push
- `feat/v0.0.X-xxx` — 每个功能一个短期分支，从 main 创建，merge 后删除
- `fix/v0.0.X-xxx` — bug 修复分支
- `test/v0.0.X-system-test` — 系统测试 + 重构分支

### 身份
- `user.name`: ChuxiJ
- `user.email`: junmin@acestudio.ai

### Commit 规范
- `feat: add Piano Roll MIDI editor with velocity lane`
- `fix: resolve track deletion memory leak in audio engine`
- `docs: add MIDI editing research from Ableton Live 12`
- `refactor: extract shared Canvas utils into canvasUtils.ts`
- `test: add system test round 3 for v0.0.15`
- `chore: update dependencies`

### 单版本流程
```
git fetch origin && git checkout main && git pull --ff-only origin main
git checkout -b feat/v0.0.X-feature-name
→ 开发 + 测试 + 修复（同一分支内完成）
→ git push origin feat/v0.0.X-feature-name
→ 创建 PR → Codex 审核 PR → merge
→ git checkout main && git pull --ff-only origin main
→ git tag -a v0.0.X -m "release notes" && git push origin main --tags
→ 创建 GitHub Release（含深度测试 GIF）
→ git push origin --delete feat/v0.0.X-feature-name
```

**热修复例外**: `fix/` 分支可跳过 Step 1 竞品调研，但 Step 5-8 不可跳过。

### Release 标准（不达标不发）
- 详细 changelog（每个功能 + 修复 + 改动文件）
- 深度测试 GIF（完整用户流程，不是随便截图）
- 测试覆盖报告（测了什么、发现什么、修了什么）
- 已知问题列表
- 下一步计划

---

## 每版本开发 9 步流程（Step 1-8 每版必做，Step 9 每 5 版触发）

### Step 1: 竞品深度调研 🔍
- 逐字读竞品文档，**交互细节级别**
- 深度标准：参数范围、边界情况、视觉反馈、快捷键、错误处理
- ❌ "Ableton 有 Group Track" — 太浅
- ✅ "Ableton Group Track: 可嵌套、折叠后显示子轨概览..." — 够深
- 输出更新到 `docs/research-notes/`

### Step 2: 敏捷规划 📋
- 基于调研写具体开发任务（含竞品引用）
- 决定：照搬 / 改进 / 跳过
- 创建 feat 分支

### Step 3: UI/UX 设计审计 🎨
- 编码前先设计 UI 方案
- 配色、间距、视觉层级、信息密度
- 对照竞品截图确认

### Step 4: 编码（三模型并行）💻
| 模型 | 角色 | 何时用 |
|------|------|--------|
| 🧠 Claude Opus (1M) | 规划/审查/测试分析 | 需要理解大量上下文 |
| 🔧 Claude Code CLI | 精细编码/适配/重构 | 需要深度上下文的编码 |
| ⚡ Codex (gpt-5.4) | 大量代码/PR 审核/测试 | 快速执行 |

**关键：空闲 agent 并行利用，不浪费。**

### Step 5: 代码审查 🔬
- `npx tsc --noEmit` — 0 errors
- `npm run build` — 通过
- 扫描（merge blocker，必须清零）：unused imports、console.log（error handler 除外）、untyped `any`
- 代码结构审查

### Step 6: 浏览器测试 🖥️
- 启动 dev server → 浏览器打开
- 截图验证 UI 渲染
- **模拟完整用户流程**（不是随便点两下）
- 对照竞品检查遗漏
- 发现 bug **在同一分支修复**

### Step 7: 配色校验 🎨
- 暗色主题一致性
- WCAG 对比度标准
- DAW 行业颜色规范

### Step 8: PR + 审核 + Merge + Tag 📦
1. Push feat 分支到 `ace-step/ACE-Step-DAW`
2. 创建 PR（详细描述改动）
3. 派 Codex 审核 PR（代码质量 + 功能验证）
4. 审核通过 → merge to main
5. 打 tag: `git tag -a v0.0.X -m "详细 release notes"`
6. 创建 GitHub Release（含深度测试 GIF）
7. 发 Discord 通知
8. 删除 feat 分支

### Step 9: 每 5 版全面系统测试 🛡️
- 触发条件: v0.0.15, v0.0.20, v0.0.25...
- 走 `test/` 分支 → PR → merge 流程
- 测试清单:
  - 冷启动
  - 完整用户流程（创建→AI生成→编辑→混音→导出）
  - 交互边界（极端操作、空状态、大量数据）
  - 视觉审查（截图逐页对比）
  - 音频引擎稳定性
  - 代码质量扫描 + 重构

---

## 竞品调研文档索引

### Ableton Live 12
- Mixing: https://www.ableton.com/en/live-manual/12/mixing/
- MIDI: https://www.ableton.com/en/live-manual/12/editing-midi/
- Effects: https://www.ableton.com/en/live-manual/12/live-audio-effect-reference/
- Automation: https://www.ableton.com/en/live-manual/12/automation-and-editing-envelopes/
- Recording: https://www.ableton.com/en/live-manual/12/recording-new-clips/
- Browser: https://www.ableton.com/en/live-manual/12/working-with-the-browser/
- Routing: https://www.ableton.com/en/live-manual/12/routing-and-i-o/

### ACE-Step
- DAW: https://github.com/ace-step/ACE-Step-DAW
- API: https://github.com/ace-step/ACE-Step-1.5
- API Docs: docs/research-notes/ace-step-api-details.md

---

## 红线（绝对不做）

- ❌ 不直接 push main
- ❌ 不发水 release（没深度测试 GIF 不发）
- ❌ 不跳过竞品调研就编码
- ❌ 不跳过浏览器测试就发版
- ❌ 不往个人 fork push（只用 org 仓库）
- ❌ 不用错误的 git identity

---

_这份文件是开发的法律。违反任何一条都要停下来修正。_
