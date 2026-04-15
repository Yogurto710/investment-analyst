# AI Investment Analyst — Claude Code Guide

## Project Overview

A CLI tool that researches a company and produces a structured investment memo as Markdown (and optionally PDF). Supports two modes:

- **Full memo** — English, 13-section, with social sentiment analysis and optional PDF export
- **Brief memo** — Chinese, 6-section, focused on WeChat and official sources; designed for early-stage Chinese startup research

Uses **Tavily** for web search and **Moonshot AI (Kimi)** for synthesis and memo generation.

**Model used throughout**: `kimi-k2.5`  
**API base URL**: `https://api.moonshot.cn/v1`  
**Auth**: `MOONSHOT_API_KEY` and `TAVILY_API_KEY` in `.env`

## Architecture

```
src/
  index.ts               # CLI entry point — parses args, orchestrates pipelines
  researcher.ts          # Tavily searches → Kimi synthesis; full (EN) + brief (CN) research
  memo-generator.ts      # Full memo: JSON → InvestmentMemo → Markdown
  short-memo-generator.ts # Brief memo: JSON → ShortMemo → Markdown
  pdf-exporter.ts        # Writes a temp Python script and executes it via reportlab
  types.ts               # Shared TypeScript interfaces
  utils.ts               # withRetry() — handles API rate limit + overload errors
```

## Pipelines

### Full memo (4 steps)

1. **Research** — `researchCompany()` + `analyzeSocialSentiment()` run in parallel via `Promise.all`. Each fires 5 Tavily searches in parallel, formats the results, then sends them to Kimi for synthesis in a single call.
2. **Memo generation** — `generateMemo()` takes raw research text and produces a JSON-structured `InvestmentMemo`. Research content is truncated at 40,000 chars before being sent. Uses the OpenAI SDK pointed at Moonshot's base URL.
3. **Markdown save** — `formatMemoAsMarkdown()` renders the memo. File saved as `memo-{slug}-{yyyymmdd}.md` in `cwd`.
4. **PDF export** (optional) — `exportToPdf()` generates a Python script using `reportlab`, writes it as `_temp_pdf_generator.py`, executes via `python`, then deletes the temp file.

### Brief memo (2 steps)

1. **Research** — `researchCompanyChinese()` fires 5 Tavily searches (WeChat public articles, official site, recent news, funding, team) in parallel, then synthesises via a single Kimi call. Returns a globally-numbered source list.
2. **Memo generation** — `generateShortMemo()` produces a 6-field JSON (`headerSnapshot`, `productAndTechnology`, `teamBackground`, `competitiveLandscape`, `recentDevelopments`, `analystTake`). File saved as `brief-{slug}-{yyyymmdd}.md`.

## CLI

```bash
# Full memo
npm run dev -- "Stripe"                          # by name
npm run dev -- "https://stripe.com"              # by URL
npm run dev -- "Stripe" --pdf                    # also produce PDF
npm run dev -- "Stripe" --skip-sentiment         # skip social media analysis

# Brief Chinese memo
npm run dev -- "https://www.rezona.ai/" --brief --name Rezona

# Interactive prompt
npm run dev
```

> **Important**: Always use `--` before arguments when running via `npm run dev`, otherwise npm intercepts flags like `--brief` as its own config options.

## Research Flow (Tavily + Kimi)

For each research call:

1. Define 5 targeted search queries
2. Fire all 5 queries **in parallel** via the Tavily REST API (`POST api.tavily.com/search`)
3. Assign globally-sequential `[N]` indices to all results across all query categories using `buildSearchContext()`
4. Send the combined context to Kimi in a **single synthesis call** — no tool loop needed

The globally-sequential numbering means inline `[N]` citations in the model's output map directly to entries in the `sources[]` array appended to the bottom of each memo.

**Why Tavily instead of Kimi's `$web_search`**: Kimi's built-in search index tops out around early 2025. Tavily provides live, up-to-date results and gives full control over query strategy. It also eliminates the complex multi-turn tool-call loop that `$web_search` required.

**Kimi calls** in `researcher.ts` use raw `fetch` (not the OpenAI SDK) to avoid the SDK stripping Kimi-specific response fields.

### Source Quality Filtering

`tavilySearch()` applies two filters before returning results:

- **Score filter**: drops results with `score < 0.3` (low relevance)
- **Domain blocklist** (`BLOCKED_DOMAINS`): drops known noise domains (e.g. `storage.googleapis.com/google-code-archive`, `code.google.com`)

## Key Types (`src/types.ts`)

- `CompanyInput` — `{ name?: string; url?: string }`
- `InvestmentMemo` — 13 fields: `companyStatus`, `statusContext`, `executiveSummary`, `timeline`, `marketAnalysis`, `productAndTechnology`, `teamBackground`, `tractionAndMetrics`, `keyRisks`, `competitiveComparison`, `comparableTransactions`, `dataGapsAndOpenQuestions`, `investmentLearnings`, `investmentRecommendation`; plus `sources?: string[]`
- `ShortMemo` — 8 fields: `companyName`, `generatedAt`, `headerSnapshot`, `productAndTechnology`, `teamBackground`, `competitiveLandscape`, `recentDevelopments`, `analystTake`, `sources: string[]`
- `SentimentAnalysis` — `overallSentiment` (POSITIVE/MIXED/NEGATIVE/INSUFFICIENT_DATA), `customerPraises`, `customerComplaints`, `competitorMentions`, `redFlags`

## Brief Memo Template

Each section uses structured Markdown with specific formatting rules:

- **headerSnapshot** — Markdown table with: 赛道, 成立时间, 总部, 融资阶段, 核心投资方, 累计融资额, 代表产品
- **productAndTechnology** — subheadings: 核心产品, 商业模式, 技术差异化, 护城河评估
- **teamBackground** — per-person `**姓名**` subheadings with bullet lists; ends with `⚠️ 风险提示`
- **competitiveLandscape** — 直接竞争对手 list, Markdown comparison table, 竞争优劣势小结
- **recentDevelopments** — 融资历史 table, 核心指标 bullets (with date and ⚠️ if >12 months old), 重要里程碑 in reverse-chronological order
- **analystTake** — three paragraphs: 核心投资逻辑, 最大不确定性, 跟进条件

**Confidence tagging**: every factual claim is tagged `（来源[N]）`; single-source claims additionally get `（待核实）`.

## Company Status Logic (Full Memo)

`companyStatus` drives conditional rendering in both Markdown and PDF:
- `ACTIVE` / `UNKNOWN` — Investment Learnings section is **omitted**; recommendation gives a live verdict
- `ACQUIRED` / `IPO` / `DEFUNCT` — Investment Learnings section is **included**; memo is framed as a case study

## Rate Limiting

`withRetry()` in `utils.ts` catches errors containing `rate_limit` **or** `engine_overloaded` and waits 60 seconds per attempt (flat, no exponential back-off). Retries indefinitely on these errors; all other errors are rethrown immediately.

## JSON Parsing

Both memo generators strip markdown code fences before parsing the model's JSON output:

```typescript
const stripped = textContent.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "");
const jsonMatch = stripped.match(/\{[\s\S]*\}/);
```

This handles cases where the model wraps its JSON output in ` ```json ``` ` blocks despite being instructed not to.

## PDF Export Dependency

Requires Python with `reportlab`. Auto-installs via `pip install reportlab --break-system-packages -q` on first PDF run if not present. No Node-native PDF library is used. PDF export is only available in full memo mode.

## Output Files

All output written to `process.cwd()`.

| Mode | Filename format | Example |
|------|----------------|---------|
| Full memo | `memo-{slug}-{yyyymmdd}.md` | `memo-stripe-20260408.md` |
| Brief memo | `brief-{slug}-{yyyymmdd}.md` | `brief-rezona-20260414.md` |
