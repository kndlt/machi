import { NextRequest } from 'next/server';

// Simple test AI coordinator without OpenAI dependency
export async function GET(request: NextRequest) {
  console.log('🤖 Test AI Coordinator: New connection');
  
  const { searchParams } = new URL(request.url);
  const promiserCount = parseInt(searchParams.get('count') || '20');
  
  const stream = new ReadableStream({
    start(controller) {
      console.log('🤖 Test AI Coordinator: Stream started');
      
      const sendEvent = (data: any) => {
        try {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(new TextEncoder().encode(message));
          console.log('🤖 Sent event:', data.type);
        } catch (error) {
          console.error('🤖 Error encoding message:', error);
        }
      };
      
      // Send initial connection event
      sendEvent({
        type: 'connected',
        message: `Test AI coordinator connected for ${promiserCount} promisers`,
        timestamp: Date.now()
      });
      
      let isActive = true;
      let eventCount = 0;
      
      // Simple behavior generation without OpenAI
      const generateBehavior = () => {
        if (!isActive) return;
        
        try {
          eventCount++;
          console.log(`🤖 Generating test behavior #${eventCount}...`);
          
          // Randomly choose which promiser should act
          const targetPromiserId = Math.floor(Math.random() * promiserCount);
          
          // Choose behavior type
          const behaviors = ['think', 'speak', 'whisper', 'run'] as const;
          type BehaviorType = typeof behaviors[number];
          const behavior: BehaviorType = behaviors[Math.floor(Math.random() * behaviors.length)];
          
          // Simple test thoughts
          const thoughts: Record<BehaviorType, string[]> = {
            think: ['Pondering...', 'Hmm...', 'Wonder...', 'Maybe...'],
            speak: ['Hello!', 'Nice day!', 'Magic!', 'Beautiful!'],
            whisper: ['Secret!', 'Listen...', 'Psst...', 'Shh...'],
            run: ['Go!', 'Fast!', 'Move!', 'Run!']
          };
          
          const thoughtOptions = thoughts[behavior];
          const thought = thoughtOptions[Math.floor(Math.random() * thoughtOptions.length)];
          
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
          
          // Schedule next behavior (5-10 seconds)
          const nextDelay = 5000 + Math.random() * 5000;
          setTimeout(generateBehavior, nextDelay);
          
        } catch (error) {
          console.error('🤖 Error generating test behavior:', error);
          sendEvent({
            type: 'error',
            message: `Failed to generate test behavior: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: Date.now()
          });
          // Try again after delay
          setTimeout(generateBehavior, 10000);
        }
      };
      
      // Start generation after a short delay
      setTimeout(generateBehavior, 3000);
      
      // Keep connection alive with periodic pings
      const keepAlive = setInterval(() => {
        if (isActive) {
          sendEvent({
            type: 'ping',
            timestamp: Date.now()
          });
        }
      }, 30000);
      
      // Cleanup function
      const cleanup = () => {
        console.log('🤖 Test AI Coordinator: Cleaning up connection');
        isActive = false;
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch (e) {
          // Controller might already be closed
          console.log('🤖 Controller already closed');
        }
      };
      
      // Handle client disconnect
      request.signal.addEventListener('abort', cleanup);
      
      // Auto-cleanup after 30 minutes
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
