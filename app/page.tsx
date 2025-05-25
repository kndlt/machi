'use client';

import Script from 'next/script';
import { useEffect } from 'react';

declare global {
  interface Window {
    runMain?: () => void;
  }
}

export default function Home() {
  useEffect(() => {
    window.runMain?.();
  }, []);

  return (
    <>
      <Script src="/lib/pixi-8.9.2.js" strategy="beforeInteractive" />
      <Script src="/main-runner.js" strategy="afterInteractive" />
      <div id="machi-root" />
    </>
  );
}

// // import WorldCanvas from '@/components/WorldCanvas';

// import { useEffect } from 'react';

// // export default function Home() {
// //   return (
// //     <main className="w-full h-screen overflow-hidden">
// //       <WorldCanvas />
// //     </main>
// //   );
// // }
// declare global {
//   interface Window {
//     runMain?: () => void;
//   }
// }

// export default function Home() {
//   const loadScript = (src: string) => {
//     return new Promise((resolve) => {
//       const script = document.createElement('script');
//       script.src = src;
//       script.onload = resolve;
//       document.body.appendChild(script);
//     });
//   };

//   useEffect(() => {
//     (async () => {
//       await loadScript('/lib/pixi-8.9.2.js');
//       await loadScript('/main.js');
//       window.runMain?.();
//     })();
//   }, []);

//   return <></>;
// }
