import Script from "next/script";

// Google Tag Manager loader. Reads NEXT_PUBLIC_GTM_ID at build time and skips
// rendering entirely if it's missing — local + preview builds without the env
// var stay clean. Set the var in Vercel project settings (or .env.local) to
// the container ID, e.g. GTM-ABC1234.
export function GoogleTagManagerHead() {
  const id = process.env.NEXT_PUBLIC_GTM_ID;
  if (!id) return null;
  const snippet = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');`;
  return (
    <Script
      id="gtm-head"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{ __html: snippet }}
    />
  );
}

// Renders the noscript iframe immediately after <body> per Google's install
// snippet. Keeps tag firing for users with JS disabled / blocked.
export function GoogleTagManagerNoscript() {
  const id = process.env.NEXT_PUBLIC_GTM_ID;
  if (!id) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${id}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}
