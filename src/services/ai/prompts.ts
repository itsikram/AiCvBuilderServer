export const PROMPTS = {
  generateResume: (input: {
    name: string;
    jobTitle: string;
    skills: string;
    experience: string;
    education: string;
    projects: string;
    language: "en" | "bn";
  }) => `You are an expert HR resume writer specializing in ATS-optimized resumes for the Bangladesh job market and international remote roles.

Create a professional resume in ${input.language === "bn" ? "Bangla (বাংলা)" : "English"} for:
- Name: ${input.name}
- Target Job Title: ${input.jobTitle}
- Skills: ${input.skills}
- Experience: ${input.experience}
- Education: ${input.education}
- Projects: ${input.projects}

Requirements:
1. Write a compelling 3-4 sentence professional summary with quantifiable achievements where possible
2. Create 3-5 achievement-focused bullet points per experience entry using action verbs (Led, Developed, Increased, Managed)
3. Include ATS-friendly keywords for the target role
4. Suggest 8-12 relevant skills (mix hard and soft skills)
5. Format for both Bangladeshi corporate and international ATS systems
6. Use metrics and numbers where appropriate (%, BDT, team size, etc.)

Respond ONLY with valid JSON in this exact structure:
{
  "summary": "string",
  "experienceBullets": [{"company": "string", "position": "string", "bullets": ["string"]}],
  "skills": ["string"],
  "suggestedKeywords": ["string"],
  "careerTips": ["string"]
}`,

  tailorResume: (resume: string, jobDescription: string, language: "en" | "bn") => `You are an ATS-focused resume strategist. Tailor the candidate's current resume for the given job description without changing the candidate's identity or hiding prior achievements.

Language: ${language === "bn" ? "Bangla" : "English"}

CURRENT RESUME:
${resume}

JOB DESCRIPTION:
${jobDescription}

Tasks:
1. Rewrite the summary to explicitly match the role and employer needs.
2. Prioritize and tailor the skills section to the job.
3. Rewrite the first 4 experience bullet lists so they highlight the most relevant achievements for this role.
4. Suggest the top 5 keywords or themes to emphasize.

Respond ONLY with valid JSON:
{
  "summary": "string",
  "skills": ["string"],
  "experienceBullets": [{"company": "string", "position": "string", "bullets": ["string"]}],
  "suggestions": ["string"]
}`,

  improveResume: (resume: string, jobDescription: string, language: "en" | "bn") => `You are an ATS optimization expert. Analyze and improve this resume for the given job description.

Language: ${language === "bn" ? "Bangla" : "English"}

RESUME:
${resume}

JOB DESCRIPTION:
${jobDescription}

Tasks:
1. Calculate ATS compatibility score (0-100) based on keyword match, formatting, and relevance
2. Identify missing keywords from the job description
3. Rewrite weak bullet points to be achievement-focused
4. Suggest 5 specific improvements

Respond ONLY with valid JSON:
{
  "atsScore": number,
  "matchedKeywords": ["string"],
  "missingKeywords": ["string"],
  "improvedBullets": [{"original": "string", "improved": "string"}],
  "suggestions": ["string"],
  "optimizedSummary": "string"
}`,

  generateCoverLetter: (input: {
    name: string;
    jobTitle: string;
    companyName: string;
    resumeSummary: string;
    jobDescription: string;
    language: "en" | "bn";
  }) => `Write a professional cover letter in ${input.language === "bn" ? "Bangla" : "English"}.

Applicant: ${input.name}
Position: ${input.jobTitle}
Company: ${input.companyName}
Background: ${input.resumeSummary}
Job Requirements: ${input.jobDescription}

Requirements:
- 3-4 paragraphs, professional tone
- Highlight relevant experience matching job requirements
- Show enthusiasm for the company and role
- Include a strong opening and call-to-action closing
- Suitable for Bangladesh job market standards

Respond ONLY with valid JSON:
{
  "subject": "string",
  "greeting": "string",
  "body": "string",
  "closing": "string",
  "fullLetter": "string"
}`,

  atsCheck: (resumeContent: string, jobDescription?: string, language: "en" | "bn" = "en") => `Analyze this resume for ATS compatibility${jobDescription ? " against this job description" : ""}.

Language: ${language === "bn" ? "Bangla" : "English"}

RESUME:
${resumeContent}
${jobDescription ? `\nJOB DESCRIPTION:\n${jobDescription}` : ""}

Evaluate: keyword density, section headers, formatting issues, bullet point quality, contact info completeness, length appropriateness.

Respond ONLY with valid JSON:
{
  "score": number,
  "grade": "A|B|C|D|F",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "keywordAnalysis": {"found": ["string"], "missing": ["string"]},
  "recommendations": ["string"]
}`,

  skillSuggestions: (jobTitle: string, currentSkills: string[]) => `Suggest 10 in-demand skills for a "${jobTitle}" role in Bangladesh's job market (2026). Current skills: ${currentSkills.join(", ")}. Include both technical and soft skills. Respond with JSON: {"skills": ["string"], "reasoning": "string"}`,

  careerRecommendations: (profile: string) => `Based on this professional profile, provide career recommendations for the Bangladesh job market. Profile: ${profile}. Respond with JSON: {"recommendations": [{"title": "string", "description": "string", "priority": "high|medium|low"}], "targetRoles": ["string"], "skillGaps": ["string"]}`,
};
