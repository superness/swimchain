/**
 * Wiki-specific type definitions
 * Maps Swimchain content model to wiki concepts:
 *   Space = Wiki Namespace
 *   Post = Wiki Page
 *   Edit = Page Revision
 *   Reply = Discussion comment
 */

export interface WikiPage {
  id: string;
  namespaceId: string;
  title: string;
  content: string;
  author: string;
  authorAddress: string;
  createdAt: number;
  lastEdited: number;
  revisionCount: number;
  discussionCount: number;
  tags: string[];
  isDecaying: boolean;
  decayProbability: number;
}

export interface WikiNamespace {
  id: string;
  name: string;
  description: string;
  pageCount: number;
  memberCount: number;
  isPrivate: boolean;
}

export interface WikiRevision {
  id: string;
  pageId: string;
  author: string;
  authorAddress: string;
  timestamp: number;
  summary: string;
  content: string;
  diffFromPrevious?: string;
}

export interface WikiLink {
  text: string;
  target: string;
  namespace?: string;
  exists: boolean;
}

export interface WikiSearchResult {
  page: WikiPage;
  namespace: WikiNamespace;
  snippet: string;
  matchScore: number;
}

export type WikiTab = 'read' | 'edit' | 'history' | 'discuss';

export interface WikiBreadcrumb {
  label: string;
  path: string;
}

export interface TableOfContentsItem {
  id: string;
  text: string;
  level: number;
  children: TableOfContentsItem[];
}
