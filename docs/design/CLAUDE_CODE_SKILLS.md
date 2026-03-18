# Claude Code Skills for ACE-Step DAW

> Recommended skills/plugins for Claude Code to produce better UX.

## Layer 1: Interaction Design Foundations (Must Install)

### bencium-innovative-ux-designer
- **What**: 28,000+ char UX design foundations — direct manipulation, drag-and-drop, feedback patterns, progressive disclosure, accessibility
- **Why for DAW**: Covers drag rules, 100ms feedback requirement, consistent hover/drop states
- **Install**: `/plugin marketplace add bencium/bencium-marketplace` → `/plugin install bencium-innovative-ux-designer@bencium-marketplace`

### interface-design
- **What**: Design decision memory — saves design tokens (spacing, colors, depth) to `.interface-design/system.md` and auto-loads in future sessions
- **Why for DAW**: Prevents Claude from "forgetting" our spacing system, color hierarchy, and interaction patterns between sessions
- **Install**: `/plugin marketplace add Dammyjay93/interface-design` → `/plugin install interface-design`

## Layer 2: Quality Assurance

### frontend-design (Anthropic official)
- **What**: Forces Claude to think about Purpose → Tone → Constraints → Differentiation before writing UI code
- **Why for DAW**: Prevents generic "AI-generated looking" UI
- **Install**: `/plugin marketplace add anthropics/claude-code` → `/plugin install frontend-design`

### web-design-guidelines (Vercel)
- **What**: 100+ rules for accessibility, performance, and UX best practices
- **Install**: Via Vercel marketplace

## Layer 3: Process Support

### designer-skills (63 skills, 27 commands)
- **What**: Full design process coverage — user research, design systems, strategy, UI, interaction design, prototyping, testing
- **Key modules for DAW**: Interaction design (micro-animations, state machines, gestures), prototype & testing, design ops
- **Install**: `/plugin marketplace add Owl-Listener/designer-skills`

## DAW-Specific Notes

No existing skill understands DAW domain knowledge. That's why we have:
- `CLAUDE.md` → "DAW Interaction Design Standards" section (knobs, timeline, transport, etc.)
- `AGENTS.md` → Development workflow rules
- `docs/design/INTERACTION_DESIGN_GUIDE.md` → Comprehensive product design reference

The skills provide GENERAL UX principles. The project files provide DAW-SPECIFIC rules.
