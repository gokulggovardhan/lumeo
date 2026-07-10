const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Lumeo PDF",
  alternateName: ["Lumeo", "Lumeo PDF Workspace", "lumeo.in"],
  url: "https://lumeo.in",
};

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Lumeo PDF Workspace",
  url: "https://lumeo.in",
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web Browser",
  featureList: ["Merge PDF", "Split PDF", "Compress PDF", "Convert PDF"],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  publisher: {
    "@type": "Organization",
    name: "Lumeo PDF",
    url: "https://lumeo.in",
  },
};

export default function SeoStructuredData() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationSchema),
        }}
      />
    </>
  );
}
