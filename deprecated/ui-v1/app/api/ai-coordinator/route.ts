import OpenAI from 'openai';
import { NextRequest } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Global AI coordinator that manages all promiser behaviors
export async function GET(request: NextRequest) {
  console.log('🤖 AI Coordinator: New connection');
  
  const { searchParams } = new URL(request.url);
  const promiserCount = parseInt(searchParams.get('count') || '20');
  
  // Create a TransformStream for better error handling
  const stream = new ReadableStream({
    start(controller) {
      console.log('🤖 AI Coordinator: Stream started');
      
      const sendEvent = (data: any) => {
        try {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(new TextEncoder().encode(message));
        } catch (error) {
          console.error('🤖 Error encoding message:', error);
        }
      };
      
      // Send initial connection event
      sendEvent({
        type: 'connected',
        message: `AI coordinator connected for ${promiserCount} promisers`,
        timestamp: Date.now()
      });
      
      let isActive = true;
      
      // Continuous generation loop
      const generateBehavior = async () => {
        if (!isActive) return;
        
        try {
          console.log('🤖 Generating new behavior...');
          
          // Randomly choose which promiser should act
          const targetPromiserId = Math.floor(Math.random() * promiserCount);
          const isPixel = targetPromiserId === 0;
          
          // Choose behavior type
          const behaviors = ['think', 'speak', 'whisper', 'run'];
          const behavior = behaviors[Math.floor(Math.random() * behaviors.length)];
          
          let systemPrompt = '';
          let userPrompt = '';
          
          if (isPixel) {
            systemPrompt = 'You are Pixel, a thoughtful sprite living in a mystical town. You think in short, poetic phrases about life, creativity, and connections.';
          } else {
            const personalities = [
              'You are a wandering sprite who loves exploration and discovery.',
              'You are a dreamy sprite who lives in imagination and whimsy.',
              'You are a practical sprite who loves building and creating.',
              'You are a gentle sprite who cherishes quiet moments and peace.',
              'You are an energetic sprite who finds joy in movement and play.'
            ];
            systemPrompt = personalities[Math.floor(Math.random() * personalities.length)];
          }
          
          switch (behavior) {
            case 'think':
              userPrompt = 'Think one word or phrase (1-3 words max)';
              break;
            case 'speak':
              userPrompt = 'Say something brief (1-5 words max)';
              break;
            case 'whisper':
              userPrompt = 'Whisper briefly (1-3 words max)';
              break;
            case 'run':
              userPrompt = 'Express energy in 1-2 words';
              break;
          }
          
          const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 20,
            temperature: 0.9,
          });
          
          const thought = completion.choices[0]?.message?.content?.trim() || "...";
          
          // For whisper behavior, choose a random target
          let targetId = 0;
          if (behavior === 'whisper' && promiserCount > 1) {
            targetId = Math.floor(Math.random() * promiserCount);
            if (targetId === targetPromiserId) {
              targetId = (targetId + 1) % promiserCount;
            }
          }
          
          console.log(`🤖 Generated: Promiser ${targetPromiserId} will ${behavior}: "${thought}"`);
          
          sendEvent({
            type: 'promiser_action',
            promiserId: targetPromiserId,
            behavior,
            thought,
            targetId,
            timestamp: Date.now()
          });
          
          // Random interval between actions (5-15 seconds)
          const nextDelay = 5000 + Math.random() * 10000;
          setTimeout(generateBehavior, nextDelay);
          
        } catch (error) {
          console.error('🤖 Error generating promiser behavior:', error);
          sendEvent({
            type: 'error',
            message: `Failed to generate behavior: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: Date.now()
          });
          // Try again after a longer delay
          setTimeout(generateBehavior, 15000);
        }
      };
      
      // Start generation after a short delay
      setTimeout(generateBehavior, 2000);
      
      // Keep connection alive with periodic pings
      const keepAlive = setInterval(() => {
        if (isActive) {
          sendEvent({
            type: 'ping',
            timestamp: Date.now()
          });
        }
      }, 30000);
      
      // Cleanup on disconnect
      const cleanup = () => {
        console.log('🤖 AI Coordinator: Cleaning up connection');
        isActive = false;
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch (e) {
          // Controller might already be closed
        }
      };
      
      // Handle client disconnect
      request.signal.addEventListener('abort', cleanup);
      
      // Cleanup after 30 minutes to prevent memory leaks
      setTimeout(cleanup, 30 * 60 * 1000);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}
