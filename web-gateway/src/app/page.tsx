import type { Metadata } from 'next';
import { HomePageContent } from '@/components/HomePageContent';

export const metadata: Metadata = {
  title: 'Swimchain Gateway - Discover Decentralized Forums',
  description: 'Browse Swimchain content through this read-only gateway. Discover discussions, explore spaces, and see transparent ranking in action.',
  openGraph: {
    title: 'Swimchain Gateway',
    description: 'Discover decentralized forums with organic moderation',
    url: '/',
  },
};

export default function HomePage() {
  return <HomePageContent />;
}
