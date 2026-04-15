import OpenAI from "openai";
import type { ResearchResult, ShortMemo } from "./types.js";
import { withRetry } from "./utils.js";

const client = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY,
  baseURL: "https://api.moonshot.cn/v1",
});

export async function generateShortMemo(
  companyName: string,
  research: ResearchResult,
  onRetry?: (attempt: number, waitTime: number) => void
): Promise<ShortMemo> {
  const maxContentLength = 40000;
  const truncatedContent =
    research.rawContent.length > maxContentLength
      ? research.rawContent.slice(0, maxContentLength) + "\n\n[内容因长度截断]"
      : research.rawContent;

  const response = await withRetry(
    () =>
      client.chat.completions.create({
        model: "kimi-k2.5",
        max_tokens: 10000,
        messages: [
          {
            role: "user",
            content: `你是一名专业的中国风险投资研究分析师。请根据以下关于「${companyName}」的调研资料，生成一份简洁的中文投资研究摘要。

调研资料（每条来源标有编号 [N]，行内引用请使用该编号）：
${truncatedContent}

请严格按照以下 JSON 格式输出，所有内容必须使用简体中文，不得使用英文。

{
  "headerSnapshot": "一个 Markdown 表格，包含以下字段（如信息不足填「未披露」）：\n| 项目 | 内容 |\n|------|------|\n| 赛道 | 例：AI动画生成 / 企业SaaS / 消费级应用 |\n| 成立时间 | 例：2024年10月 |\n| 总部 | 例：北京 / 上海 / 深圳 |\n| 融资阶段 | 例：天使轮 / Pre-A轮 / A轮 |\n| 核心投资方 | 例：锦秋基金、高瓴资本 |\n| 累计融资额 | 例：1,200万美元 |\n| 代表产品 | 例：OiiOii动画平台 |",

  "productAndTechnology": "产品与技术分析。使用以下结构，严格用 Markdown 格式（**加粗**子标题，「- 」列表，表格做对比）：\n\n**核心产品**\n- 产品定位与主要功能\n- 目标用户群体\n\n**商业模式**\n- 收费方式与定价逻辑\n\n**技术差异化**\n- 核心技术亮点（具体，避免营销话术）\n- 与竞品的关键差异\n\n**护城河评估**\n- 列出实际存在的防御性来源（网络效应、转换成本、数据优势、专有技术等），诚实评估强弱\n\n置信度规则：每个关键事实后用（来源[N]）标注；仅有单一来源的事实额外加（待核实）；多来源交叉验证的事实不需额外标注。",

  "teamBackground": "创始人与核心团队背景。每位成员用 **姓名／花名** 作小标题，经历用「- 」列表。包含：教育背景、过往就职经历、相关行业经验。结尾用 **⚠️ 风险提示** 段落说明关键人依赖、团队短板等。若信息不足请明确说明。每个关键事实后用（来源[N]）标注；单一来源加（待核实）。",

  "competitiveLandscape": "竞争格局分析。使用以下结构：\n\n**直接竞争对手**\n列出2-4个直接竞品，每个用「- **竞品名**：一句话描述其定位与核心差异」。\n\n**竞争对比表**\n用 Markdown 表格对比3-4个最关键维度（根据赛道选择最相关的：定价模式、目标客群、技术路线、融资规模、地理覆盖等）：\n| 维度 | ${companyName} | 竞品A | 竞品B |\n|------|--------------|-------|-------|\n\n**竞争优劣势小结**\n- **优势**：具体说明赢过竞品的方面\n- **劣势**：具体说明落后竞品的方面\n\n若资料不足以支撑完整竞争分析，请据实说明已知部分，并标注信息缺口。每个关键事实后用（来源[N]）标注；单一来源加（待核实）。",

  "recentDevelopments": "近期动态。使用以下结构：\n\n**融资历史**\n用表格呈现（列：轮次 | 金额 | 投资方 | 估值 | 日期）。\n\n**核心指标**\n- 列出所有可量化指标（ARR/GMV/DAU/用户数等），每项注明数据日期\n- 超过12个月的数据标注「⚠️ 数据较旧」\n\n**重要里程碑**\n- 按时间倒序列出产品发布、战略合作、重大事件\n\n每个关键事实后用（来源[N]）标注；单一来源加（待核实）。",

  "analystTake": "分析师评语。用以下三段式结构，每段2-4句，语气直接、有判断力，不做中立描述：\n\n**核心投资逻辑**\n这家公司最值得关注的理由是什么？市场机会与产品切入点的逻辑是否成立？\n\n**最大不确定性**\n当前最关键的悬而未决的问题是什么？这个风险是否可以通过尽职调查解答，还是属于内生性不确定性？\n\n**跟进条件**\n若要进入下一步尽职调查，需要哪2-3个具体条件成立（例：ARR突破XXX / 验证商业模式转化率 / 关键人才到位）？"
}

输出格式要求（重要）：
- 必须输出合法的 JSON，不得添加 Markdown 代码块包裹（即不要输出 \`\`\`json）
- JSON 字符串值内的换行必须使用转义序列 \\n，不得使用真实换行符
- 不得在 JSON 字符串内使用未转义的双引号
- 全文使用简体中文
- 信息不足时如实说明，不得杜撰`,
          },
        ],
      }),
    3,
    onRetry
  );

  const textContent = response.choices[0]?.message?.content;
  if (!textContent) throw new Error("模型未返回内容");

  const stripped = textContent.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "");
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("无法从响应中解析 JSON");

  const memoData = JSON.parse(jsonMatch[0]);

  return {
    companyName,
    generatedAt: new Date().toISOString(),
    sources: research.sources,
    ...memoData,
  };
}

export function formatShortMemoAsMarkdown(memo: ShortMemo): string {
  const dateStr = new Date(memo.generatedAt).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let md = `# 投资研究摘要：${memo.companyName}

**生成日期：** ${dateStr}

${memo.headerSnapshot}

---

## 产品与技术

${memo.productAndTechnology}

---

## 创始人与团队

${memo.teamBackground}

---

## 竞争格局

${memo.competitiveLandscape}

---

## 近期动态

${memo.recentDevelopments}

---

## 分析师评语

${memo.analystTake}

---
`;

  if (memo.sources && memo.sources.length > 0) {
    md += `
## 参考来源

${memo.sources.map((url, i) => `[${i + 1}] ${url}`).join("\n")}

---
`;
  }

  md += `
*本摘要由 AI 辅助生成，主要参考微信公众号及官方网站资料。投资决策前请独立核实相关信息。*
`;

  return md;
}
