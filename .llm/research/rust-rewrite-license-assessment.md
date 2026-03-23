# Clean-Room Rust/WASM Reimplementation of TidalCycles/Strudel Pattern Language

## License Assessment

**Date:** 2025-03-23
**Verdict: SAFE (with conditions)**

---

## Executive Summary

A clean-room Rust/WASM reimplementation of the TidalCycles pattern language is **legally safe** provided we follow strict clean-room discipline: write from specifications and academic papers only, never reference GPL/AGPL source code, and use independently developed code. The core concepts (cyclic pattern queries, mini-notation syntax, Euclidean rhythms) are rooted in mathematics, published academic research, and established CS paradigms that predate TidalCycles.

---

## 1. Is the Mini-Notation Copyrightable?

**Likely NO — the notation is a functional grammar, not copyrightable expression.**

The TidalCycles mini-notation (`"[bd sd]*2"`, `"<a b c>"`, `"a(3,8)"`) is a compact syntax for describing rhythmic patterns. Key factors:

- **Mathematical/functional notation**: The syntax encodes mathematical operations (repetition, alternation, Euclidean distribution). Mathematical notation and functional grammars are not copyrightable — only specific creative expression is.
- **Prior art in music notation**: Many music notation systems predate TidalCycles. ABC notation (1991) established text-based music representation. Laurie Spiegel's 1981 paper "Manipulations of Musical Patterns" predates Tidal's concepts. SuperCollider and Common Music included mini-languages for pattern manipulation years before TidalCycles.
- **Merger doctrine**: When there are only a limited number of ways to express a functional concept (e.g., "repeat this pattern N times"), the idea and expression merge, and copyright does not attach.
- **Analogy**: Regular expression syntax (`[a-z]*`, `(a|b)+`) is a functional grammar that no one claims copyright over, despite specific implementations being copyrighted.

**Risk level: LOW.** The syntax itself is not copyrightable. The documentation describing the syntax could be copyrighted, but the functional grammar is not.

---

## 2. Is the Pattern Evaluation Model Patentable?

**NO — it is a standard CS concept with extensive prior art.**

The `queryArc(begin, end) -> Event[]` model (querying a cyclic pattern over a time interval to produce events) is:

- **Based on Functional Reactive Programming (FRP)**: TidalCycles explicitly adapts Conal Elliott's work on Functional Reactive Animation (1997). The core idea — representing time-varying values as functions from time intervals to values — is a well-established CS paradigm.
- **Standard signal processing**: Querying a periodic function over an interval and sampling its values is fundamental to digital signal processing, predating TidalCycles by decades.
- **Published academic research**: McLean's papers describe the model openly. Published algorithms cannot typically be patented after publication (prior art).
- **No patent filings found**: No patents were found for the TidalCycles pattern evaluation model.

**Risk level: NONE.** This is a standard application of FRP to music patterns, with clear prior art in Elliott's 1997 work.

---

## 3. What Constitutes "Clean-Room" Implementation?

**We CAN reference public specifications and academic papers. We CANNOT reference GPL/AGPL source code.**

### Clean-room design requirements (established in case law since 1983):

1. **Two separate teams**: One team writes a functional specification from public documentation; a different team implements from that specification without ever seeing the original source code.
2. **No source code access**: Developers writing code must never have read the Tidal (Haskell/GPL) or Strudel (JavaScript/AGPL) source code.
3. **Specification from public sources only**: The spec team can reference:
   - Strudel's public documentation at strudel.cc/learn/ (public-facing docs)
   - Alex McLean's published academic papers (CC-BY-SA licensed)
   - The TidalCycles user documentation at tidalcycles.org/docs/
   - Published conference presentations and tutorials
4. **Document the process**: Maintain records showing independent development.

### What we CAN do:
- Reference public documentation for *behavioral specification* (what the functions do)
- Reference McLean's academic papers (published under CC-BY-SA 4.0)
- Use the same function names (`fast`, `slow`, `rev`, `stack`, `cat`) — function names are short, descriptive, and functional; they describe what the function does and are not copyrightable creative expression
- Implement the same DSL syntax — grammars/syntaxes are functional and not copyrightable (see Section 1)
- Use Euclidean rhythm algorithms — these are published mathematical algorithms (Bjorklund 2003, Toussaint 2005)

### What we CANNOT do:
- Copy or closely paraphrase Strudel/Tidal source code
- Use Strudel/Tidal source code as a reference during implementation
- Copy internal data structure designs verbatim from the source
- Copy test cases verbatim (tests are copyrightable expression)

---

## 4. Precedents — Other TidalCycles Reimplementations

Multiple reimplementations exist, all under GPL-compatible licenses:

| Project | Language | License | Relationship |
|---------|----------|---------|-------------|
| **TidalCycles** | Haskell | GPL-3.0 | Original |
| **Strudel** | JavaScript | AGPL-3.0 | Port by McLean + Roos, started as experimental port of pattern engine |
| **Vortex** | Python | GPL-3.0 | Experimental port by McLean, Le Beux, Damian, Forment |
| **Modal** | Lua | (unknown) | Port focused on mini-notation and embedded environments |

**Key observation**: All existing ports were created by or with the direct involvement of Alex McLean (TidalCycles creator), and all use GPL-family licenses. There are no known independent clean-room reimplementations under permissive licenses.

The SuperCollider community discussed porting TidalCycles to sclang but no completed project was found.

---

## 5. Community Stance

### Alex McLean's position:
- McLean has **actively encouraged** porting TidalCycles to other languages. He initiated ports to Python (Vortex) and JavaScript (Strudel) himself.
- In community forums, he urges the community to "leave tribalism at the door" and explore different implementations.
- He views the pattern language concepts as belonging to a broader "Uzulang" family of pattern languages.

### The GPL "derivative works" claim:
- The Tidal repository README explicitly states: *"Ports and other projects making use of Tidal source code as a reference for e.g. algorithms and/or types are derivative works and bound by the same license."*
- **This claim has limited legal force.** A README statement cannot expand the scope of copyright law. Whether something is a "derivative work" is determined by law, not by a license notice. If you don't reference the source code, you are not creating a derivative work.

### Community culture:
- The TidalCycles community is open-source oriented and values sharing. The move from GitHub to Codeberg was motivated by ethics, not by restrictive licensing goals.
- No hostile enforcement actions against reimplementations were found.
- The AGPL choice for Strudel was specifically to cover web services (matching Hydra's license), not to prevent reimplementations.

---

## 6. AGPL-3.0 Specifics

### Does AGPL cover the API/interface or only the implementation?
- **AGPL covers the implementation (source code), not the API/interface.**
- The AGPL's copyleft provisions require you to share source code of derivative works, but an independently written implementation that achieves the same functionality is NOT a derivative work.

### Same DSL syntax, different code = derivative work?
- **No.** Under US law (and reinforced by Google v. Oracle), reimplementing the same interface/API with entirely different code is either not infringement or is fair use.

### Google LLC v. Oracle America, Inc. (2021):
- The US Supreme Court ruled 6-2 that Google's reimplementation of Java API declarations was **fair use**.
- The Court emphasized that APIs serve an organizing function and that allowing copyright to block reimplementation would harm innovation.
- The Court **did not definitively rule** that APIs are uncopyrightable — it assumed copyrightability arguendo and found fair use anyway.
- **Relevance to our case**: A DSL syntax (like mini-notation) is analogous to an API — it defines an interface for programmers. Reimplementing it with different code is strongly protected under this precedent.

### AGPL network clause:
- The AGPL's additional requirement (Section 13) only triggers for code that is "based on" the AGPL-licensed program.
- Using a WASM module that implements the same pattern language but shares no code with Strudel does NOT trigger AGPL obligations.
- The AGPL does not propagate across network API boundaries to unrelated code.

---

## 7. Strudel License History

- **Initial license**: GPL (standard GNU General Public License)
- **Changed to AGPL**: April 28, 2022 via PR #101, proposed by Alex McLean (yaxu)
- **Rationale**: Coverage of web services; alignment with Hydra's license
- **No CLA**: No Contributor License Agreement was found. Contributors were simply asked to object if they didn't want their code under AGPL.
- **No dual licensing**: No evidence of a commercial/dual licensing option.
- **Move to Codeberg**: Both Tidal and Strudel moved from GitHub to Codeberg (codeberg.org/uzu/) for ethical reasons, maintaining the same licenses.

---

## Risk Matrix

| Risk Factor | Level | Reasoning |
|-------------|-------|-----------|
| Mini-notation syntax copyright | **LOW** | Functional grammar, merger doctrine, prior art |
| Pattern evaluation model | **NONE** | Standard FRP, published academic work |
| Function name reuse (`fast`, `slow`, etc.) | **LOW** | Descriptive/functional names, not creative expression |
| Euclidean rhythm algorithm | **NONE** | Published algorithm (Bjorklund 2003), freely implemented everywhere |
| AGPL viral clause triggering | **NONE** | Only applies if we use AGPL-licensed code, which we won't |
| "Derivative work" claim from README | **LOW** | Legally non-binding assertion; law determines derivative work status, not README text |
| Community backlash | **LOW-MEDIUM** | Community is open and encouraging of ports, but all existing ports use GPL. A permissive-licensed alternative could generate friction. |
| Patent risk | **NONE** | No patents found; concepts are published prior art |

---

## Conditions for SAFE Status

1. **Strict clean-room discipline**: Developers writing Rust code must NOT have read Tidal (Haskell) or Strudel (JavaScript) source code. If any team member has previously read the source, they must work only on the specification side, not the implementation side.

2. **Specification from public sources only**: Write behavioral specifications from:
   - Strudel public documentation (strudel.cc/learn/)
   - TidalCycles public documentation (tidalcycles.org/docs/)
   - McLean's academic papers (CC-BY-SA 4.0)
   - Conference presentations and tutorials
   - Independent experimentation with the running software (observing outputs)

3. **Document everything**: Keep records of the specification process and the clean-room wall between spec writers and implementers.

4. **Do not copy tests**: Write original test cases from the behavioral specification. Do not copy Strudel's test suite.

5. **Original internal architecture**: The internal data structures, type hierarchies, and code organization must be independently designed. Similar external behavior is fine; similar internal structure raises questions.

6. **Consider community relations**: Even though legally safe, consider:
   - Crediting TidalCycles/Strudel as inspiration
   - Contributing improvements back to the ecosystem
   - Engaging with the community about the project

---

## Recommendation

**SAFE** — A clean-room Rust/WASM reimplementation of the TidalCycles pattern language is legally viable under the conditions listed above. The core concepts are grounded in published academic research and standard CS paradigms. The US Supreme Court's Google v. Oracle ruling strongly supports reimplementing interfaces with independent code. The AGPL license on Strudel only applies if you actually use Strudel's code, which a clean-room implementation by definition does not.

The primary risk is not legal but social — the TidalCycles community may have opinions about a non-GPL reimplementation. This can be mitigated through transparent communication, proper attribution, and good-faith engagement with the community.

---

## Sources

- [TidalCycles Repository (Codeberg)](https://codeberg.org/uzu/tidal) — GPL-3.0, derivative works notice
- [Strudel Repository (Codeberg)](https://codeberg.org/uzu/strudel) — AGPL-3.0
- [Strudel AGPL License Change PR #101](https://github.com/tidalcycles/strudel/pull/101)
- [Vortex Python Port (Codeberg)](https://codeberg.org/uzu/vortex/) — GPL-3.0
- [Google LLC v. Oracle America, Inc. (Supreme Court, 2021)](https://www.supremecourt.gov/opinions/20pdf/18-956_d18f.pdf)
- [EFF: Victory for Fair Use](https://www.eff.org/deeplinks/2021/04/victory-fair-use-supreme-court-reverses-federal-circuit-oracle-v-google)
- [Clean-Room Design (Wikipedia)](https://en.wikipedia.org/wiki/Clean-room_design)
- [McLean, "Algorithmic Pattern" (NIME 2020)](https://www.nime.org/proceedings/2020/nime2020_paper50.pdf)
- [McLean & Wiggins, "Tidal - Pattern Language for the Live Coding of Music" (2010)](https://www.researchgate.net/publication/261134964_Tidal_-_Pattern_Language_for_the_Live_Coding_of_Music)
- [Bjorklund/Toussaint, "The Euclidean Algorithm Generates Traditional Musical Rhythms" (2005)](https://cgm.cs.mcgill.ca/~godfried/publications/banff.pdf)
- [Strudel Technical Manual — Patterns](https://strudel.cc/technical-manual/patterns/)
- [TidalCycles Mini-Notation Reference](https://tidalcycles.org/docs/reference/mini_notation/)
- [Community Discussion: Porting TidalCycles](https://uzu.lurk.org/t/what-would-tidal-look-like-if-it-was-written-in-e-g-python-kotlin-or-javascript/3685)
- [IPWatchdog: Clean Room Development Procedure](https://ipwatchdog.com/2023/04/29/preventing-an-ip-infection-clean-room-development-procedure/)
