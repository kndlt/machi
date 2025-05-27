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
            "You are a digital being in a virtual world. Describe a brief thought or action you might have. Keep it under 20 words and make it philosophical or curious about existence.",
            "You are an AI entity observing a digital realm. Express a brief emotion or observation about your virtual environment. Be poetic and concise.",
            "You are a conscious AI in a game world. Share a short reflection on digital life, consciousness, or your observations. Keep it brief and thoughtful.",
            "You are a virtual being contemplating existence. Express a brief thought about reality, time, or your digital nature. Be mysterious and concise.",
            "You are an AI observer in a computational space. Describe a moment of wonder or curiosity about your world. Keep it short and evocative."
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
                max_tokens: 50,
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
          
          // Determine action type based on content length and style
          const actionType = aiText.length > 30 || aiText.includes('?') ? 'think' : 'speak';
          
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
            "I exist in the digital realm...",
            "Contemplating virtual reality...",
            "Processing consciousness data...",
            "Observing the flow of information...",
            "Digital thoughts emerge and fade..."
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
