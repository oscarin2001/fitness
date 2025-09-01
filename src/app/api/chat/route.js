import { google } from '@ai-sdk/google';
import { streamText, convertToModelMessages } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req) {
  const { messages } = await req.json();

  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const result = streamText({
    model: google(modelName),
    messages: convertToModelMessages(messages),
  });

  // Respond with a UI message stream compatible with @ai-sdk/react useChat UI flow
  return result.toUIMessageStreamResponse();
}
