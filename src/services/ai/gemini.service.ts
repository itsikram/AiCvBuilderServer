import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config/index.js";
import { PROMPTS } from "./prompts.js";
import { ApiError } from "../../utils/ApiError.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const parseJsonResponse = <T>(text: string): T => {
  const cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new ApiError(502, "AI returned invalid response format");
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class GeminiService {
  private client: GoogleGenerativeAI | null = null;

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      if (!config.gemini.apiKey) {
        throw new ApiError(503, "AI service is not configured");
      }
      this.client = new GoogleGenerativeAI(config.gemini.apiKey);
    }
    return this.client;
  }

  private async generateWithRetry(prompt: string): Promise<string> {
    const model = this.getClient().getGenerativeModel({ model: config.gemini.model });
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        if (!text) throw new Error("Empty AI response");
        return text;
      } catch (error) {
        lastError = error as Error;
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
        }
      }
    }

    throw new ApiError(502, `AI generation failed: ${lastError?.message || "Unknown error"}`);
  }

  async generateResume(input: {
    name: string;
    jobTitle: string;
    skills: string;
    experience: string;
    education: string;
    projects: string;
    language: "en" | "bn";
  }) {
    const text = await this.generateWithRetry(PROMPTS.generateResume(input));
    return parseJsonResponse<{
      summary: string;
      experienceBullets: { company: string; position: string; bullets: string[] }[];
      skills: string[];
      suggestedKeywords: string[];
      careerTips: string[];
    }>(text);
  }

  async improveResume(resume: string, jobDescription: string, language: "en" | "bn") {
    const text = await this.generateWithRetry(
      PROMPTS.improveResume(resume, jobDescription, language)
    );
    return parseJsonResponse<{
      atsScore: number;
      matchedKeywords: string[];
      missingKeywords: string[];
      improvedBullets: { original: string; improved: string }[];
      suggestions: string[];
      optimizedSummary: string;
    }>(text);
  }

  async generateCoverLetter(input: {
    name: string;
    jobTitle: string;
    companyName: string;
    resumeSummary: string;
    jobDescription: string;
    language: "en" | "bn";
  }) {
    const text = await this.generateWithRetry(PROMPTS.generateCoverLetter(input));
    return parseJsonResponse<{
      subject: string;
      greeting: string;
      body: string;
      closing: string;
      fullLetter: string;
    }>(text);
  }

  async checkATS(resumeContent: string, jobDescription?: string) {
    const text = await this.generateWithRetry(PROMPTS.atsCheck(resumeContent, jobDescription));
    return parseJsonResponse<{
      score: number;
      grade: string;
      strengths: string[];
      weaknesses: string[];
      keywordAnalysis: { found: string[]; missing: string[] };
      recommendations: string[];
    }>(text);
  }

  async suggestSkills(jobTitle: string, currentSkills: string[]) {
    const text = await this.generateWithRetry(PROMPTS.skillSuggestions(jobTitle, currentSkills));
    return parseJsonResponse<{ skills: string[]; reasoning: string }>(text);
  }

  async getCareerRecommendations(profile: string) {
    const text = await this.generateWithRetry(PROMPTS.careerRecommendations(profile));
    return parseJsonResponse<{
      recommendations: { title: string; description: string; priority: string }[];
      targetRoles: string[];
      skillGaps: string[];
    }>(text);
  }
}

export const geminiService = new GeminiService();
