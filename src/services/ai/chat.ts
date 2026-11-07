export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * The conversation as a plain-text transcript for the prompt, newest turns kept.
 * The server is stateless: the browser sends the conversation each time, so the
 * oldest turns are dropped to keep every request small and its cost predictable.
 * The last user message is always kept (cut to `maxChars` if it's longer).
 */
export function chatTranscript(messages: ChatMessage[], maxTurns = 12, maxChars = 12_000): string {
  const recent = messages.slice(-maxTurns);
  const lines: string[] = [];
  let size = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const { role, content } = recent[i];
    const text = `${role === "user" ? "USER" : "COACH"}: ${content.trim()}`;
    if (lines.length && size + text.length > maxChars) break;
    lines.unshift(text.slice(0, maxChars));
    size += text.length;
  }
  return lines.join("\n\n");
}
