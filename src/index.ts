import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { researchCompanyWithSentiment, researchCompanyChinese } from "./researcher.js";
import { generateMemo, formatMemoAsMarkdown } from "./memo-generator.js";
import { generateShortMemo, formatShortMemoAsMarkdown } from "./short-memo-generator.js";
import { exportToPdf } from "./pdf-exporter.js";
import type { CompanyInput } from "./types.js";

function parseInput(input: string): CompanyInput {
  const trimmed = input.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return { url: trimmed };
  }

  if (trimmed.includes(".") && !trimmed.includes(" ")) {
    return { url: `https://${trimmed}` };
  }

  return { name: trimmed };
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log("\n📊 AI Investment Analyst v2.0\n");
  console.log("Features: Company research, sentiment analysis, PDF export\n");

  // Parse command line arguments
  let input = process.argv[2];
  const outputFormat = process.argv.includes("--pdf") ? "pdf" : "markdown";
  const skipSentiment = process.argv.includes("--skip-sentiment");
  const briefMode = process.argv.includes("--brief");
  const nameFlag = (() => {
    const idx = process.argv.indexOf("--name");
    return idx !== -1 ? process.argv[idx + 1] : undefined;
  })();

  if (!input) {
    input = await promptUser("Enter company name or website URL: ");
  }

  if (!input.trim()) {
    console.error("Error: Please provide a company name or URL");
    process.exit(1);
  }

  const companyInput = parseInput(input);
  const displayName = companyInput.url || companyInput.name || "Unknown";

  console.log(`\n🔍 Researching: ${displayName}\n`);

  try {
    const retryHandler = (attempt: number, waitTime: number) => {
      console.log(`   Rate limited. Waiting ${waitTime}s before retry ${attempt}...`);
    };

    const companyName =
      nameFlag ||
      companyInput.name ||
      new URL(companyInput.url!).hostname.replace("www.", "").split(".")[0]
        .replace(/^./, (c) => c.toUpperCase());

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    if (briefMode) {
      // ── Brief Chinese mode ───────────────────────────────────────────────
      console.log("Step 1/2: Researching (WeChat + official sources)...");
      // If --name was given alongside a URL, inject the name so search queries use it
      const briefInput = nameFlag ? { ...companyInput, name: nameFlag } : companyInput;
      const research = await researchCompanyChinese(briefInput, retryHandler);
      console.log("   ✓ Research complete\n");

      console.log("Step 2/2: Generating brief Chinese memo...");
      const memo = await generateShortMemo(companyName, research, retryHandler);
      console.log("   ✓ Memo generated\n");

      const markdown = formatShortMemoAsMarkdown(memo);
      const filename = `brief-${sanitizeFilename(memo.companyName)}-${today}.md`;
      fs.writeFileSync(path.join(process.cwd(), filename), markdown);

      console.log("═══════════════════════════════════════════════════════════════");
      console.log("✅ Brief memo generated successfully!");
      console.log("═══════════════════════════════════════════════════════════════\n");
      console.log("📋 Quick Summary:");
      console.log(`   Company: ${memo.companyName}`);
      console.log(`   File: ${filename}`);
      console.log("");
    } else {
      // ── Full memo mode ────────────────────────────────────────────────────
      console.log("Step 1/4: Gathering company information...");
      let research;

      if (skipSentiment) {
        const { researchCompany } = await import("./researcher.js");
        const basicResearch = await researchCompany(companyInput, retryHandler);
        research = {
          ...basicResearch,
          sentiment: {
            overallSentiment: "INSUFFICIENT_DATA" as const,
            sentimentSummary: "Sentiment analysis skipped.",
            customerPraises: [],
            customerComplaints: [],
            competitorMentions: [],
            redFlags: [],
            sources: [],
          },
        };
      } else {
        console.log("         (includes social media sentiment analysis)");
        research = await researchCompanyWithSentiment(companyInput, retryHandler);
      }

      console.log(`   ✓ Found ${research.sources.length} sources`);

      if (!skipSentiment && research.sentiment.overallSentiment !== "INSUFFICIENT_DATA") {
        console.log(`   ✓ Sentiment: ${getSentimentEmoji(research.sentiment.overallSentiment)} ${research.sentiment.overallSentiment}`);
      }
      console.log("");

      console.log("Step 2/4: Generating investment memo...");
      const enhancedResearch = {
        rawContent: research.rawContent + formatSentimentForMemo(research.sentiment),
        sources: [...research.sources, ...research.sentiment.sources],
      };

      const memo = await generateMemo(companyName, enhancedResearch, retryHandler);
      console.log("   ✓ Memo generated\n");

      console.log("Step 3/4: Saving markdown memo...");
      const markdown = formatMemoAsMarkdown(memo);
      const baseFilename = `memo-${sanitizeFilename(memo.companyName)}-${today}`;
      const mdFilename = `${baseFilename}.md`;
      fs.writeFileSync(path.join(process.cwd(), mdFilename), markdown);
      console.log(`   ✓ Saved to: ${mdFilename}\n`);

      if (outputFormat === "pdf") {
        console.log("Step 4/4: Generating PDF...");
        const pdfFilename = `${baseFilename}.pdf`;
        await exportToPdf(memo, path.join(process.cwd(), pdfFilename));
        console.log(`   ✓ Saved to: ${pdfFilename}\n`);
      } else {
        console.log("Step 4/4: Skipping PDF (use --pdf flag to generate)\n");
      }

      console.log("═══════════════════════════════════════════════════════════════");
      console.log("✅ Investment memo generated successfully!");
      console.log("═══════════════════════════════════════════════════════════════\n");

      console.log("📋 Quick Summary:");
      console.log(`   Company: ${memo.companyName}`);
      console.log(`   Status: ${memo.companyStatus}`);
      if (!skipSentiment) {
        console.log(`   Sentiment: ${getSentimentEmoji(research.sentiment.overallSentiment)} ${research.sentiment.overallSentiment}`);
      }
      console.log(`   Files: ${mdFilename}${outputFormat === "pdf" ? `, ${baseFilename}.pdf` : ""}`);
      console.log("");
    }

  } catch (error) {
    console.error("\n❌ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function getSentimentEmoji(sentiment: string): string {
  switch (sentiment) {
    case "POSITIVE": return "😊";
    case "MIXED": return "😐";
    case "NEGATIVE": return "😟";
    default: return "❓";
  }
}

function formatSentimentForMemo(sentiment: {
  overallSentiment: string;
  sentimentSummary: string;
  customerPraises: string[];
  customerComplaints: string[];
  competitorMentions: string[];
  redFlags: string[];
}): string {
  if (sentiment.overallSentiment === "INSUFFICIENT_DATA") {
    return "\n\n[SENTIMENT ANALYSIS: Insufficient social media data found]\n";
  }

  let result = `

=== SOCIAL MEDIA SENTIMENT ANALYSIS ===
Overall Sentiment: ${sentiment.overallSentiment}

Summary: ${sentiment.sentimentSummary}

Customer Praises:
${sentiment.customerPraises.map(p => `- ${p}`).join("\n") || "- None found"}

Customer Complaints:
${sentiment.customerComplaints.map(c => `- ${c}`).join("\n") || "- None found"}

Competitor Comparisons:
${sentiment.competitorMentions.map(m => `- ${m}`).join("\n") || "- None found"}

Red Flags from Social Media:
${sentiment.redFlags.map(r => `- ${r}`).join("\n") || "- None identified"}
=== END SENTIMENT ANALYSIS ===
`;

  return result;
}

main();
