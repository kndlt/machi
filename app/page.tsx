import Script from 'next/script';

export default function Home() {
  return (
    <main className="w-full h-screen overflow-hidden">
      <div id="gameContainer" className="w-full h-full">
        <div className="loading flex items-center justify-center h-full text-white">
          Loading game...
        </div>
      </div>
      
      <Script 
        src="/lib/pixi-8.9.2.js" 
        strategy="beforeInteractive"
        // onLoad={() => console.log('PixiJS loaded')}
      />
      <Script 
        src="/machi.js" 
        strategy="afterInteractive"
        // onLoad={() => console.log('Machi.js loaded')}
      />
    </main>
  );
}
