export interface CompanyInput {
  name?: string;
  url?: string;
}

export interface InvestmentMemo {
  companyName: string;
  generatedAt: string;
  
  // Company status detection
  companyStatus: "ACTIVE" | "ACQUIRED" | "IPO" | "DEFUNCT" | "UNKNOWN";
  statusContext: string;
  
  // Core sections
  executiveSummary: string;
  timeline: string;
  marketAnalysis: string;
  productAndTechnology: string;
  teamBackground: string;
  tractionAndMetrics: string;
  keyRisks: string;
  
  // Analysis sections
  competitiveComparison: string;
  comparableTransactions: string;
  dataGapsAndOpenQuestions: string;
  investmentLearnings: string;
  investmentRecommendation: string;
  sources?: string[];
}

export interface ResearchResult {
  rawContent: string;
  sources: string[];
}

// NEW: Sentiment analysis types
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

export interface ShortMemo {
  companyName: string;
  generatedAt: string;
  headerSnapshot: string;
  productAndTechnology: string;
  teamBackground: string;
  competitiveLandscape: string;
  recentDevelopments: string;
  analystTake: string;
  sources: string[];
}
