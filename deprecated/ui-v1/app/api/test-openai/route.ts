import OpenAI from 'openai';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  console.log('🧪 Testing OpenAI connection...');
  
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ 
        success: false, 
        error: 'OPENAI_API_KEY environment variable not set' 
      }, { status: 500 });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "Hello from OpenAI!" in exactly 3 words.' }
      ],
      max_tokens: 10,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content?.trim() || "No response";

    console.log('🧪 OpenAI test successful:', response);

    return NextResponse.json({ 
      success: true, 
      message: 'OpenAI connection successful',
      response,
      model: completion.model,
      usage: completion.usage
    });

  } catch (error: any) {
    console.error('🧪 OpenAI test failed:', error);
    
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      type: error.constructor.name
    }, { status: 500 });
  }
}
