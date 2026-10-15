export const contentKinds = ['notice', 'curriculum', 'activity', 'resource', 'faq', 'page'] as const;
export type ContentKind = typeof contentKinds[number];
export type Publication = 'draft' | 'public' | 'private';
export type FileRole = 'attachment' | 'body' | 'home';
export type HomeSection = 'featured' | 'notice' | 'program' | 'resource';

export interface ProgramDetails {
  level: string;
  audience: string;
  delivery: string;
  completionRequirements: string;
}

export interface ResourceDetails {
  audience: string;
  requiredDocuments: string;
  instructions: string;
  deadlineText: string;
  submissionMethod: string;
  destination: string;
  contact: string;
  applicableYear: number | null;
}

export interface ContactDetails {
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
}

export interface ContentLinkInput {
  id?: string;
  label: string;
  url: string;
}

export interface ContentFileInput {
  fileId: string;
  role: FileRole;
  altText?: string;
}

// Complete replacement input. Missing optional lists/details become empty/null.
// The identifier, kind and slug remain stable after the first save.
export interface ContentInput {
  id?: string;
  kind: ContentKind;
  slug: string;
  title: string;
  bodyHtml: string;
  publication: Publication;
  category?: string;
  pinned?: boolean;
  sortOrder?: number;
  publishedAt?: string | null;
  program?: ProgramDetails;
  resource?: ResourceDetails;
  contact?: ContactDetails;
  relatedIds?: string[];
  fileIds?: string[];
  fileLinks?: ContentFileInput[];
  links?: ContentLinkInput[];
}

export interface ContentSummary {
  id: string;
  kind: ContentKind;
  slug: string;
  title: string;
  category: string;
  // Saved curriculum level / activity type, without loading the full body.
  programLevel?: string;
  publication: Publication;
  pinned: boolean;
  sortOrder: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

// Public-safe attachment metadata: storage keys and hashes never leave the server.
export interface ContentFile {
  id: string;
  originalName: string;
  mediaType: string;
  extension: string;
  size: number;
  createdAt: string;
  role: FileRole;
  altText: string;
}

export interface ContentRecord extends ContentSummary {
  bodyHtml: string;
  program: ProgramDetails | null;
  resource: ResourceDetails | null;
  contact: ContactDetails | null;
  relatedContents: ContentSummary[];
  files: ContentFile[];
  links: Required<ContentLinkInput>[];
}

export interface ContentListQuery {
  kind?: ContentKind;
  q?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

export interface ContentList {
  data: ContentSummary[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface HomeItemInput { section: HomeSection; contentId: string }
export interface PublicHome {
  page: ContentRecord | null;
  sections: Record<HomeSection, ContentSummary[]>;
  latestNotices: ContentSummary[];
}

export interface FileMetadataInput {
  id?: string;
  storageKey: string;
  originalName: string;
  mediaType: string;
  extension: 'hwp' | 'hwpx' | 'pdf' | 'docx' | 'jpg' | 'jpeg' | 'png' | 'webp';
  size: number;
  sha256: string;
}

export interface FileMetadata extends FileMetadataInput { id: string; createdAt: string }
