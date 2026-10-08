# What AI coding models (Claude Opus in particular) are measurably good and bad at in UI and front-end work, as of Oct 8 2026

Research notes for Journey's UI overhaul. Scope: 2024 to Oct 2026. Vendor claims (Anthropic, its customers, tool makers) are kept apart from independent measurement (arenas, academic benchmarks, METR, surveys, NN/g). Several primary sites (arena.ai / lmarena.ai, arxiv.org, metr.org, cryptobriefing.com, remio.ai, muz.li) did not resolve from this research environment, so some leaderboard numbers below come from secondary reports and are marked as such.

## 1. Benchmarks and arenas: where Claude ranked in 2024–2026, on what tasks, and what the methods can't tell you

### Takeaway
On the human-preference arenas for web UI (LMArena/Arena's WebDev board, Design Arena), Claude models have held first place for most of Dec 2024 to Sep 2026, and the latest reports put Claude Opus 5.5 first in late Sep 2026. Those sources disagree with each other in places, and the leads are often inside the confidence interval. These boards measure first impressions of single-prompt React/TypeScript/Tailwind apps. They do not measure consistency across a large codebase, accessibility, touch ergonomics or performance on old hardware. Automated benchmarks such as ArtifactsBench and Design2Code show strong but not dominant Claude results, and both find layout and element fidelity to be the weakest area.

### Cited Findings
**WebDev Arena (LMArena, renamed Arena; later called "Code Arena: WebDev"). This is the independent crowd measure.**
- Method: a user writes a prompt, two anonymous models each build a web app, the apps render side by side in sandboxed iframes (E2B), and the user votes A, B, tie or both bad. Rankings come from a Bradley-Terry model, "similar to Elo". Launched Dec 2024 by the Chatbot Arena (LMSYS) team. — [LMArena: WebDev Arena](https://news.lmarena.ai/webdev-arena) (via search excerpt; page not fetchable here); [aiwiki: WebDev Arena](https://aiwiki.ai/wiki/webdev_arena)
- Simon Willison wrote on Dec 16 2024 that the board "turns out to actually be a React, TypeScript and Tailwind benchmark", and that Claude 3.5 Sonnet (October edition) led at 1212.96. — [Simon Willison, Dec 16 2024](https://simonwillison.net/2024/Dec/16/)
- Early 2025: LMArena reported that Claude 3.7 Sonnet held #1 with a 76% average win rate, with Claude 3.5 Sonnet at #2. — [LMArena WebDev Arena post](https://news.lmarena.ai/webdev-arena) (search excerpt)
- Nov 2025: Gemini 3 Pro launched at about 1487 on the board. Claude Opus 4.5 (thinking-32k) then took first, at 1512 on 2025-11-25 per one tracker. — [Datalearner Text Arena (Coding)](https://www.datalearner.com/en/benchmarks/text-arena-coding); [Hugging Face community post](https://huggingface.co/blog/Laser585/claude-4-benchmarks)
- Dec 2025 snapshot: Claude Opus 4.5 Thinking 1519 (#1), GPT-5.2 High 1486, Claude Opus 4.5 1483, Gemini 3 Pro 1482, GPT-5 Medium 1400, Claude Opus 4.1 1395. Jan 2026: Opus 4.5 Thinking still #1 (GPT-5.2 High 1481, Opus 4.5 1479, Gemini 3 Pro 1468). — [Blog du Modérateur, Dec 2025](https://www.blogdumoderateur.com/ia-meilleurs-modeles-code-developpement-web-decembre-2025/); [Blog du Modérateur, Jan 2026](https://www.blogdumoderateur.com/ia-meilleurs-modeles-code-developpement-web-janvier-2026/)
- Mar 2026: Claude Opus 4.6 first at 1560 (secondary report). — [Blog du Modérateur, Mar 2026](https://www.blogdumoderateur.com/ia-meilleurs-modeles-code-developpement-web-mars-2026/)
- Apr 2026: Arena launched an "Image to WebDev" board that ranks models on building websites from screenshots and images, with "#1-3 @Anthropic … Claude 4.6 (Sonnet and Opus)" and Gemini 3.x at #4-6. — [Arena on X](https://x.com/arena/status/2044480481790726161)
- May 2026: an Opus 4.7 thinking variant led at about 1567–1570, and four of the top five were Claude Opus variants. — [aiwiki: WebDev Arena](https://aiwiki.ai/wiki/webdev_arena); [ainexhub WebDev Arena](https://ainexhub.com/benchmarks/webdev-arena/)
- Jul 31 / Aug 12 2026: Claude Opus 5 at the top, about 1704 on 2,081 votes (fewer than several models just behind it). Another tracker recorded Opus 5 (max effort) at 1711.88. — [ainexhub WebDev Arena](https://ainexhub.com/benchmarks/webdev-arena/); [Datalearner](https://www.datalearner.com/en/benchmarks/text-arena-coding)
- Sep 11 2026 snapshot: one outlet reports OpenAI's GPT-6 Astra Max ranked first for web development. — [RuntimeWire](https://runtimewire.com/article/arena-gpt-6-astra-webdev-leaderboard-claude-agents)
- Sep 23 2026 snapshot (secondary): Claude Opus 5.5 Max first at 1,818, GPT-6 Astra Max 1,792, Claude Fable 5.1 Max 1,755. Opus 5.5 was reported first in four WebDev domains (brand and marketing, reference-based design, data and analytics, simulations and gaming). It had far fewer votes than its rivals, and Arena gave it a rank spread of 1–2. — [Remio](https://www.remio.ai/post/claude-opus-5-5-webdev-ranking-puts-anthropic-ahead-of-gpt-6-astra) (via search excerpt); [Crypto Briefing](https://cryptobriefing.com/anthropics-claude-opus-55-leads-code-arena-webdev-ai-rankings-as-of-sept-2026/). This conflicts with a report placing Claude Sonnet 5.5 third at about 1,786: [Crypto Briefing on Sonnet 5.5](https://cryptobriefing.com/claude-sonnet-5-5-code-arena-webdev/).

**Design Arena (designarena.ai). Independent crowd votes, in categories such as website, UI components, data viz, 3D and games.**
- Aug 2025: Claude Opus 4.1 (Thinking) topped the overall board at a 73.7% win rate, while GPT-5 (Minimal) led website design at 73.6%. — [Gigazine](https://www.gigazine.net/gsc_news/en/20250824-ai-design-arena)
- Jun 13 2026 (BenchLM snapshot): Claude Opus 4.6 led "Design Arena Website" at 1340, with Opus 4.7 at 1338. — [BenchLM](https://benchlm.ai/benchmarks/designArenaWebsite)
- Aug 7 2026 (attributed to designarena.ai): highest overall win rates were Opus 4.6 at 63%, Sonnet 4.6 at 59% and Opus 4.8 at 57%. — [aiwiki: DesignArena](https://aiwiki.ai/wiki/designarena)
- Aug 2026 (modelgrep): Claude Opus 5 first on the UI-components board at 1387, then Fable 5 at 1355 and Opus 4.7 at 1337. Overall design: Opus 5 1385, Fable 5 1373. These conflict with another tracker giving Opus 4.7 1364 on UI components. — [modelgrep UI components](https://modelgrep.com/best/ui-components/anthropic); [modelgrep design](https://modelgrep.com/best/design/anthropic); [GTM Directory](https://thegtmdirectory.com/models/anthropic-claude-opus)

**ArtifactsBench (Tencent Hunyuan, July 2025). An automated visual and interactive benchmark.**
- 1,825 tasks across nine domains (web apps, SVG, data viz, games, simulations, management systems and others), graded by a multimodal LLM judge from three-step screenshots, the code and a per-task checklist. It claims "94.4% ranking consistency with WebDev Arena". — [ArtifactsBench GitHub](https://github.com/Tencent-Hunyuan/ArtifactsBenchmark); [arXiv 2507.04952](https://arxiv.org/abs/2507.04952)
- v1.2 (Aug 2025, Gemini-2.5-Pro as judge): GPT-5 72.55, **Claude Opus 4.1 59.76**, Gemini-2.5-Pro 57.74, GPT-OSS-120B 57.69, **Claude Sonnet 4 57.28**. v1.0: Gemini-2.5-Pro-0605 57.01, Claude 4.0 Sonnet 55.76, Claude 3.7 Sonnet 52.19, GPT-4.1 48.23, GPT-4o 37.97. — [ArtifactsBench GitHub](https://github.com/Tencent-Hunyuan/ArtifactsBenchmark)
- The task axes separate Static Visual, Mild-to-Moderate Dynamics, High Dynamics and Intensive Interactive. — [ArtifactsBench GitHub](https://github.com/Tencent-Hunyuan/ArtifactsBenchmark)
- I found no ArtifactsBench score for any Claude model after Opus 4.1. — [Artifacts Bench tracker](https://anotherwrapper.com/tools/llm-pricing/evals/artifacts-bench)

**Design2Code (Si et al., arXiv Mar 2024; NAACL 2025). Academic screenshot-to-code.**
- 484 real web pages given to the model as screenshots. Fine-grained metrics show that models "mostly struggle to recall visual elements from the input and to produce correct layouts". Text and colour improve a lot with fine-tuning. — [arXiv 2403.03163](https://arxiv.org/abs/2403.03163); [NAACL 2025](https://preview.aclanthology.org/setup/2025.naacl-long.199)
- Human judges thought GPT-4V pages (with self-revision) could replace the original in 49% of cases, and preferred them over the original in 64% of cases. The authors attribute this to the model applying modern design conventions. — [arXiv 2403.03163](https://arxiv.org/abs/2403.03163)

**Vendor-run evals.**
- Vercel/Fireworks report an "error-free generation rate" of 93.87 for v0-1.5-md (retrieval plus a base LLM plus a streaming AutoFix model), against 78.43 for claude-4-opus-20250514. These are vendor numbers, and the Claude baseline is from 2025. — [Fireworks AI](https://fireworks.ai/blog/vercel); [Vercel: v0 composite model family](https://vercel.com/blog/v0-composite-model-family)
- v0 Max reportedly moved to Claude Opus 4.8 (secondary). — [AlphaSignal](https://alphasignal.ai/news/vercel-s-v0-max-upgrades-to-claude-opus-4-8-beating-gpt-5-5-on-coding)

### Inferences
- The consistent independent signal is that **Claude is at or near the top for producing a pleasing first draft of a web UI from one prompt**, across roughly seven model generations (3.5 Sonnet to Opus 5.5). Exact ranks swing with every competitor release (Gemini 3 Pro in Nov 2025, GPT-6 Astra in Sep 2026), so "Claude is #1" is a snapshot, not a constant.
- Arena scores are not comparable across months (the pool and scale drift), and a new model with few votes, like Opus 5.5 in late September, carries a wide interval.
- What the arenas reward (visual impact in a fresh single-file React+Tailwind app, judged in seconds by anonymous voters) is close to **landing pages, dashboards, games and data viz built from nothing**. It is far from Journey's overhaul: incremental changes in a 770-file codebase with fixed tokens, 40px targets, iPad portrait and landscape, dark mode and older iPads. Arena results therefore support "Claude can draft attractive screens", not "Claude will keep a large design system consistent".
- Arena's April 2026 Image-to-WebDev board and Design2Code both point the same way: working from a reference image is a strength now, but element recall and exact layout are where models lose points.

### Gaps
- I could not open arena.ai or lmarena.ai directly (DNS failure from this environment). The Sep 2026 Opus 5.5 figures (1,818 etc.) are secondary, and the sources conflict on who is third.
- No SWE-bench Multimodal (visual front-end bug fixing) numbers for Claude 4.x or 5.x were found in this pass.
- No public scores were found for "FrontendBench", "Web-Bench" or Vercel's own v0 evals for current Claude models.
- Design Arena numbers come from aggregators captured on different dates, and they disagree.

## 2. Anthropic's own statements and products about front-end and design (vendor claims), 2025–2026

### Takeaway
Anthropic's own documents are unusually frank about Claude's main design weakness. Left alone, it **converges on a recognisable "AI slop" look**: Inter and Roboto, purple gradients on white, flat backgrounds and predictable layouts in the 4.5/4.6 era. In the 4.8 to 5.5 era it has a **persistent house style** of cream/off-white backgrounds, serif display type, italic accent words and terracotta/amber accents. Anthropic's fixes are concrete, implementable specs, named patterns to avoid, proposing several directions before building, and visual verification. Every launch since Opus 4.5 claims better vision and design; most of those claims are customer quotes rather than measurements.

### Cited Findings
- **"Improving frontend design through Skills"** (claude.com blog, **Nov 12 2025**; Prithvi Rajasekaran, Justin Wei, Alexander Bricken of Applied AI). It defines **distributional convergence**: models "predict tokens based on statistical patterns in training data", safe design dominates web data, so without direction Claude "samples from this high-probability center". The defaults it names are Inter, Roboto, Arial, Open Sans, Lato and system fonts (Space Grotesk recurring even when excluded), "purple gradients on white backgrounds", solid or flat white backgrounds, minimal motion, and "predictable layouts and component patterns". — [Claude blog](https://claude.com/blog/improving-frontend-design-through-skills)
- The same post's fixes:
  - Distinctive typography, with weight contrasts like 100/200 against 800/900 and size jumps of 3x or more ("Pick one distinctive font, use it decisively").
  - A committed theme with CSS variables, where "Dominant colors with sharp accents outperform timid, evenly-distributed palettes".
  - CSS-only motion focused on "one well-orchestrated page load with staggered reveals".
  - Layered backgrounds.
  - A lean context of about 400 tokens, written "at the right altitude" (no hardcoded hex, but not vague either), with explicit anti-default lines.
  - "The more you can map aesthetic improvements to implementable frontend code, the better Claude can execute."
  - It also introduced a `web-artifacts-builder` skill (React, Tailwind, shadcn/ui, bundled with Parcel).
  - Results are shown only as before/after images, with no quantitative measure.
  — [Claude blog](https://claude.com/blog/improving-frontend-design-through-skills)
- The `frontend-design` skill was the first official Claude Code skill, with 277,000+ installs about four months after launch (secondary). Practitioners report that output "still converges to the statistical center" without an explicit design brief. — [paddo.dev](https://paddo.dev/blog/claude-code-plugins-frontend-design/); [wmedia.es](https://wmedia.es/en/tips/claude-code-frontend-design-skill)
- **Anthropic prompting docs (current).** "Claude Opus 4.5 and Claude Opus 4.6 build complex, real-world web applications with strong frontend design. However, without guidance, models can default to generic patterns that create what users call the 'AI slop' aesthetic." The docs ship a `<frontend_aesthetics>` system-prompt snippet: avoid Inter and Arial, use CSS variables, CSS-only motion, "Vary between light and dark themes". They also say "Animations and interactive elements should be requested explicitly when desired", and that Opus 4.5/4.6 "can more reliably interpret screenshots and UI elements". — [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- The same docs say: "Tools that let Claude verify UI work are helpful, such as the computer use tool, the browser use tool, or a browser automation MCP server." — [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- **Opus 4.8 house style (Anthropic docs).** The model "has strong design instincts, with a consistent default house style: warm cream/off-white backgrounds (~`#F4F1EA`), serif display type (Georgia, Fraunces, Playfair), italic word-accents, and a terracotta/amber accent… will feel off for dashboards, dev tools, fintech, healthcare, or enterprise apps." Also: "Generic instructions ('don't use cream,' 'make it clean and minimal') tend to shift the model to a different fixed palette rather than producing variety." The two approaches that "work reliably" are (1) specify a concrete alternative (the docs' example gives exact hexes, radius, spacing, type and hover timing), and (2) "propose 4 distinct visual directions… (bg hex / accent hex / typeface — one-line rationale). Ask the user to pick one, then implement only that direction". The docs add that this "produces meaningfully different directions across runs". — [Prompting Claude Opus 4.8](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8)
- **Opus 5.5 docs.** "Asked for frontend work without design direction, Claude Opus 5.5 falls back on a few default styles, and a general instruction such as 'avoid a generic AI look' mostly swaps one default for another. It responds well to instructions that name specific patterns to avoid", for example "Do not use a cream or off-white background, italic accent words in headlines, numbered '01/02/03' section labels, monospace labels, or pill-shaped buttons". They advise working iteratively: "check which styles the first result used instead, and extend the list". — [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)
- **Launch-post claims by model:**
  - **Opus 4.5** (Nov 24 2025): "better vision". One customer CTO (Madhav Jha) cites "Polished design, tasteful UX" and 3D visualisations. — [Anthropic](https://www.anthropic.com/news/claude-opus-4-5)
  - **Opus 4.6** (Feb 5 2026), all customer quotes:
    - Figma's Chief Design Officer: "generates complex, interactive apps and prototypes in Figma Make with an impressive creative range", translating designs to code "on the first try".
    - Lovable: "an uplift in design quality. It works beautifully with our design systems".
    - Bolt: "a meaningful improvement for design systems and large codebases".
    — [Anthropic](https://www.anthropic.com/news/claude-opus-4-6)
  - **Opus 4.7** (Apr 16 2026):
    - "substantially better vision", accepting images "up to 2,576 pixels on the long edge (~3.75 megapixels)", over three times prior models.
    - Anthropic says it is "more tasteful and creative… producing higher-quality interfaces, slides, and docs".
    - XBOW reports a visual-acuity benchmark of "98.5%… versus 54.5% for Opus 4.6".
    - One customer CEO calls it "the best model in the world for building dashboards and data-rich interfaces".
    — [Anthropic](https://www.anthropic.com/news/claude-opus-4-7)
- **Claude Design** (Anthropic Labs, **Apr 17 2026**, research preview for Pro/Max/Team/Enterprise). It is powered by Opus 4.7, "our most capable vision model". In onboarding, Claude "builds a design system for your team by reading your codebase and design files". Users refine through inline comments, direct edits and adjustment sliders for spacing, colour and layout "made by Claude". Exports go to Canva, PDF, PPTX or standalone HTML, plus a handoff bundle for Claude Code. Customer quote (Brilliant): pages that "took 20+ prompts to recreate in other tools" needed "2 prompts". — [Anthropic](https://www.anthropic.com/news/claude-design-anthropic-labs). The docs now point design work outside the API to it: [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- **Imagine with Claude**: a research preview that generated a software UI on the fly, launched alongside Claude Sonnet 4.5 (Sep 2025). It was available to Max subscribers for about five days (secondary sources only). — [JuheAPI](https://www.juheapi.com/blog/anthropic-imagine-with-claude-sonnet-45-research-preview); [Medium](https://medium.com/@meshuggah22/building-apps-in-real-time-my-experience-with-claude-imagine-f4296cb2c812)
- **Figma Dev Mode MCP server**: public beta in June 2025 with Claude Code support. Tools include `get_code`, `get_variable_defs` (tokens: colour, spacing, type), `get_code_connect_map` and `get_image`. Secondary guides disagree on whether it is still in beta and whether write-back exists. — [Seamgen guide](https://www.seamgen.com/blog/figma-mcp-complete-guide-to-design-to-code-automation); [NYU Shanghai RITS](https://rits.shanghai.nyu.edu/ai/introducing-figmas-dev-mode-mcp-server-revolutionizing-design-to-code-workflows/); [skills-hub 2026](https://skills-hub.ai/blog/figma-dev-mode-mcp-server-2026)

### Inferences
- The default styles changed between generations (purple and Inter, then cream, serif and terracotta), but **the failure mode stayed the same: an unguided model has a house style.** Anthropic's own docs say vague negatives ("make it clean", "avoid AI look") only swap one default for another. For Journey this means an overhaul brief should be written as concrete token values and named anti-patterns, not adjectives.
- Opus 4.8's documented default (warm cream around #F4F1EA, serif display, italic accents, terracotta) is close to what Journey's Navy Frame deliberately is not. Journey's off-white is the cool `#F3F6F9` on grey-blue `#DEE6EE`, its display face is Saira Condensed, and orange means only "now and go". Any session that redesigns a screen without loading the tokens will drift toward that house style. Journey's guard tests (no raw hex, `loud-orange.test.ts`, `fonts.test.ts`, `type-voice.test.ts`) are exactly the kind of check that catches that drift deterministically.
- "Propose 4 directions, user picks one, build only that" is now Anthropic's documented method for design variety. It suits a founder who judges by eye but doesn't write code.
- Claude Design's "read the codebase to build a design system" path could be a fast way to get a visual canvas of Journey's existing tokens. It is a research preview, and I found no evidence that it respects guard tests or iPad constraints.

### Gaps
- No quantitative before/after measurement of the frontend-design skill was found. Anthropic shows images only.
- The Opus 4.8 release date was not verified in this pass. It is referenced in Opus 5's launch post and in the docs.
- I did not find Anthropic's own primary announcement for "Imagine with Claude".
- Figma MCP's current GA and write-back status is unverified (sources conflict).

## 3. Claude Opus 5 and Opus 5.5: what they are and what Anthropic said about front-end, visual and design ability

### Takeaway
Both are real, with primary sources. **Claude Opus 5** launched **Jul 24 2026** and **Claude Opus 5.5** on **Sep 22 2026** (model id `claude-opus-5-5`, the model running this research). Anthropic's front-end claims for them are mostly about **self-verification in a browser, visual polish and much better reading of screenshots and charts**, not a design benchmark. No WebDev or design benchmark is reported in either launch post.

### Cited Findings
- **Claude Opus 5 (Jul 24 2026)**:
  - Anthropic says it is "capable of producing much stronger visual outputs", with interactive examples (a wind-tunnel airflow visualisation, a cell illustration).
  - A customer CTO (Madhav Jha): "the front end shows it first: the best animations, games, and 3D work we have seen from an Opus model."
  - Another (AJ Orbach): "Claude Opus 5 checks its own work the way a real frontend developer would". It reportedly opened pages at desktop and phone widths, caught a product hidden below the mobile fold and an off-screen checkout button, and fixed both.
  - Lovable reported +22% over Opus 4.7 on its hardest agentic coding tasks.
  - No WebDev or design benchmark appears in the post.
  — [Anthropic: Introducing Claude Opus 5](https://www.anthropic.com/news/claude-opus-5)
- **Claude Opus 5.5 (Sep 22 2026)**:
  - On cutting load times across a web app, it "succeeded 39 of 40 times", where Opus 5 made smaller changes that also altered app behaviour.
  - In one tester's game-from-one-prompt comparison it "scored higher than any other model on the strength of its graphics and polish".
  - Chartography (chart reading, with tools): 89.0%, against Fable 5.1 at 88.4% and Opus 5 at 83.4%.
  - Ramp: "A design spec came out usable with very minimal edits".
  - No WebDev or design benchmark appears in the post.
  — [Anthropic: Claude Opus 5.5](https://www.anthropic.com/news/claude-opus-5-5)
- Opus 5.5 docs on screenshots: "even at its lowest effort setting it read values off dense charts more accurately than Claude Opus 5 did at its highest". It is better "where meaning depends on position rather than text", for example which boxes an arrow connects or what changed between two versions of a diagram. It is "more reliable at computer use, where it operates applications from screenshots over many steps". For the densest inputs, "Higher-resolution images help" and crop/zoom tools (PIL, OpenCV, or a crop tool) add accuracy. — [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)
- Pricing and family, as reported: $4/$20 per million tokens, against Opus 5's $5/$25. Anthropic says it is "40% less to run than Opus 5" at default settings, and that Sonnet 5.5 and Haiku 5.5 will follow "in the coming weeks". — [9to5Mac](https://9to5mac.com/2026/09/22/anthropic-upgrades-claude-with-new-opus-5-5-model-details-here/); [TestingCatalog](https://www.testingcatalog.com/anthropic-launches-claude-opus-5-5-with-lower-api-costs/). One page claims no announcement exists, but that page is internally inconsistent: [emergent.sh](https://emergent.sh/news/opus-5-5-release-date)
- The docs list the current Claude models as Fable 5.1, Mythos 5.1, Fable 5, Mythos 5, Opus 5.5, Opus 5, Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 5.5, Sonnet 5, Sonnet 4.6, Haiku 5.5 and Haiku 4.5. On Opus 5.5, thinking is always on (adaptive). — [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- In the arenas, Opus 5 led WebDev in Jul–Aug 2026 and Opus 5.5 was reported #1 on Sep 23 2026 (secondary, see §1).

### Inferences
- The most useful 2026 change for Journey is not taste. It is that **the model can now look at a rendered screen and act on what it sees** (Opus 4.7's larger image cap, Opus 5's browser self-checks at two widths, Opus 5.5's position-sensitive screenshot reading). That makes a screenshot review loop much more viable than it was in 2025.
- The "below the mobile fold" anecdote is a vendor-selected example, not a measurement. Treat it as proof the behaviour exists, not as a reliability rate.

### Gaps
- No independent (non-Anthropic) measurement of Opus 5.5's design quality was found beyond the secondary Arena reports.
- A Muzli article reports building "Muzli Picks-level" sites with Opus 5.5 ([Muzli](https://muz.li/blog/claude-opus-5-5-for-designers/)) but could not be fetched to verify.

## 4. Which UI categories have evidence of strong AI performance

### Takeaway
The best evidence of strength is for **from-scratch visual artifacts** (landing and marketing pages, dashboards and data-rich interfaces, data viz, interactive simulations, games, 3D), **design-to-code from a reference image or Figma**, **design-system-aware prototyping**, and **large mechanical changes made under a check** (fan-out migrations, guard tests). Evidence is thin or absent for most fine-grained categories (Tailwind layout, Radix and shadcn components, Playwright visual tests, ARIA), beyond practitioner anecdotes and Anthropic's own workflow docs.

### Cited Findings
- **Opus 5.5's reported Arena domain wins:** brand and marketing, reference-based design, data and analytics, simulations and gaming (secondary). — [Remio](https://www.remio.ai/post/claude-opus-5-5-webdev-ranking-puts-anthropic-ahead-of-gpt-6-astra) (via search excerpt)
- **Dashboards and data-rich interfaces:** a customer called Opus 4.7 "the best model in the world for building dashboards and data-rich interfaces" (vendor-selected quote). — [Anthropic: Opus 4.7](https://www.anthropic.com/news/claude-opus-4-7)
- **Data visualisation, 3D and games:** Design Arena category leaders in mid-2026 were Claude models (Fable 5; Opus 4.6 Thinking in the top five), per aggregators. — [aiwiki: DesignArena](https://aiwiki.ai/wiki/designarena). ArtifactsBench includes SVG, data viz and game domains, and Claude Opus 4.1 was #2 overall in Aug 2025. — [ArtifactsBench GitHub](https://github.com/Tencent-Hunyuan/ArtifactsBenchmark)
- **Screenshot to code:** Claude 4.6 models were #1–3 on Arena's Image-to-WebDev board at its Apr 2026 launch. — [Arena on X](https://x.com/arena/status/2044480481790726161). Figma reported Opus 4.6 turning designs into code "on the first try" (vendor quote). — [Anthropic: Opus 4.6](https://www.anthropic.com/news/claude-opus-4-6)
- **Working inside an existing design system:** Lovable said Opus 4.6 "works beautifully with our design systems", and Bolt reported "a meaningful improvement for design systems and large codebases" (vendor quotes). — [Anthropic: Opus 4.6](https://www.anthropic.com/news/claude-opus-4-6)
- **Theming with tokens:** Anthropic's own guidance tells the model to "Use CSS variables for consistency" and commit to a theme. — [Claude blog](https://claude.com/blog/improving-frontend-design-through-skills)
- **Motion:** Anthropic recommends CSS-only motion and a single orchestrated staggered page-load reveal. A customer called Opus 5's animations, games and 3D "the best… from an Opus model". The docs also say animations should be "requested explicitly when desired". — [Claude blog](https://claude.com/blog/improving-frontend-design-through-skills); [Anthropic: Opus 5](https://www.anthropic.com/news/claude-opus-5); [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- **Performance work in a web app:** Opus 5.5 cut load times across every page in 39 of 40 attempts (Anthropic's internal test). — [Anthropic: Opus 5.5](https://www.anthropic.com/news/claude-opus-5-5)
- **Mechanical, codebase-wide changes:** Claude Code's docs give `/batch`, which splits a change across 5 to 30 subagents, each in its own worktree, and a `claude -p` loop for migrating thousands of files ("Test on a few files, then run on all of them"). — [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- **Guard tests and deterministic checks:** "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens", and "Give Claude a check it can run: tests, a build, a screenshot to compare." — [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- **Playwright and screenshot verification:** practitioner guides describe Playwright MCP (navigation, interaction, screenshots, plus an accessibility-tree snapshot) and screenshot capture in system tests that let Claude Code flag overlapping elements before human review. These are anecdotal, not measured. — [qaskills.sh](https://qaskills.sh/blog/claude-code-screenshot-frontend-verification-mcp); [Medium: round-trip screenshot testing](https://medium.com/@rotbart/giving-claude-code-eyes-round-trip-screenshot-testing-ce52f7dcc563)
- **Accessibility fixes when asked:** a GPT-4o case study found the model "can effectively address accessibility issues when prompted", but its default code "often lacks compliance". — [arXiv 2501.03572](https://arxiv.org/html/2501.03572v1)

### Inferences
- For Journey, the strongest fits are:
  1. **Drafting alternative looks for one screen at a time** (the Hub card, Operations' Today, the Wrap-up), as several concrete directions.
  2. **SVG charts** (the Staircase, trends), where Claude is strong and Journey already renders plain SVG.
  3. **Token-level theme work** (light and dark ramps, palette copies), because Journey's colours are already variables and tests.
  4. **Mechanical sweeps** (renaming a token, moving every Save to `bg-primary`) under the existing guard tests.
  5. **Writing new guard tests** for any rule the overhaul adds.
- Journey's design system is already shaped like the inputs these models handle best: tokens in CSS variables, rules as tests, and a long written "Decisions already made".

### Gaps
- No independent benchmark isolates Tailwind layout, shadcn/ui or Radix components, form UX, ARIA quality, or Playwright visual-regression test writing for Claude.
- No measured data was found on mechanical colour refactors specifically. The fan-out evidence is Anthropic's workflow documentation, not an outcome study.

## 5. Known weaknesses, and whether screenshots and visual loops close the gap

### Takeaway
The documented weaknesses are:
- **convergent, default aesthetics** (Anthropic's own docs);
- **layout and element fidelity** (Design2Code);
- **accessibility by default**, especially semantic accessibility that automated checkers can't see (several 2024–2026 studies);
- **"almost right" output** that costs time to debug (Stack Overflow 2025);
- **inability to weigh design tradeoffs without heavy human guidance** (NN/g);
- the **last 30%** of edge cases, accessibility and robustness (Osmani).

Visual feedback loops measurably help: in research (ReLook), by Anthropic's recommendation, and in 2026 vendor anecdotes. But a later revision can be worse than an earlier one, so each step needs a pass/fail check.

### Cited Findings
- **Convergence and default style:**
  - "Without direction, Claude samples from this high-probability center." — [Claude blog](https://claude.com/blog/improving-frontend-design-through-skills)
  - On Opus 4.8, the house style "is persistent". — [Prompting Claude Opus 4.8](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8)
  - Opus 5.5 "falls back on a few default styles". — [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)
- **Layout precision:** screenshot-to-code models "mostly struggle to recall visual elements from the input and to produce correct layouts". — [Design2Code, arXiv 2403.03163](https://arxiv.org/abs/2403.03163)
- **Code-only reasoning about visuals:** a practitioner guide notes the agent "relying entirely on structural reasoning to predict visual outcomes" works for simple edits but breaks down for layout, spacing and responsive behaviour. — [qaskills.sh](https://qaskills.sh/blog/claude-code-screenshot-frontend-verification-mcp)
- **Accessibility:**
  - Prior work found 84% of ChatGPT-generated websites had violations (text resizing, contrast, semantic relationships), per Gurita & Vatavu's W4A 2025 study of GPT-4-turbo and Claude 3.5 Haiku with and without WCAG prompts. — [TestParty summary](https://testparty.ai/blog/emerging-accessibility-research-llms-accessible-ui-code-generation)
  - Calò, Gurita & De Russis (CHI EA '26) counted 541 *semantic* violations across 300 UIs from three commercial models, of a kind automated checkers "cannot assess". An LLM-as-judge reached 80–92% recall on them. — [Politecnico di Torino record](https://iris.polito.it/handle/11583/3008330); [a11y summary](https://a11y-paradise.onrender.com/reviews/69ae41f68b9c91225e628c18)
  - "Human or LLM?" (Mar 2025) tests zero-shot, few-shot and self-criticism prompting against WCAG 2.1. — [arXiv 2503.15885](https://arxiv.org/html/2503.15885v1)
- **"Almost right":**
  - 66% of developers cite "AI solutions that are almost right, but not quite", and 45.2% say debugging AI code is more time-consuming.
  - Distrust of AI accuracy rose from 31% (2024) to 46% (2025), and only about 3% "highly trust" it.
  — [Stack Overflow 2025 survey: AI](https://survey.stackoverflow.co/2025/ai); [Stack Overflow press release](https://stackoverflow.co/company/press/archive/stack-overflow-2025-developer-survey/)
- **Design judgement (NN/g):** NN/g tested AI tools (v0, Bolt, Lovable, Figma Make, Claude and others, excluding Claude Code) on a real redesign. They "lack the sophistication to weigh design tradeoffs and produce thoughtful, high-quality designs without extensive guidance from humans". Longer prompts with clear requirements "consistently yield better results". Supplying sketches, mockups and Figma frames gave the closest-to-human results, but by then "you've already completed much of the design work yourself" (the last quote via a third-party summary). — [NN/g: testing methodology](https://www.nngroup.com/articles/testing-ai-methodology); [NN/g: AI prototyping](https://nngroup.com/articles/ai-prototyping/)
- **The last 30%:** AI first drafts look done, but leave edge cases, "accessibility requirements the generated component ignores" and security issues, and the final stretch "requires engineering judgment". — [Addy Osmani: The 70% Problem](https://addyosmani.com/agentic-engineering/the-70-percent-problem/); [Zed session](https://zed.dev/blog/ai-70-problem-addy-osmani)
- **Anecdote:** a non-coding designer built an invoice dashboard in Claude Code in 80 hours, 16 of them spent on a code audit that found errors an experienced developer would not have made. — [HackerNoon](https://hackernoon.com/im-a-designer-i-built-an-ai-prototype-in-80-hours-why-devs-rewrote-the-frontend-from-scratch)
- **Do visual loops close the gap?**
  - ReLook (Tencent, arXiv Oct 2025; ACL 2026) trains a generate, diagnose, refine loop with a multimodal critic grading rendered screenshots. It "consistently outperforms strong baselines" on three vision-grounded front-end benchmarks. It also documents "behavioral collapse": "Despite high-quality feedback, a subsequent revision can be worse". The fix is to accept only strictly improving steps. — [arXiv 2510.11498](https://arxiv.org/abs/2510.11498); [Hugging Face papers](https://huggingface.co/papers/2510.11498)
  - Design2Code's best human-judged results used GPT-4V *with self-revision*. — [arXiv 2403.03163](https://arxiv.org/abs/2403.03163)
  - Anthropic recommends "[paste screenshot] implement this design. take a screenshot of the result and compare it to the original. list differences and fix them". — [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
  - Opus 5 caught mobile-fold and off-screen bugs by viewing pages at two widths (vendor anecdote). — [Anthropic: Opus 5](https://www.anthropic.com/news/claude-opus-5)
  - Opus 5.5 reads position-dependent screenshot detail better, and crop/zoom tools add accuracy on dense inputs. — [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)

### Inferences
- Journey's guard tests already cover several known weak spots in a way a model can't argue with: contrast ratios, raw hex, orange with white words, 40px targets, truncated names, black shadows, the slanted-capitals budget. What they can't catch is **how a screen looks as a whole**: rhythm, hierarchy, crowding, a chip that wraps oddly in portrait, motion that feels wrong, a dark fill that reads muddy. Those need a screenshot loop *and* a human eye, ideally on the actual iPad.
- **Performance blind spots on old iPads** (heavy `backdrop-filter`, stacked shadows, large blurs): I found no study. This is an inference from the general "structural reasoning only" limitation plus the fact that arenas judge on fast desktop browsers. Journey's perf lab (`harness/perf-lab/`) is the right check, because neither the model nor a desktop screenshot sees frame drops.
- **Semantic accessibility** (a meaningful label, the right reading order on VoiceOver) passes automated checks and is a documented model weakness. Journey's guards don't cover it, so it needs an LLM-as-judge pass or a human VoiceOver walk.
- ReLook's "a later revision can be worse" maps directly onto Claude Code practice: keep every screenshot iteration behind a check and a checkpoint, and roll back rather than stack fixes.

### Gaps
- No evidence was found on hallucinated CSS properties or wrong browser-support claims (for example Safari/WebKit specifics) for current Claude models.
- No study measures dark-mode contrast mistakes or motion quality specifically.
- No independent study measures how much screenshot loops improve Claude's UI output, as opposed to research models (ReLook) or vendor anecdotes.

## 6. Workflows that get the best results, and what the productivity evidence (METR, Stack Overflow) says

### Takeaway
The workflows with primary-source backing are:
- **a design system as the single source of truth**, written as concrete values and named anti-patterns rather than adjectives;
- **lean, on-demand instructions** (skills) rather than an ever-longer always-loaded file;
- **"propose N directions, pick one, build only that"**;
- **a runnable check for every change** (tests, deterministic hooks, screenshots compared to a target) plus **a fresh-context reviewer**;
- **fan-out migrations tested on a few files first**.

Productivity data does not support a blanket speed-up claim. METR's 2025 RCT found experienced developers 19% *slower* in their own large mature repositories, while believing they were about 20% faster. METR itself says that setting differs from greenfield work, and in 2026 it called the result historical.

### Cited Findings
- **Verification first:** "Give Claude a check it can run: tests, a build, a screenshot to compare… Without a check… 'looks done' is the only signal available, and you become the verification loop." It recommends "Verify UI changes visually" and "Have Claude show evidence rather than asserting success". Gates can be a Stop hook ("a deterministic gate"), a `/goal` condition, or a verification subagent: "a fresh model try to refute the result". "If you can't verify it, don't ship it." — [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- **Instruction files:** "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!" Keep only lines whose removal would cause mistakes, and use skills for knowledge that applies only sometimes. — [Claude Code best practices](https://code.claude.com/docs/en/best-practices). Anthropic's frontend post makes the same point: "too many tokens in the context window can result in degradation of performance", so package design guidance as a skill loaded on demand. — [Claude blog](https://claude.com/blog/improving-frontend-design-through-skills)
- **Concrete specs beat adjectives:** "The model follows explicit specs precisely". Generic negatives shift the model "to a different fixed palette". — [Prompting Claude Opus 4.8](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8). Name the specific patterns to avoid and extend the list after each result. — [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)
- **Variants:** "propose 4 distinct visual directions… Ask the user to pick one, then implement only that direction", which "produces meaningfully different directions across runs". — [Prompting Claude Opus 4.8](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8)
- **Reference material:** NN/g found that briefs with sketches, mockups or Figma frames came closest to human designs, and that longer, specific prompts were consistently better. — [NN/g](https://www.nngroup.com/articles/testing-ai-methodology). The Figma MCP passes tokens by name (`get_variable_defs`) so "a hex code loses its semantic token name" doesn't happen. — [Seamgen guide](https://www.seamgen.com/blog/figma-mcp-complete-guide-to-design-to-code-automation)
- **Plan, then build:** Claude Code's docs recommend explore, then plan (plan mode), then implement. They suggest having Claude interview you for larger features and write a spec, then executing it in a fresh session. — [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- **Writer/reviewer and fresh context:** "A fresh context improves code review since Claude won't be biased toward code it just wrote." After two failed corrections, `/clear` and re-prompt. — [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- **Fan-out migrations:** `/batch` (5–30 subagents in worktrees). "Refine your prompt based on what goes wrong with the first 2-3 files, then run on the full set." — [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- **Accessibility prompting:** explicit WCAG requirements in the prompt plus self-review improve output. Complex interactive components still need human review. — [TestParty summary](https://testparty.ai/blog/emerging-accessibility-research-llms-accessible-ui-code-generation); [arXiv 2501.03572](https://arxiv.org/html/2501.03572v1)
- **METR RCT (Jul 10 2025):**
  - Design: 16 experienced open-source developers, 246 tasks in mature repos they knew (about 5 years' experience on each), mainly Cursor Pro with Claude 3.5/3.7 Sonnet.
  - Result: AI allowed meant **19% longer** completion time (CI roughly +2% to +39%). Developers forecast a 24% speed-up and afterwards believed they had been 20% faster.
  - METR cautions that familiarity with the repo and its size and maturity drove the slowdown, and that results "are consistent with small greenfield projects or development in unfamiliar codebases seeing substantial speedup".
  — [METR blog](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/); [arXiv 2507.09089](https://arxiv.org/abs/2507.09089)
- **METR 2026 follow-up:** returning developers showed −18% (CI −38% to +9%) and new recruits −4% (CI −15% to +9%). The design broke down because developers refused to work without AI (30–50% declined to submit some tasks). METR now says it can't measure this reliably with that design and calls the 2025 result historical. — [Rob Bowley: METR 2026 update](https://blog.robbowley.net/2026/04/04/metrs-developer-productivity-research-2026-update/)
- **Stack Overflow 2025:** 46% distrust AI accuracy against 33% who trust it. 66% cite "almost right, but not quite". I found no front-end-specific breakdown. — [Stack Overflow 2025 survey: AI](https://survey.stackoverflow.co/2025/ai); [Stack Overflow blog](https://stackoverflow.blog/2025/07/29/developers-remain-willing-but-reluctant-to-use-ai-the-2025-developer-survey-results-are-here)

### Inferences
- METR's population (expert developers hand-coding in repos they know well) is not Journey's (a non-coding founder directing an agent in a repo the agent wrote). The study doesn't transfer directly. Its durable lesson does: **perceived speed and real speed can point in opposite directions**. An overhaul should be judged on the iPad and in the perf lab, not on how fast the session felt.
- Journey is already running most of the recommended pattern: tokens as the single source, rules as guard tests, round documents as specs, one branch with one commit per phase. Three additions would fill the documented gaps:
  1. A **screenshot loop on real iPad sizes** (portrait and landscape, light and dark) with a before/after per screen.
  2. **"4 directions, AJ picks"** for any screen whose look is changing.
  3. A **fresh-context visual reviewer** that sees only the screenshots and the token rules.
- Journey's CLAUDE.md is very long. Anthropic's own guidance says long always-loaded files cause rules to be ignored and that occasional knowledge belongs in skills. A design-overhaul skill (the Navy Frame and Refined Lift rules, the named anti-patterns, the iPad sizes) loaded only for UI work would follow the documented best practice better than adding more to CLAUDE.md.
- Where a human eye should lead, given the weaknesses above:
  - overall taste and hierarchy across a whole room;
  - anything about touch feel and motion;
  - semantic accessibility;
  - performance on a 10th-gen iPad or iPad mini;
  - the decision between directions.

  Where the model can lead:
  - generating directions;
  - implementing the chosen one against tokens;
  - mechanical sweeps;
  - SVG charts;
  - writing the guard test that locks each new decision in.

### Gaps
- No controlled study of AI speed-up specifically on UI or front-end work, or for non-programmer founders, was found.
- No measured comparison of "skill or instructions file vs none" for Claude's design output exists beyond Anthropic's before/after images.
