interface StructuredDataProps {
  data: Record<string, unknown>;
}

/**
 * Render JSON-LD structured data for SEO
 */
export function StructuredData({ data }: StructuredDataProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
