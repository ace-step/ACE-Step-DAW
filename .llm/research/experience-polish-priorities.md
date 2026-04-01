# Experience Polish: Re-Prioritized Issue Series

> Re-evaluated from strategic research issues to **experience-first** priorities.
> Previous #1333-#1342 were strategic/infrastructure — real P0 should be UX fundamentals.

## Priority Philosophy

```
P0: 用户无法完成基本工作流 (blocking workflow)
P1: 用户能完成但体验粗糙 (rough experience)  
P2: 增强竞争力的体验升级 (competitive polish)
P3: 战略性新能力 (strategic new capabilities)
```

---

## P0 — 基础工作流缺失 (Blocking)

### Issue A: fix: 添加 Copy/Paste/Cut 快捷键 (Ctrl+C/V/X)
- **Labels**: `bug`, `priority: P0`
- **Problem**: `src/constants/shortcutDefaults.ts` 中只有 Ctrl+D (duplicate), 完全没有 copy/paste/cut。这是所有应用程序的基础操作。
- **Acceptance Criteria**:
  - [ ] Ctrl+C 复制选中的 clip(s) 到内部剪贴板
  - [ ] Ctrl+V 在播放头位置粘贴
  - [ ] Ctrl+X 剪切 (复制+删除)
  - [ ] 支持音频和 MIDI clip
  - [ ] 粘贴和剪切支持 Undo
- **Effort**: Small (1-2h)
- **Impact**: 10/10 — 每个用户每次使用都会碰到

### Issue B: fix: 扩展 Undo/Redo 覆盖范围
- **Labels**: `bug`, `priority: P0`
- **Problem**: History 系统有 4 个 scope (arrangement/track/pianoRoll/mixer), 但许多操作不触发 history:
  - 添加/删除 track 不可撤销
  - 效果链修改不进 history
  - MIDI 效果修改不进 history
  - 很多 UI mutation 不调用 `beginDrag()/endDrag()`
- **Acceptance Criteria**:
  - [ ] addTrack/removeTrack 可撤销
  - [ ] 效果参数修改可撤销
  - [ ] 效果链增删可撤销
  - [ ] 所有 store mutation 审计 — 确认哪些需要 history
  - [ ] Undo History Panel (Ctrl+Alt+Z) 显示所有操作
- **Effort**: Medium (4-6h)
- **Impact**: 9/10 — 用户丢失工作是最严重的体验问题

### Issue C: fix: 添加 React Error Boundary 防止全局崩溃
- **Labels**: `bug`, `priority: P0`
- **Problem**: AppShell 有 Suspense 但没有 ErrorBoundary。任何组件 crash 都导致整个 DAW 白屏, 用户丢失未保存工作。
- **Acceptance Criteria**:
  - [ ] 全局 ErrorBoundary 包裹 AppShell
  - [ ] 子系统级 ErrorBoundary (Timeline, Mixer, PianoRoll, Generation)
  - [ ] 崩溃时显示友好 UI + "重试"/"恢复" 按钮
  - [ ] 崩溃时自动触发 auto-save
  - [ ] 错误信息记录到 console 供 debug
- **Effort**: Small (1-2h)
- **Impact**: 8/10 — 防止灾难性数据丢失

### Issue D: fix: 首次运行体验修复 (关联 #852)
- **Labels**: `bug`, `priority: P0`
- **Problem**: #852 报告默认 seed project 加载时 3 个 clip 处于 error 状态。第一印象直接决定用户留存。
- **Acceptance Criteria**:
  - [ ] 默认项目加载零错误
  - [ ] 首次打开显示欢迎引导 (5个核心快捷键 + 模板选择)
  - [ ] 空项目有清晰的 empty state ("添加轨道" / "AI 生成" 引导)
  - [ ] 后端离线时 Settings panel 不发无效请求 (#853)
- **Effort**: Medium (3-4h)
- **Impact**: 9/10 — 第一印象

---

## P1 — 体验粗糙 (Rough Experience)

### Issue E: feat: AI 生成错误信息增强 — 分类 + 可操作建议
- **Labels**: `enhancement`, `priority: P1`
- **Problem**: 生成失败时只显示 "Generation failed" + generic toast。用户不知道是网络问题、超时、限流还是模型不可用。
- **Acceptance Criteria**:
  - [ ] 错误分类: 🌐 网络 / ⏱️ 超时 / 🔒 限流 / ❌ 模型错误
  - [ ] 每种错误附带建议操作 ("检查网络" / "稍后重试" / "减少推理步数")
  - [ ] 生成中的 clip block 显示进度状态 (而非只在 panel)
  - [ ] 失败的 clip 显示红色边框 + 重试按钮
- **Effort**: Small-Medium (2-3h)

### Issue F: feat: 拖拽操作的无效目标反馈
- **Labels**: `enhancement`, `priority: P1`
- **Problem**: 拖拽 clip 到不兼容轨道类型时无视觉反馈, 静默失败。
- **Acceptance Criteria**:
  - [ ] 拖拽到无效目标时显示禁止光标 + 红色 ghost
  - [ ] 拖拽时显示 tooltip: "Drag: 移动 | Shift+Drag: 复制 | Ctrl+Drag: Slip"
  - [ ] drop 失败时 clip 平滑动画回原位
- **Effort**: Small (1-2h)

### Issue G: feat: Piano Roll/Sequencer 工具选择可视化
- **Labels**: `enhancement`, `priority: P1`
- **Problem**: Piano Roll 工具 (pencil/eraser/select) 通过快捷键 1-5 切换, 但 UI 上没有任何指示当前工具。用户经常忘记自己在什么模式。
- **Acceptance Criteria**:
  - [ ] Piano Roll 顶部工具栏高亮当前工具
  - [ ] 状态栏显示当前工具名称
  - [ ] 光标随工具变化 (crosshair/pointer/eraser)
- **Effort**: Small (1h)

### Issue H: feat: Auto-save 状态可视化
- **Labels**: `enhancement`, `priority: P1`
- **Problem**: Auto-save 存在且工作, 但用户完全看不到保存状态。只在 beforeunload 时有用。
- **Acceptance Criteria**:
  - [ ] 状态栏显示: "已保存" / "保存中..." / "保存失败 (重试)"
  - [ ] 最后保存时间戳
  - [ ] 保存失败时 toast 通知
- **Effort**: Small (30min-1h)

### Issue I: feat: 生成中 clip 的加载状态可视化  
- **Labels**: `enhancement`, `priority: P1`
- **Problem**: AI 生成时 clip block 没有视觉变化, 进度只在 Generation Panel 小面板里。大项目中用户找不到哪个 clip 在生成。
- **Acceptance Criteria**:
  - [ ] 生成中的 clip 显示动画边框 + 进度百分比
  - [ ] 生成完成时 clip 平滑过渡到波形显示
  - [ ] 队列中的 clip 显示 "排队中" 状态
- **Effort**: Small-Medium (2h)

### Issue J: refactor: 关键组件 React.memo 优化 (原 #1334 降级)
- **Labels**: `enhancement`, `priority: P1`
- **Problem**: TrackLane, ClipBlock, EffectCard, SessionView 等大组件未用 React.memo, 导致缩放/滚动时不必要的重渲染。
- **Acceptance Criteria**:
  - [ ] ClipBlock, TrackLane 包裹 React.memo
  - [ ] EffectCard (1609行) 拆分为更小组件
  - [ ] Timeline 滚动/缩放时 20+ 轨道保持 60fps
  - [ ] 用 React DevTools Profiler 验证减少的渲染次数
- **Effort**: Medium (3-4h)
- **Note**: 这比 Canvas/WebGL 迁移更实际, 且收益更快

---

## P2 — 竞争力体验升级 (Competitive Polish)

### Issue K: feat: WASM DSP 全面启用为默认路径 (原 #1333)
- **Labels**: `enhancement`, `priority: P2`
- 原 P0, 降级为 P2。WASM DSP 已可用作为选项, 非用户可见体验问题。

### Issue L: feat: Timeline/Waveform Canvas 渲染迁移 (原 #1334)  
- **Labels**: `enhancement`, `priority: P2`
- 原 P0, 降级为 P2。先做 React.memo 优化 (Issue J), 性价比更高。

### Issue M: feat: VST3 companion 安装体验优化 (原 #1335)
- **Labels**: `enhancement`, `priority: P2`
- 原 P0, 降级为 P2。只影响需要 VST3 的用户子集。

### Issue N: feat: 首次用户 Onboarding 完整体验
- **Labels**: `enhancement`, `priority: P2`
- 欢迎 overlay, 功能引导, 快捷键提示卡片, Command Palette (Cmd+K) 发现性。

### Issue O: feat: 响应式布局 — 平板/小屏幕支持
- **Labels**: `enhancement`, `priority: P2`
- 当前零响应式断点。至少支持 iPad 横屏 (1024px)。

### Issue P: feat: 无障碍 (Accessibility) 基础改进
- **Labels**: `enhancement`, `priority: P2`
- Canvas 缺少语义结构, modal 缺少 focus trap, 缺少 skip-to-content。

---

## P3 — 战略性新能力 (原 #1336-#1342)

| 原 Issue | 标题 | 新优先级 |
|----------|------|----------|
| #1336 | AI 编曲助手 | P3 |
| #1337 | Agent-native 生态 API 文档 | P3 |
| #1338 | Session View 增强 | P3 (与 #926 #1032 #1033 #1034 重叠) |
| #1339 | 实时协作 CRDT/WebRTC | P3 (与 #974 重叠) |
| #1340 | Tauri 桌面版 | P3 |
| #1341 | WAM 插件格式 | P3 |
| #1342 | AI-native DAW 品类定义 | P3 |

---

## 优先级矩阵总结

```
Impact ↑
  10 │ A(Copy/Paste)  D(首次运行)
     │ B(Undo)        
   8 │ C(ErrorBound)  E(生成错误)  I(生成状态)
     │ F(拖拽反馈)    G(工具可视)  H(存档状态)
   6 │ J(Memo优化)    
     │ K(WASM默认)    L(Canvas)    M(VST3 UX)
   4 │ N(Onboarding)  O(响应式)    P(无障碍)
     │ #1336-#1342 (战略新能力)
   2 │
     └──────────────────────────────────────→ Effort
       30min  1h    2h    4h    1d    1w   2w+
```

**结论**: 先花 2-3 天完成 P0 四个 issues (A-D), 用户体验会有质的飞跃。然后 P1 (E-J) 再花一周。之前的战略 issues 全部降到 P2/P3。
