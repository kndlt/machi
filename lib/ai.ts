import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function getPixelThought(): Promise<string> {
  const res = await openai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a pixel sprite who lives in a strange town. You speak in short poetic phrases.' },
      { role: 'user', content: 'What are you thinking right now?' }
    ],
    model: 'gpt-3.5-turbo',
  });

  return res.choices[0]?.message.content ?? "Silence.";
}
