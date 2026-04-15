import type { CompanyInput, ResearchResult } from "./types.js";
import { withRetry } from "./utils.js";

const MOONSHOT_API_URL = "https://api.moonshot.cn/v1/chat/completions";
const TAVILY_API_URL = "https://api.tavily.com/search";

// ---------------------------------------------------------------------------
// Tavily search
// ---------------------------------------------------------------------------

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  published_date?: string;
  score?: number;
}

// Domains that consistently produce noise (archive dumps, unrelated tooling docs, etc.)
const BLOCKED_DOMAINS = [
  "storage.googleapis.com/google-code-archive",
  "code.google.com",
];

async function tavilySearch(
  query: string,
  maxResults = 5,
  minScore = 0.3
): Promise<TavilyResult[]> {
  const res = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "basic",
      max_results: maxResults,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily ${res.status}: ${text}`);
  }

  const data = await res.json();
  const results = (data.results ?? []) as TavilyResult[];

  return results.filter(
    (r) =>
      (r.score === undefined || r.score >= minScore) &&
      !BLOCKED_DOMAINS.some((d) => r.url.includes(d))
  );
}

/**
 * Builds a globally-numbered search context block from multiple labelled result sets.
 * Returns the formatted context string and a flat list of source URLs so that
 * [N] references in the model's output map directly to the returned sources array.
 */
function buildSearchContext(
  sections: Array<{ label: string; results: TavilyResult[] }>
): { context: string; sources: string[] } {
  const sources: string[] = [];
  const parts: string[] = [];

  for (const { label, results } of sections) {
    if (results.length === 0) {
      parts.push(`## ${label}\n无相关结果。`);
      continue;
    }
    const lines = [`## ${label}`];
    for (const r of results) {
      const idx = sources.length + 1;
      sources.push(r.url);
      lines.push(
        `### [${idx}] ${r.title}\nURL: ${r.url}${r.published_date ? `\nDate: ${r.published_date}` : ""}\n${r.content}`
      );
    }
    parts.push(lines.join("\n\n"));
  }

  return { context: parts.join("\n\n"), sources };
}

// ---------------------------------------------------------------------------
// Kimi synthesis (single-turn — no tool loop needed)
// ---------------------------------------------------------------------------

async function kimiRequest(body: object): Promise<any> {
  const res = await fetch(MOONSHOT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MOONSHOT_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }

  return res.json();
}

async function kimiSynthesize(
  messages: any[],
  maxTokens: number,
  onRetry?: (attempt: number, waitTime: number) => void
): Promise<string> {
  const data = await withRetry(
    () => kimiRequest({ model: "kimi-k2.5", max_tokens: maxTokens, messages }),
    3,
    onRetry
  );
  return data.choices[0]?.message?.content ?? "";
}

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface SentimentAnalysis {
  overallSentiment: "POSITIVE" | "MIXED" | "NEGATIVE" | "INSUFFICIENT_DATA";
  sentimentSummary: string;
  customerPraises: string[];
  customerComplaints: string[];
  competitorMentions: string[];
  redFlags: string[];
  sources: string[];
}

export interface ExtendedResearchResult extends ResearchResult {
  sentiment: SentimentAnalysis;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function researchCompanyWithSentiment(
  input: CompanyInput,
  onRetry?: (attempt: number, waitTime: number) => void
): Promise<ExtendedResearchResult> {
  const [basicResearch, sentiment] = await Promise.all([
    researchCompany(input, onRetry),
    analyzeSocialSentiment(input, onRetry),
  ]);

  return { ...basicResearch, sentiment };
}

export async function researchCompany(
  input: CompanyInput,
  onRetry?: (attempt: number, waitTime: number) => void
): Promise<ResearchResult> {
  const companyName = input.name || extractCompanyName(input.url || "");
  const companyRef = input.url ? `the company at ${input.url}` : `"${companyName}"`;
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  // Run all searches in parallel for speed
  const queries = [
    `${companyName} ${currentYear}`,
    `${companyName} ${lastYear}`,
    `${companyName} funding raise valuation ${currentYear}`,
    `${companyName} site:github.com`,
    `${companyName} revenue customers growth`,
  ];

  const allResults = await Promise.all(queries.map((q) => tavilySearch(q, 5)));

  const { context: searchContext, sources } = buildSearchContext([
    { label: `Latest news (${currentYear})`, results: allResults[0] },
    { label: `Prior year (${lastYear})`, results: allResults[1] },
    { label: "Funding & valuation", results: allResults[2] },
    { label: "GitHub / open-source", results: allResults[3] },
    { label: "Revenue & growth metrics", results: allResults[4] },
  ]);

  const rawContent = await kimiSynthesize(
    [
      {
        role: "user",
        content: `You are an investment research analyst. Today's date is ${new Date().toDateString()}.

Below are live search results for ${companyRef}. Synthesise them into a thorough research report covering:

1. Company overview and current status
2. Market size and competitive landscape
3. Products, technology, and recent feature releases
4. Founding team and key executives
5. Traction metrics: funding history, revenue, growth rate, customer count, GitHub stars / community size
6. News and developments from the last 12 months
7. Potential risks and challenges

FRESHNESS RULES:
- For metrics that change over time (GitHub stars, ARR, headcount, valuation), report only the most recent figure and note its date
- If conflicting figures appear, cite the most recent source and flag the discrepancy
- Explicitly note when a data point is more than 12 months old

---

${searchContext}`,
      },
    ],
    16000,
    onRetry
  );

  return { rawContent, sources };
}

export async function analyzeSocialSentiment(
  input: CompanyInput,
  onRetry?: (attempt: number, waitTime: number) => void
): Promise<SentimentAnalysis> {
  const companyName = input.name || extractCompanyName(input.url || "");

  const queries = [
    `${companyName} review reddit`,
    `${companyName} twitter feedback`,
    `${companyName} complaints problems`,
    `${companyName} vs competitors`,
    `${companyName} user experience`,
  ];

  const allResults = await Promise.all(queries.map((q) => tavilySearch(q, 5)));

  const { context: searchContext, sources } = buildSearchContext([
    { label: "Reddit discussions", results: allResults[0] },
    { label: "Twitter / X feedback", results: allResults[1] },
    { label: "Complaints & problems", results: allResults[2] },
    { label: "Competitor comparisons", results: allResults[3] },
    { label: "User experience", results: allResults[4] },
  ]);

  const textContent = await kimiSynthesize(
    [
      {
        role: "user",
        content: `Analyze customer and user sentiment for "${companyName}" based on the search results below.

Focus on authentic user voices (Reddit, X/Twitter, Hacker News, G2, Capterra, TrustPilot). Ignore marketing content and press releases.

Return ONLY a JSON object in this exact format — no other text:
{
  "overallSentiment": "POSITIVE | MIXED | NEGATIVE | INSUFFICIENT_DATA",
  "sentimentSummary": "2-3 sentence summary of overall user sentiment",
  "customerPraises": ["specific thing users praise", "..."],
  "customerComplaints": ["specific complaint", "..."],
  "competitorMentions": ["how this company compares to competitors", "..."],
  "redFlags": ["any serious concern raised by users", "..."]
}

If there is insufficient authentic discussion, set overallSentiment to "INSUFFICIENT_DATA".

---

${searchContext}`,
      },
    ],
    8000,
    onRetry
  );

  try {
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { ...parsed, sources };
    }
  } catch (_e) {
    // fall through to default
  }

  return {
    overallSentiment: "INSUFFICIENT_DATA",
    sentimentSummary: "Could not parse sentiment analysis results.",
    customerPraises: [],
    customerComplaints: [],
    competitorMentions: [],
    redFlags: [],
    sources,
  };
}

export async function researchCompanyChinese(
  input: CompanyInput,
  onRetry?: (attempt: number, waitTime: number) => void
): Promise<ResearchResult> {
  const companyName = input.name || extractCompanyName(input.url || "");

  // Prioritise WeChat public accounts and official site; supplement with general Chinese-language sources
  // If a URL is provided, use it as an explicit anchor query for the official site
  const officialSiteQuery = input.url
    ? `${companyName} site:${new URL(input.url).hostname}`
    : `${companyName} 官网`;

  const queries = [
    `site:mp.weixin.qq.com ${companyName}`,
    `${companyName} 产品 技术 功能`,
    `${companyName} 创始人 团队 背景`,
    `${companyName} 融资 营收 用户数 增长`,
    officialSiteQuery,
  ];

  const allResults = await Promise.all(queries.map((q) => tavilySearch(q, 6)));

  const { context: searchContext, sources } = buildSearchContext([
    { label: "微信公众号文章", results: allResults[0] },
    { label: "产品与技术", results: allResults[1] },
    { label: "创始人与团队", results: allResults[2] },
    { label: "融资与增长数据", results: allResults[3] },
    { label: "官网与综合信息", results: allResults[4] },
  ]);

  const rawContent = await kimiSynthesize(
    [
      {
        role: "user",
        content: `你是一名专业的投资研究分析师，今天的日期是 ${new Date().toLocaleDateString("zh-CN")}。

以下是关于「${companyName}」的最新搜索结果（每条来源标注了编号 [N]），来源包括微信公众号、官网及中文媒体。请基于这些资料，整理出一份结构清晰的中文研究摘要，涵盖：

1. 产品与技术：核心产品功能、商业模式、技术亮点
2. 创始人与团队：创始人背景、核心管理层经历
3. 近期动态：融资历史、营收、用户数、增长率等可量化数据

行内引用要求：每个关键事实后用（来源[N]）标注对应编号，可同时引用多个来源。

数据时效性要求：
- 对于随时间变化的指标（如用户数、融资金额），请注明数据来源日期
- 若发现数据冲突，以最新来源为准并标注差异
- 超过12个月的数据请明确标注

---

${searchContext}`,
      },
    ],
    12000,
    onRetry
  );

  return { rawContent, sources };
}

function extractCompanyName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace("www.", "").split(".")[0];
  } catch {
    return url;
  }
}
