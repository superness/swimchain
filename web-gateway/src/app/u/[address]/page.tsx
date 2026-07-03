import { withBase } from '@/lib/base-path';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { IdentityCard } from '@/components/IdentityCard';
import { SearchResultCard } from '@/components/SearchResultCard';
import { NodeOfflineNotice } from '@/components/NodeOfflineNotice';
import { isValidAddress, formatAddress } from '@/lib/address';
import { fetchIdentityWithPosts } from '@/lib/node-service';

interface PageProps {
  params: Promise<{ address: string }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Deduplicate the fetch between generateMetadata and the page render
const getIdentity = cache(async (address: string) =>
  fetchIdentityWithPosts(address)
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { address } = await params;
  const shortAddress = formatAddress(decodeURIComponent(address), 'short');

  return {
    title: shortAddress,
    description: `View posts and reputation for ${shortAddress} on Swimchain`,
    openGraph: {
      title: `${shortAddress} | Swimchain`,
      description: `View posts and reputation for ${shortAddress}`,
      url: `/u/${address}`,
    },
  };
}

export default async function IdentityPage({ params }: PageProps) {
  const { address } = await params;
  const decodedAddress = decodeURIComponent(address);

  // Validate address format
  if (!isValidAddress(decodedAddress)) {
    notFound();
  }

  const result = await getIdentity(decodedAddress);

  if (result === null) {
    return (
      <div className="identity-page">
        <header className="page-header">
          <h1>Identity Profile</h1>
        </header>
        <NodeOfflineNotice context="this identity" />
      </div>
    );
  }

  const { identity, posts } = result;

  // Sort by recency
  const sortedPosts = [...posts].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="identity-page">
      <header className="page-header">
        <h1>Identity Profile</h1>
      </header>

      <IdentityCard identity={identity} showFullAddress />

      <section className="posts-section">
        <h2>Recent Posts</h2>
        <p className="section-description">
          Posts by this identity, sorted by recency.
        </p>

        <div className="posts-list">
          {sortedPosts.map(post => (
            <SearchResultCard key={post.contentId} result={post} />
          ))}
        </div>

        {sortedPosts.length === 0 && (
          <div className="no-posts">
            <p>No active posts from this identity.</p>
            <p className="text-muted">
              All content may have decayed or the identity has not posted yet.
            </p>
          </div>
        )}
      </section>

      <div className="info-section">
        <h3>About Identity Addresses</h3>
        <p>
          Swimchain uses cryptographic identities. The address above is a
          Bech32m-encoded Ed25519 public key. It uniquely identifies this user
          without revealing any personal information.
        </p>
        <p>
          <a href={withBase('/about#identity')}>Learn more about Swimchain identities</a>
        </p>
      </div>
    </div>
  );
}
