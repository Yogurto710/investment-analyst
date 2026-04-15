import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import type { InvestmentMemo } from "./types.js";

const execAsync = promisify(exec);

/**
 * Converts an InvestmentMemo to a professionally formatted PDF
 * Uses Python's reportlab library for PDF generation
 */
export async function exportToPdf(
  memo: InvestmentMemo,
  outputPath: string
): Promise<void> {
  // Create a Python script that generates the PDF
  const pythonScript = generatePythonScript(memo, outputPath);
  
  // Write the Python script to a temp file
  const tempScriptPath = path.join(process.cwd(), "_temp_pdf_generator.py");
  fs.writeFileSync(tempScriptPath, pythonScript);
  
  try {
    // Execute the Python script
    await execAsync(`python "${tempScriptPath}"`);
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempScriptPath)) {
      fs.unlinkSync(tempScriptPath);
    }
  }
}

function generatePythonScript(memo: InvestmentMemo, outputPath: string): string {
  // Escape content for Python strings
  const escape = (str: string) => str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");

  const statusColor = getStatusColor(memo.companyStatus);
  const statusLabel = getStatusLabel(memo.companyStatus);

  return `
import os
try:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib.colors import HexColor, black, white
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
except ImportError:
    os.system("pip install reportlab --break-system-packages -q")
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib.colors import HexColor, black, white
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

# Create the document
doc = SimpleDocTemplate(
    "${escape(outputPath)}",
    pagesize=letter,
    rightMargin=0.75*inch,
    leftMargin=0.75*inch,
    topMargin=0.75*inch,
    bottomMargin=0.75*inch
)

# Define styles
styles = getSampleStyleSheet()

# Custom styles
styles.add(ParagraphStyle(
    name='MemoTitle',
    parent=styles['Title'],
    fontSize=24,
    spaceAfter=6,
    textColor=HexColor('#1a1a2e')
))

styles.add(ParagraphStyle(
    name='MemoSubtitle',
    parent=styles['Normal'],
    fontSize=10,
    textColor=HexColor('#666666'),
    spaceAfter=12
))

styles.add(ParagraphStyle(
    name='StatusBadge',
    parent=styles['Normal'],
    fontSize=11,
    textColor=white,
    backColor=HexColor('${statusColor}'),
    borderPadding=(8, 12, 8, 12),
    spaceAfter=6
))

styles.add(ParagraphStyle(
    name='StatusContext',
    parent=styles['Normal'],
    fontSize=10,
    textColor=HexColor('#444444'),
    leftIndent=0,
    spaceAfter=20,
    leading=14
))

styles.add(ParagraphStyle(
    name='SectionHeader',
    parent=styles['Heading1'],
    fontSize=14,
    textColor=HexColor('#1a1a2e'),
    spaceBefore=20,
    spaceAfter=10,
    borderWidth=0,
    borderColor=HexColor('#1a1a2e'),
    borderPadding=(0, 0, 4, 0)
))

styles.add(ParagraphStyle(
    name='MemoBody',
    parent=styles['Normal'],
    fontSize=10,
    textColor=HexColor('#333333'),
    alignment=TA_JUSTIFY,
    leading=14,
    spaceAfter=8
))

styles.add(ParagraphStyle(
    name='BulletText',
    parent=styles['Normal'],
    fontSize=10,
    textColor=HexColor('#333333'),
    leftIndent=20,
    leading=14,
    spaceAfter=4
))

# Build the story (content)
story = []

# Title
story.append(Paragraph("Investment Memo: ${escape(memo.companyName)}", styles['MemoTitle']))

# Date
from datetime import datetime
date_str = datetime.fromisoformat("${memo.generatedAt}".replace("Z", "+00:00")).strftime("%B %d, %Y")
story.append(Paragraph(f"Generated: {date_str}", styles['MemoSubtitle']))

# Status badge
story.append(Spacer(1, 8))
status_table = Table(
    [[Paragraph("<b>${statusLabel}</b>", ParagraphStyle(
        name='StatusText',
        fontSize=11,
        textColor=white
    ))]],
    colWidths=[2.5*inch]
)
status_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), HexColor('${statusColor}')),
    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 12),
    ('RIGHTPADDING', (0, 0), (-1, -1), 12),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ('ROUNDEDCORNERS', [4, 4, 4, 4]),
]))
story.append(status_table)
story.append(Spacer(1, 8))

# Status context
story.append(Paragraph("${escape(memo.statusContext)}", styles['StatusContext']))

# Divider
story.append(HRFlowable(width="100%", thickness=1, color=HexColor('#e0e0e0'), spaceAfter=10))

# Helper function to add sections
def add_section(title, content):
    story.append(Paragraph(title, styles['SectionHeader']))
    story.append(HRFlowable(width="100%", thickness=2, color=HexColor('#1a1a2e'), spaceAfter=12))
    
    # Split content into paragraphs
    paragraphs = content.split("\\n\\n")
    for para in paragraphs:
        if para.strip():
            # Check if it's a bullet point
            lines = para.split("\\n")
            for line in lines:
                line = line.strip()
                if line.startswith("- ") or line.startswith("• "):
                    story.append(Paragraph("• " + line[2:], styles['BulletText']))
                elif line.startswith("(") and line[1].isdigit():
                    story.append(Paragraph("<b>" + line + "</b>", styles['MemoBody']))
                elif line:
                    story.append(Paragraph(line, styles['MemoBody']))
    story.append(Spacer(1, 8))

# Add all sections
add_section("Executive Summary", """${escape(memo.executiveSummary)}""")
add_section("Timeline", """${escape(memo.timeline)}""")
add_section("Market Analysis", """${escape(memo.marketAnalysis)}""")
add_section("Product & Technology", """${escape(memo.productAndTechnology)}""")
add_section("Team Background", """${escape(memo.teamBackground)}""")
add_section("Traction & Metrics", """${escape(memo.tractionAndMetrics)}""")
add_section("Competitive Comparison", """${escape(memo.competitiveComparison)}""")
add_section("Comparable Transactions", """${escape(memo.comparableTransactions)}""")
add_section("Key Risks", """${escape(memo.keyRisks)}""")
add_section("Data Gaps & Open Questions", """${escape(memo.dataGapsAndOpenQuestions)}""")

# Add Investment Learnings if not active
company_status = "${memo.companyStatus}"
if company_status not in ["ACTIVE", "UNKNOWN"]:
    add_section("Investment Learnings", """${escape(memo.investmentLearnings || "N/A")}""")

add_section("Investment Recommendation", """${escape(memo.investmentRecommendation)}""")

# Footer
story.append(Spacer(1, 20))
story.append(HRFlowable(width="100%", thickness=1, color=HexColor('#e0e0e0'), spaceAfter=10))
story.append(Paragraph(
    "<i>This memo was generated using AI-powered research and analysis. " +
    "Information should be independently verified before making investment decisions.</i>",
    ParagraphStyle(
        name='Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=HexColor('#888888'),
        alignment=TA_CENTER
    )
))

# Build the PDF
doc.build(story)
print(f"PDF saved to: ${escape(outputPath)}")
`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "ACQUIRED": return "#f59e0b";  // Amber
    case "IPO": return "#3b82f6";       // Blue
    case "DEFUNCT": return "#ef4444";   // Red
    case "ACTIVE": return "#22c55e";    // Green
    default: return "#6b7280";          // Gray
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "ACQUIRED": return "⚠️ ACQUIRED";
    case "IPO": return "📈 PUBLIC COMPANY";
    case "DEFUNCT": return "🚫 DEFUNCT";
    case "ACTIVE": return "✅ ACTIVE";
    default: return "❓ UNKNOWN";
  }
}
