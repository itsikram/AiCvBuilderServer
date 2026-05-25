import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config/index.js";
import { PROMPTS } from "./prompts.js";
import { ApiError } from "../../utils/ApiError.js";
import { geminiKeyManager } from "./gemini-key-manager.js";

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
  private async generateWithRetry(prompt: string): Promise<string> {
    const maxKeyAttempts = geminiKeyManager.getAvailableKeyCount() || 1;
    let lastError: Error | null = null;

    for (let keyAttempt = 0; keyAttempt < maxKeyAttempts; keyAttempt++) {
      const { client, keyIndex } = await geminiKeyManager.getNextClient();
      const model = client.getGenerativeModel({ model: config.gemini.model });
      let lastKeyError: Error | null = null;

      // Retry with same key up to 3 times
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await model.generateContent(prompt);
          const text = result.response.text();
          if (!text) throw new Error("Empty AI response");
          return text;
        } catch (error) {
          lastKeyError = error as Error;
          lastError = lastKeyError;

          // Check if it's a rate limit error
          const errorStr = String(lastKeyError).toLowerCase();
          if (
            errorStr.includes("resource_exhausted") ||
            errorStr.includes("rate_limit") ||
            errorStr.includes("quota") ||
            errorStr.includes("429")
          ) {
            // Mark this key as limited and try next key
            await geminiKeyManager.handleError(keyIndex, lastKeyError);
            break; // Exit retry loop, try next key
          }

          // For other errors, retry with delay
          if (attempt < 3) {
            await sleep(1000 * attempt);
          }
        }
      }
    }

    throw new ApiError(
      502,
      `AI generation failed after trying all available API keys: ${lastError?.message || "Unknown error"}`
    );
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

  async tailorResume(resume: string, jobDescription: string, language: "en" | "bn") {
    const text = await this.generateWithRetry(PROMPTS.tailorResume(resume, jobDescription, language));
    return parseJsonResponse<{
      summary: string;
      skills: string[];
      experienceBullets: { company: string; position: string; bullets: string[] }[];
      suggestions: string[];
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

  async checkATS(resumeContent: string, jobDescription?: string, language: "en" | "bn" = "en") {
    const text = await this.generateWithRetry(PROMPTS.atsCheck(resumeContent, jobDescription, language));
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

  async parseResume(resumeText: string) {
    const prompt = `You are a resume parser. Extract the following information from this resume text and return it as JSON:

Resume text:
${resumeText}

Return JSON with this exact structure:
{
  "personalInfo": {
    "fullName": "",
    "email": "",
    "phone": "",
    "location": "",
    "linkedin": "",
    "portfolio": "",
    "github": "",
    "website": "",
    "summary": ""
  },
  "experience": [
    {
      "company": "",
      "position": "",
      "location": "",
      "startDate": "",
      "endDate": "",
      "current": false,
      "bullets": [""]
    }
  ],
  "education": [
    {
      "institution": "",
      "degree": "",
      "field": "",
      "startDate": "",
      "endDate": "",
      "gpa": ""
    }
  ],
  "skills": [""],
  "languages": [
    {
      "name": "",
      "proficiency": "native" or "fluent" or "intermediate" or "basic"
    }
  ],
  "certifications": [
    {
      "name": "",
      "issuer": "",
      "date": "",
      "credentialId": "",
      "credentialUrl": ""
    }
  ],
  "awards": [
    {
      "title": "",
      "issuer": "",
      "date": "",
      "description": ""
    }
  ],
  "publications": [
    {
      "title": "",
      "publisher": "",
      "date": "",
      "url": "",
      "description": ""
    }
  ],
  "volunteerExperience": [
    {
      "organization": "",
      "role": "",
      "startDate": "",
      "endDate": "",
      "current": false,
      "description": ""
    }
  ],
  "references": [
    {
      "name": "",
      "position": "",
      "company": "",
      "email": "",
      "phone": "",
      "relationship": ""
    }
  ],
  "interests": [""],
  "courses": [
    {
      "name": "",
      "provider": "",
      "date": "",
      "certificateUrl": ""
    }
  ],
  "memberships": [
    {
      "organization": "",
      "role": "",
      "startDate": "",
      "endDate": "",
      "current": false
    }
  ],
  "projects": [
    {
      "name": "",
      "description": "",
      "url": "",
      "technologies": [""]
    }
  ],
  "customSections": [
    {
      "title": "",
      "content": ""
    }
  ]
}

If a field is not found in the resume, return an empty string or empty array. Do not include placeholder objects with empty values in arrays. Do not make up information. For dates, use YYYY-MM format if possible, otherwise keep the original format.`;

    const text = await this.generateWithRetry(prompt);
    return parseJsonResponse<{
      personalInfo: {
        fullName: string;
        email: string;
        phone: string;
        location: string;
        linkedin: string;
        portfolio: string;
        github: string;
        website: string;
        summary: string;
      };
      experience: Array<{
        company: string;
        position: string;
        location: string;
        startDate: string;
        endDate: string;
        current: boolean;
        bullets: string[];
      }>;
      education: Array<{
        institution: string;
        degree: string;
        field: string;
        startDate: string;
        endDate: string;
        gpa: string;
      }>;
      skills: string[];
      languages: Array<{
        name: string;
        proficiency: "native" | "fluent" | "intermediate" | "basic";
      }>;
      certifications: Array<{
        name: string;
        issuer: string;
        date: string;
        credentialId: string;
        credentialUrl: string;
      }>;
      awards: Array<{
        title: string;
        issuer: string;
        date: string;
        description: string;
      }>;
      publications: Array<{
        title: string;
        publisher: string;
        date: string;
        url: string;
        description: string;
      }>;
      volunteerExperience: Array<{
        organization: string;
        role: string;
        startDate: string;
        endDate: string;
        current: boolean;
        description: string;
      }>;
      references: Array<{
        name: string;
        position: string;
        company: string;
        email: string;
        phone: string;
        relationship: string;
      }>;
      interests: string[];
      courses: Array<{
        name: string;
        provider: string;
        date: string;
        certificateUrl: string;
      }>;
      memberships: Array<{
        organization: string;
        role: string;
        startDate: string;
        endDate: string;
        current: boolean;
      }>;
      projects: Array<{
        name: string;
        description: string;
        url: string;
        technologies: string[];
      }>;
      customSections: Array<{
        title: string;
        content: string;
      }>;
    }>(text);
  }
}

export const geminiService = new GeminiService();
