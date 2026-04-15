# AI Investment Analyst

An AI-powered CLI that researches any company and produces a structured investment memo — complete with social media sentiment, competitive analysis, and optional PDF export.

Built on [Moonshot AI](https://platform.moonshot.ai) (Kimi) with live web search via [Tavily](https://tavily.com).

## What It Does

Given a company name or URL, the tool runs one of two pipelines:

### Full Memo (English)

1. **Researches the company** — funding history, team, products, market, and news via live Tavily search
2. **Analyses social sentiment** — searches Reddit, X/Twitter, Hacker News, and review sites for real customer opinions (runs in parallel with research)
3. **Generates a structured 13-section investment memo** including a company status determination (Active / Acquired / IPO / Defunct)
4. **Saves to Markdown** — dated file in the current directory
5. **Optionally exports to PDF** — formatted via Python's `reportlab` library

### Brief Memo (Chinese)

A faster, lighter pipeline designed for early-stage Chinese startup research:

1. **Researches via WeChat and official sources** — prioritises mp.weixin.qq.com articles and company websites
2. **Generates a concise Chinese-language memo** with 6 sections: header snapshot, product & technology, team background, competitive landscape, recent developments, and an analyst take

All sources are cited inline with numbered references `[N]` and listed at the bottom of the memo.

## Installation

```bash
npm install
```

Requires Node.js 18+.

## Setup

Create a `.env` file in the project root:

```
MOONSHOT_API_KEY=your_moonshot_key
TAVILY_API_KEY=your_tavily_key
```

- Moonshot AI key: [platform.moonshot.ai](https://platform.moonshot.ai)
- Tavily key: [tavily.com](https://tavily.com)

PDF export additionally requires Python with `reportlab` (auto-installed on first PDF run if not present).

## Usage

> Always use `--` before flags when running via `npm run dev` to prevent npm from intercepting them.

```bash
# Interactive — prompts for company name/URL
npm run dev

# Full memo — by company name
npm run dev -- "Stripe"

# Full memo — by website URL
npm run dev -- "https://stripe.com"

# Full memo — also produce a PDF
npm run dev -- "Stripe" --pdf

# Full memo — skip social media sentiment (faster)
npm run dev -- "Stripe" --skip-sentiment

# Brief Chinese memo — URL with explicit name
npm run dev -- "https://www.rezona.ai/" --brief --name Rezona

# Build and run compiled output
npm run build && npm start -- "Stripe"
```

### Output Files

| Mode | Filename | Example |
|------|----------|---------|
| Full memo | `memo-{company}-{yyyymmdd}.md` | `memo-stripe-20260408.md` |
| Brief memo | `brief-{company}-{yyyymmdd}.md` | `brief-rezona-20260414.md` |

Files are saved in the current working directory.

## Full Memo Sections

| Section | Description |
|---------|-------------|
| Company Status | ACTIVE / ACQUIRED / IPO / DEFUNCT — frames the entire memo |
| Executive Summary | What the company does and core investment thesis |
| Timeline | Chronological milestones — founding, funding, pivots, exits |
| Market Analysis | TAM/SAM/SOM, growth drivers, regulatory environment |
| Product & Technology | How it works, business model, moat assessment |
| Team Background | Founder and exec backgrounds, red flags |
| Traction & Metrics | KPIs tailored to business model (ARR, GMV, MAU, etc.) |
| Competitive Comparison | Side-by-side with 2–4 direct competitors |
| Comparable Transactions | Deal analysis for acquired/IPO companies; valuation multiples |
| Key Risks | Ranked by severity across execution, market, competitive, regulatory |
| Data Gaps & Open Questions | What's missing and 5–10 due diligence questions |
| Investment Learnings | Case study analysis (acquired/IPO/defunct companies only) |
| Investment Recommendation | Verdict with rationale and next steps |

## Brief Memo Sections (Chinese)

| Section | Description |
|---------|-------------|
| 基本信息 | Header table: sector, founding date, HQ, funding stage, investors, raise, flagship product |
| 产品与技术 | Product positioning, business model, tech differentiation, moat assessment |
| 创始人与团队 | Per-founder backgrounds with key-person risk callouts |
| 竞争格局 | Direct competitors, comparison table, competitive strengths and weaknesses |
| 近期动态 | Funding history table, quantified KPIs (with data-age warnings), milestones |
| 分析师评语 | Core investment thesis, biggest uncertainty, 2–3 follow-up conditions |

Every factual claim is cited `（来源[N]）`. Single-source claims are additionally flagged `（待核实）`.

## Social Sentiment Analysis

The sentiment module (full memo only) searches for authentic user voices on Reddit, X/Twitter, Hacker News, and review sites (G2, Capterra, TrustPilot). It extracts:

- Overall sentiment: `POSITIVE`, `MIXED`, `NEGATIVE`, or `INSUFFICIENT_DATA`
- Specific customer praises and complaints
- Competitor comparisons from user discussions
- Red flags (e.g. recurring data loss reports, support failures)

## Project Structure

```
src/
  index.ts                # CLI entry — argument parsing and pipeline orchestration
  researcher.ts           # Tavily search + Kimi synthesis (full EN + brief CN pipelines)
  memo-generator.ts       # Full memo generation and Markdown formatting
  short-memo-generator.ts # Brief Chinese memo generation and Markdown formatting
  pdf-exporter.ts         # PDF generation via Python/reportlab
  types.ts                # TypeScript interfaces
  utils.ts                # Rate-limit and overload retry handler
```

## Notes

- Web search uses [Tavily](https://tavily.com) for live results; results are filtered by relevance score (≥ 0.3) and a domain blocklist
- Research content is truncated at 40,000 characters before memo generation
- The tool retries automatically on rate limit and engine overload errors (60s wait per retry)
- PDF export writes a temporary Python script (`_temp_pdf_generator.py`) and deletes it after use
- See [CLAUDE.md](CLAUDE.md) for implementation details
