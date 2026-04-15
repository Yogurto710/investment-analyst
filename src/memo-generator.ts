import OpenAI from "openai";
import type { ResearchResult, InvestmentMemo } from "./types.js";
import { withRetry } from "./utils.js";

const client = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY,
  baseURL: "https://api.moonshot.cn/v1",
});

export async function generateMemo(
  companyName: string,
  research: ResearchResult,
  onRetry?: (attempt: number, waitTime: number) => void
): Promise<InvestmentMemo> {
  // Truncate content to stay within rate limits
  const maxContentLength = 40000;
  const truncatedContent = research.rawContent.length > maxContentLength
    ? research.rawContent.slice(0, maxContentLength) + "\n\n[Content truncated for length...]"
    : research.rawContent;
  const topSources = research.sources.slice(0, 15);

  const response = await withRetry(() => client.chat.completions.create({
    model: "kimi-k2.5",
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: `Based on the following research about "${companyName}", generate a structured investment memo.

RESEARCH DATA:
${truncatedContent}

SOURCES CONSULTED:
${topSources.join("\n")}

=============================================================================
STEP 1: DETERMINE COMPANY STATUS (Do this FIRST before any other analysis)
=============================================================================

Before writing the memo, determine the company's current status:
- ACTIVE: Still operating independently and available for investment
- ACQUIRED: Has been purchased by another company
- IPO: Has gone public (listed on stock exchange)
- DEFUNCT: Has shut down or gone bankrupt
- UNKNOWN: Cannot determine status from available information

This status will change how you frame the entire memo.

=============================================================================
STEP 2: IDENTIFY BUSINESS MODEL
=============================================================================

Identify what type of company this is (e.g., B2B SaaS, consumer app, fintech, healthcare, AI/ML infrastructure, marketplace, hardware, etc.). Tailor your analysis to the metrics and competitive dynamics relevant to that specific business model.

=============================================================================
STEP 3: GENERATE MEMO
=============================================================================

Respond in this exact JSON format:
{
  "companyStatus": "ACTIVE | ACQUIRED | IPO | DEFUNCT | UNKNOWN",
  
  "statusContext": "If ACQUIRED: who acquired them, when, for how much, and what this means for the analysis. If IPO: when, at what valuation, current market cap. If DEFUNCT: when and why. If ACTIVE: confirm the company is currently operating and available for investment. This will appear prominently at the top of the memo.",

  "executiveSummary": "2-3 paragraph overview including: (1) What the company does in plain English, (2) The core investment thesis - why this could be a good/bad investment, (3) Key highlights and concerns at a glance. NOTE: If company is ACQUIRED/IPO/DEFUNCT, frame this as a case study and focus on what made it successful or what went wrong.",
  
  "timeline": "A chronological list of key milestones with dates. Include: founding date, major product launches, funding rounds (with amounts and valuations), key partnerships, major pivots, acquisition/IPO if applicable. Format as a clear timeline from earliest to most recent. If exact dates unknown, use approximate timeframes (e.g., 'Q2 2024', 'Late 2023'). This helps investors understand the company's velocity and trajectory.",

  "marketAnalysis": "Analysis including: (1) Market size (TAM/SAM/SOM) with sources, (2) Market growth rate and key drivers, (3) Industry trends and tailwinds/headwinds, (4) Regulatory environment if relevant",
  
  "productAndTechnology": "Description covering: (1) Core product/service and how it works, (2) Business model (how they make money), (3) Technology or operational differentiation, (4) Moat assessment - what makes this defensible (consider: network effects, switching costs, economies of scale, brand, regulatory barriers, data advantages, proprietary technology, distribution)",
  
  "teamBackground": "Founding team and key executives' backgrounds, relevant experience, and any red flags",
  
  "tractionAndMetrics": "Include available data on funding history and key metrics relevant to their business model. For SaaS: ARR, growth rate, churn, NRR. For marketplaces: GMV, take rate, liquidity. For consumer: MAU/DAU, retention, engagement. For fintech: TPV, loan volume, default rates. For hardware: units shipped, ASP, gross margin. Note which metrics are missing.",
  
  "keyRisks": "Main risks and challenges, ranked by severity. Consider: execution risk, market risk, competitive risk, regulatory risk, technology risk, team risk, funding risk. If ACQUIRED/IPO: frame as 'risks that existed at time of investment' and note which materialized.",
  
  "competitiveComparison": "A detailed comparison with 2-4 direct competitors, structured as follows:

(1) COMPETITOR OVERVIEW: For each competitor, provide:
    - Company name and brief description
    - How they compete with the target company (direct vs indirect)
    - Their key strength

(2) COMPARISON MATRIX: Compare across dimensions RELEVANT TO THIS BUSINESS MODEL. Choose 4-6 of the most applicable:
    
    For most companies: Pricing/business model, Target customer, Geographic focus, Key differentiator, Funding/scale
    
    For SaaS: Also consider features, integrations, enterprise vs SMB focus
    For marketplaces: Also consider supply/demand balance, category focus, take rate
    For fintech: Also consider regulatory status, product breadth, risk approach
    For consumer: Also consider user experience, viral mechanics, content/community
    For AI/ML: Also consider model performance, API pricing, context limits, fine-tuning options
    For hardware: Also consider manufacturing, supply chain, price point

(3) WIN/LOSS SUMMARY: Where does the target company win vs each competitor? Where do they lose? Be specific and honest.",

  "comparableTransactions": "IMPORTANT: Only include this section if the company is ACQUIRED or IPO, or if analyzing valuation for an ACTIVE company's recent funding round.

For ACQUIRED companies, analyze:
(1) DEAL DETAILS: Acquirer, price, date, deal structure (cash/stock/earnout)
(2) VALUATION MULTIPLES: Calculate and state the multiple on revenue (Price/ARR or Price/Revenue), and compare to typical multiples for this sector
(3) COMPARABLE ACQUISITIONS: List 2-4 similar acquisitions in the same sector with their multiples:
    - Company name, acquirer, date, price, and revenue multiple
    - Note if the target company's multiple was higher/lower and why
(4) INVESTOR RETURNS: If funding history is known, estimate the return multiple for each round
(5) WHAT JUSTIFIED THE PREMIUM/DISCOUNT: Why did the acquirer pay this price?

For IPO companies, analyze:
(1) IPO pricing vs current trading
(2) Comparable public companies and their multiples
(3) How the company's metrics compare to public peers

For ACTIVE companies with recent funding:
(1) Valuation multiple on current metrics
(2) How this compares to similar recent rounds
(3) Whether the valuation seems reasonable

If company is ACTIVE with no recent funding news, write 'No comparable transaction analysis required - company is privately operating. This section would be relevant upon exit or new funding round.'",

  "dataGapsAndOpenQuestions": "Organize missing information into these categories:

(1) FINANCIAL UNKNOWNS:
    - What financial metrics could not be found? (revenue, burn rate, unit economics, margins)
    - What's the confidence level in the numbers that WERE found? (verified by multiple sources vs single report vs estimate)

(2) BUSINESS MODEL UNKNOWNS:
    - Pricing details not available
    - Customer concentration unknown
    - Retention/churn data missing

(3) COMPETITIVE UNKNOWNS:
    - Competitor data that couldn't be verified
    - Market share estimates that seem unreliable

(4) STRATEGIC UNKNOWNS:
    - Go-to-market strategy unclear
    - Expansion plans not disclosed
    - Partnership details missing

(5) DUE DILIGENCE QUESTIONS:
    List 5-10 specific questions you would ask management in a pitch meeting (or would have asked, if ACQUIRED/DEFUNCT), prioritized by importance.",

  "investmentLearnings": "IMPORTANT: Only include substantive content if company is ACQUIRED, IPO, or DEFUNCT. For ACTIVE companies, write 'N/A - Company is still active. Learnings will be assessable upon exit.'

For ACQUIRED/IPO/DEFUNCT companies, provide:
(1) WHAT WORKED: Key factors that drove success (or showed promise before failure)
(2) WHAT DIDN'T WORK: Challenges faced, mistakes made, or risks that materialized
(3) PATTERN RECOGNITION: What signals from this company should investors look for in future opportunities?
(4) SECTOR INSIGHTS: What does this outcome tell us about the broader market/sector?
(5) SIMILAR OPPORTUNITIES: Are there comparable companies still available for investment that share the positive attributes?",

  "investmentRecommendation": "Adjust based on company status:

For ACTIVE companies: Provide (1) Clear verdict: Strong Pass / Pass / Neutral / Interesting / Strong Interest, (2) One-paragraph rationale, (3) What would need to be true to upgrade/downgrade, (4) Suggested next steps if proceeding

For ACQUIRED companies: Provide (1) Assessment of whether this WOULD HAVE BEEN a good investment at last funding round, (2) Analysis of actual returns achieved, (3) Key takeaways for finding similar opportunities

For IPO companies: Provide (1) Assessment of IPO as exit for private investors, (2) Current attractiveness as public equity, (3) Comparison to private market expectations

For DEFUNCT companies: Provide (1) Post-mortem on what went wrong, (2) Whether the investment thesis was flawed or execution failed, (3) Warning signs that were missed"
}

QUALITY GUIDELINES:
- Lead with company status - don't bury critical information like 'this company was acquired'
- Be specific and quantitative wherever possible
- Tailor metrics and comparisons to the actual business model
- Be honest about uncertainty - tag claims with confidence levels where appropriate
- The memo should be actionable - a reader should know exactly what to do next
- For acquired/IPO companies, focus on LEARNINGS not just historical description

FORMATTING RULES (strictly enforced):
- Use Markdown formatting throughout: **bold** for labels/sub-headings, - bullet points for lists, | tables | for structured comparisons or funding history
- Never output a wall of plain text — break content into clearly labelled sub-sections with blank lines between them
- Separate list items with a newline (\\n), never with commas
- Cite sources inline as (Source [N]) after each key fact where the research provided numbered references
- Use tables for: competitor comparison matrix, funding rounds, metric summaries`,
      },
    ],
  }), 3, onRetry);

  const textContent = response.choices[0]?.message?.content;
  if (!textContent) {
    throw new Error("No text response from model");
  }

  const stripped = textContent.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "");
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not parse memo JSON from response");
  }

  const memoData = JSON.parse(jsonMatch[0]);

  return {
    companyName,
    generatedAt: new Date().toISOString(),
    sources: research.sources,
    ...memoData,
  };
}

export function formatMemoAsMarkdown(memo: InvestmentMemo): string {
  // Determine status badge styling
  const statusBadge = getStatusBadge(memo.companyStatus);
  
  // Conditionally include sections based on company status
  const isActiveCompany = memo.companyStatus === "ACTIVE" || memo.companyStatus === "UNKNOWN";
  
  let markdown = `# Investment Memo: ${memo.companyName}

**Generated:** ${new Date(memo.generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })}

${statusBadge}

${memo.statusContext}

---

## Executive Summary

${memo.executiveSummary}

---

## Timeline

${memo.timeline}

---

## Market Analysis

${memo.marketAnalysis}

---

## Product & Technology

${memo.productAndTechnology}

---

## Team Background

${memo.teamBackground}

---

## Traction & Metrics

${memo.tractionAndMetrics}

---

## Competitive Comparison

${memo.competitiveComparison}

---

## Comparable Transactions

${memo.comparableTransactions}

---

## Key Risks

${memo.keyRisks}

---

## Data Gaps & Open Questions

${memo.dataGapsAndOpenQuestions}

---
`;

  // Add Investment Learnings section only for non-active companies
  if (!isActiveCompany) {
    markdown += `
## Investment Learnings

${memo.investmentLearnings}

---
`;
  }

  markdown += `
## Investment Recommendation

${memo.investmentRecommendation}

---
`;

  if (memo.sources && memo.sources.length > 0) {
    markdown += `
## Sources

${memo.sources.map((url, i) => `[${i + 1}] ${url}`).join("\n")}

---
`;
  }

  markdown += `
*This memo was generated using AI-powered research and analysis. Information should be independently verified before making investment decisions.*
`;

  return markdown;
}

function getStatusBadge(status: string): string {
  switch (status) {
    case "ACQUIRED":
      return `> **⚠️ STATUS: ACQUIRED**  
> This company has been acquired and is no longer available for direct investment.  
> This memo serves as a **case study** for evaluating similar opportunities.`;
    
    case "IPO":
      return `> **📈 STATUS: PUBLIC COMPANY**  
> This company has completed an IPO and trades on public markets.  
> This memo analyzes the company as both a historical private investment and current public equity.`;
    
    case "DEFUNCT":
      return `> **🚫 STATUS: DEFUNCT**  
> This company has shut down operations.  
> This memo serves as a **post-mortem case study** to identify warning signs and lessons learned.`;
    
    case "ACTIVE":
      return `> **✅ STATUS: ACTIVE**  
> This company is currently operating and potentially available for investment.`;
    
    default:
      return `> **❓ STATUS: UNKNOWN**  
> Could not verify current company status. Please confirm independently before proceeding.`;
  }
}
