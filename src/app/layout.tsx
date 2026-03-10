import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Positionierungs-Check",
  description:
    "Finde deine Positionierung als Freelancer – 7 Fragen, dein individueller Entwurf für eine Angebotsleiter.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pixelId = process.env.NEXT_PUBLIC_FB_PIXEL_ID;

  return (
    <html lang="de">
      <head>
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Playfair+Display:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}

        {/* Hyros Universal Tag */}
        <Script id="hyros-tag" strategy="afterInteractive">{`
          var head = document.head;
          var script = document.createElement('script');
          script.type = 'text/javascript';
          script.src = "https://t.finally-freelancing.de/v1/lst/universal-script?ph=855844b2eafadce9ec7731fb532e6d773b641d683518f04e3b754a0b1445efda&tag=!clicked&ref_url=" + encodeURI(document.URL);
          head.appendChild(script);
        `}</Script>

        {/* Facebook Meta Pixel – only injected when NEXT_PUBLIC_FB_PIXEL_ID is set */}
        {pixelId && (
          <Script id="fb-pixel" strategy="afterInteractive">{`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window,document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${pixelId}');
            var _pvId = 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2);
            fbq('track', 'PageView', {}, { eventID: _pvId });
            fetch('/api/track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ eventName: 'PageView', eventId: _pvId })
            });
          `}</Script>
        )}
      </body>
    </html>
  );
}
