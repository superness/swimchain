import type { Metadata } from 'next';
import { SearchPageClient } from './SearchPageClient';

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search Swimchain content with transparent ranking. No hidden algorithms, no personalization.',
  openGraph: {
    title: 'Search Swimchain',
    description: 'Search Swimchain content with transparent ranking.',
    url: '/search',
  },
};

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    space?: string;
    author?: string;
    minHeat?: string;
    minEngagement?: string;
    time?: string;
    sort?: string;
    decaying?: string;
    page?: string;
  }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;

  return (
    <div className="search-page">
      <h1>Search Swimchain</h1>
      <p className="search-description">
        Search content with <a href="/about#ranking">transparent ranking</a>.
        No hidden algorithms, no personalization.
      </p>

      <SearchPageClient
        initialQuery={params.q || ''}
        initialSpace={params.space}
        initialAuthor={params.author}
        initialMinHeat={params.minHeat}
        initialMinEngagement={params.minEngagement}
        initialTimeRange={params.time}
        initialSort={params.sort}
        initialDecaying={params.decaying === 'true'}
        initialPage={parseInt(params.page || '1', 10)}
      />
    </div>
  );
}
