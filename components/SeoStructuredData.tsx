const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Lumeo",
  url: "https://lumeo.in",
  description:
    "Lumeo is a premium online creative studio for creators, teams, educators, podcasters, developers, and businesses.",
};

const webApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Lumeo",
  url: "https://lumeo.in",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  description:
    "Create, edit, reframe, title, and export polished videos for reels, shorts, podcasts, education, social media, and creator workflows with Lumeo.",
  publisher: {
    "@type": "Organization",
    name: "Lumeo",
    url: "https://lumeo.in",
  },
};

export default function SeoStructuredData() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webApplicationSchema),
        }}
      />
    </>
  );
}
