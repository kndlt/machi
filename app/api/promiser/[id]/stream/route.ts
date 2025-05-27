import OpenAI from 'openai';
import { NextRequest } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const PROMISER_PERSONALITIES = {
  pixel: {
    system: "You are Pixel, a thoughtful sprite who lives in a mystical town. You think in short, poetic phrases about life, creativity, and the connections between things. You often contemplate the meaning behind small moments.",
    behaviors: ['think', 'speak', 'whisper']
  },
  wanderer: {
    system: "You are a wandering sprite who loves exploration and discovery. You speak about journeys, hidden paths, and the excitement of finding new places.",
    behaviors: ['think', 'speak', 'run']
  },
  dreamer: {
    system: "You are a dreamy sprite who lives in imagination. You share whimsical thoughts, creative ideas, and fantastical observations about the world.",
    behaviors: ['think', 'speak', 'whisper']
  },
  builder: {
    system: "You are a practical sprite who loves creating and building. You think about construction, improvement, and making things better.",
    behaviors: ['think', 'speak', 'run']
  }
};

function getRandomPersonality() {
  const types = Object.keys(PROMISER_PERSONALITIES);
  return types[Math.floor(Math.random() * types.length)] as keyof typeof PROMISER_PERSONALITIES;
}

function getRandomBehavior(personality: keyof typeof PROMISER_PERSONALITIES) {
  const behaviors = PROMISER_PERSONALITIES[personality].behaviors;
  return behaviors[Math.floor(Math.random() * behaviors.length)];
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const promiserId = params.id;
  const isPixel = promiserId === '0';
  
  // Create a readable stream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Determine personality
        const personality = isPixel ? 'pixel' : getRandomPersonality();
        const systemPrompt = PROMISER_PERSONALITIES[personality].system;
        
        // Generate initial behavior
        const behavior = getRandomBehavior(personality);
        
        let prompt = '';
        switch (behavior) {
          case 'think':
            prompt = 'Share a brief contemplative thought (10-20 words max)';
            break;
          case 'speak':
            prompt = 'Say something meaningful to nearby promisers (15-30 words max)';
            break;
          case 'whisper':
            prompt = 'Whisper a secret or insight to another promiser (10-25 words max)';
            break;
          case 'run':
            prompt = 'Express why you suddenly feel like running or moving quickly (5-15 words max)';
            break;
        }
        
        // Get AI response
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          max_tokens: 50,
          temperature: 0.8,
        });
        
        const thought = completion.choices[0]?.message?.content?.trim() || "...";
        
        // Send the response
        const data = {
          promiserId: parseInt(promiserId),
          behavior,
          thought,
          personality,
          timestamp: Date.now()
        };
        
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
        
        // Random delay before next generation (5-15 seconds)
        const delay = 5000 + Math.random() * 10000;
        
        setTimeout(() => {
          controller.close();
        }, delay);
        
      } catch (error) {
        console.error('Error in promiser stream:', error);
        controller.error(error);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
