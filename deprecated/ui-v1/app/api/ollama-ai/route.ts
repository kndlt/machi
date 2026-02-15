export async function GET() {
  console.log('Starting Ollama AI coordinator');
  
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      let isActive = true;
      
      const sendEvent = (data: any) => {
        if (!isActive) return;
        
        try {
          const event = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(event));
        } catch (error) {
          console.log('Controller closed, stopping event generation');
          isActive = false;
        }
      };
      
      const generateAIBehavior = async () => {
        try {
          // Get a random promiser ID (0-19)
          const promiserId = Math.floor(Math.random() * 20);
          
          // Create AI prompts based on the context of Machi game
          const prompts = [
            "Think one word about existence.",
            "Express a feeling in 2-3 words.",
            "Share a brief thought in 1-5 words.",
            "What do you wonder about? One word.",
            "Describe your current mood in 1-2 words.",
            "One word about consciousness.",
            "A simple observation, very short.",
            "How do you feel right now? One word."
          ];
          
          const selectedPrompt = prompts[Math.floor(Math.random() * prompts.length)];
          
          console.log(`Generating behavior for promiser ${promiserId} with Ollama`);
          
          // Call Ollama API
          const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'llama3.2:3b',
              prompt: selectedPrompt,
              stream: false,
              options: {
                temperature: 0.8,
                max_tokens: 15,
                top_p: 0.9
              }
            }),
          });
          
          if (!response.ok) {
            throw new Error(`Ollama API error: ${response.statusText}`);
          }
          
          const result = await response.json();
          const aiText = result.response?.trim() || "I contemplate my digital existence...";
          
          console.log(`Generated AI text for promiser ${promiserId}: ${aiText}`);
          
          // Determine action type - make it more balanced
          const actionTypes = ['think', 'speak', 'whisper'];
          const weights = [0.4, 0.4, 0.2]; // 40% think, 40% speak, 20% whisper
          
          let randomValue = Math.random();
          let actionType = 'think';
          
          if (randomValue < weights[0]) {
            actionType = 'think';
          } else if (randomValue < weights[0] + weights[1]) {
            actionType = 'speak';
          } else {
            actionType = 'whisper';
          }
          
          // Send the behavior event
          sendEvent({
            type: 'ai_behavior',
            promiser_id: promiserId,
            action: actionType,
            content: aiText,
            timestamp: new Date().toISOString()
          });
          
        } catch (error) {
          console.error('Error generating AI behavior:', error);
          
          // Send a fallback behavior
          const promiserId = Math.floor(Math.random() * 20);
          const fallbackMessages = [
            "Existing...",
            "Wondering...",
            "Thinking...",
            "Observing...",
            "Feeling...",
            "Curious...",
            "Dreaming..."
          ];
          
          sendEvent({
            type: 'ai_behavior',
            promiser_id: promiserId,
            action: 'think',
            content: fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)],
            timestamp: new Date().toISOString()
          });
        }
      };
      
      // Generate initial behavior immediately
      generateAIBehavior();
      
      // Continue generating behaviors every 8-15 seconds
      const interval = setInterval(() => {
        if (isActive) {
          generateAIBehavior();
        } else {
          clearInterval(interval);
        }
      }, Math.random() * 7000 + 8000); // 8-15 seconds
      
      // Cleanup on disconnect
      const cleanup = () => {
        isActive = false;
        clearInterval(interval);
        controller.close();
      };
      
      // Handle client disconnect
      setTimeout(() => {
        if (isActive) {
          cleanup();
        }
      }, 300000); // 5 minutes timeout
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
