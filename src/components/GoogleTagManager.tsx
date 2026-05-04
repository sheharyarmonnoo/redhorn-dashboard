import Script from "next/script";

// Container ID is public (GTM emits it in plain HTML to every visitor) so we
// hard-code the production value as the fallback. Override per-environment via
// NEXT_PUBLIC_GTM_ID in Vercel env vars; set it to an empty string to disable.
const DEFAULT_GTM_ID = "GTM-PRMK756P";

export function GoogleTagManagerHead() {
  const raw = process.env.NEXT_PUBLIC_GTM_ID;
  const id = raw === undefined ? DEFAULT_GTM_ID : raw;
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
  const raw = process.env.NEXT_PUBLIC_GTM_ID;
  const id = raw === undefined ? DEFAULT_GTM_ID : raw;
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
