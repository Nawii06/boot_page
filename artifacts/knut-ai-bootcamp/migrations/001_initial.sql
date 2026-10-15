-- P-03: content metadata only. Authentication and file byte storage are implemented in later stages.
CREATE TABLE contents (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) = 36 AND substr(id, 9, 1) = '-' AND substr(id, 14, 1) = '-' AND substr(id, 19, 1) = '-' AND substr(id, 24, 1) = '-' AND id NOT GLOB '*[^0-9a-f-]*'),
  kind TEXT NOT NULL CHECK(kind IN ('notice', 'curriculum', 'activity', 'resource', 'faq', 'page')),
  slug TEXT CHECK(slug IS NULL OR (length(slug) BETWEEN 1 AND 100 AND slug NOT GLOB '*[^a-z0-9-]*')),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  body_html TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '' CHECK(length(category) <= 100),
  publication TEXT NOT NULL DEFAULT 'draft' CHECK(publication IN ('draft', 'public', 'private')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  UNIQUE(kind, slug),
  CHECK(kind NOT IN ('curriculum', 'activity', 'page') OR slug IS NOT NULL),
  CHECK(kind != 'page' OR slug IN ('overview', 'organization', 'cooperation', 'location', 'guide', 'home'))
) STRICT;

CREATE INDEX contents_public_list ON contents(kind, publication, pinned DESC, sort_order, published_at DESC, id);
CREATE INDEX contents_category ON contents(kind, publication, category);

CREATE TRIGGER contents_identity_immutable BEFORE UPDATE OF id, kind, slug ON contents
WHEN NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.slug IS NOT OLD.slug
BEGIN SELECT RAISE(ABORT, 'Content ID, kind, and slug are immutable'); END;

CREATE TABLE program_details (
  content_id TEXT PRIMARY KEY NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  delivery TEXT NOT NULL DEFAULT '',
  completion_requirements TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE TRIGGER program_details_kind_insert BEFORE INSERT ON program_details
WHEN NOT EXISTS (SELECT 1 FROM contents WHERE id = NEW.content_id AND kind IN ('curriculum', 'activity'))
BEGIN SELECT RAISE(ABORT, 'Program details require curriculum or activity content'); END;
CREATE TRIGGER program_details_kind_update BEFORE UPDATE OF content_id ON program_details
WHEN NOT EXISTS (SELECT 1 FROM contents WHERE id = NEW.content_id AND kind IN ('curriculum', 'activity'))
BEGIN SELECT RAISE(ABORT, 'Program details require curriculum or activity content'); END;

CREATE TABLE resource_details (
  content_id TEXT PRIMARY KEY NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  audience TEXT NOT NULL DEFAULT '',
  required_documents TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  deadline_text TEXT NOT NULL DEFAULT '',
  submission_method TEXT NOT NULL DEFAULT '',
  destination TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  applicable_year INTEGER CHECK(applicable_year IS NULL OR applicable_year BETWEEN 1900 AND 9999)
) STRICT;

CREATE TRIGGER resource_details_kind_insert BEFORE INSERT ON resource_details
WHEN NOT EXISTS (SELECT 1 FROM contents WHERE id = NEW.content_id AND kind = 'resource')
BEGIN SELECT RAISE(ABORT, 'Resource details require resource content'); END;
CREATE TRIGGER resource_details_kind_update BEFORE UPDATE OF content_id ON resource_details
WHEN NOT EXISTS (SELECT 1 FROM contents WHERE id = NEW.content_id AND kind = 'resource')
BEGIN SELECT RAISE(ABORT, 'Resource details require resource content'); END;

CREATE TABLE contact_details (
  content_id TEXT PRIMARY KEY NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE TRIGGER contact_details_kind_insert BEFORE INSERT ON contact_details
WHEN NOT EXISTS (SELECT 1 FROM contents WHERE id = NEW.content_id AND kind IN ('notice', 'page'))
BEGIN SELECT RAISE(ABORT, 'Contact details require notice or page content'); END;
CREATE TRIGGER contact_details_kind_update BEFORE UPDATE OF content_id ON contact_details
WHEN NOT EXISTS (SELECT 1 FROM contents WHERE id = NEW.content_id AND kind IN ('notice', 'page'))
BEGIN SELECT RAISE(ABORT, 'Contact details require notice or page content'); END;

CREATE TABLE content_relations (
  source_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
  PRIMARY KEY(source_id, target_id),
  CHECK(source_id != target_id)
) STRICT;
CREATE INDEX content_relations_target ON content_relations(target_id);

CREATE TABLE files (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) = 36 AND substr(id, 9, 1) = '-' AND substr(id, 14, 1) = '-' AND substr(id, 19, 1) = '-' AND substr(id, 24, 1) = '-' AND id NOT GLOB '*[^0-9a-f-]*'),
  storage_key TEXT NOT NULL UNIQUE CHECK(length(storage_key) BETWEEN 1 AND 240 AND storage_key NOT GLOB '*[^a-zA-Z0-9/._-]*' AND substr(storage_key, 1, 1) NOT IN ('/', '.') AND substr(storage_key, -1, 1) != '/' AND instr(storage_key, '//') = 0 AND instr('/' || storage_key || '/', '/../') = 0 AND instr('/' || storage_key || '/', '/./') = 0),
  original_name TEXT NOT NULL CHECK(length(trim(original_name)) BETWEEN 1 AND 255 AND instr(original_name, '/') = 0 AND instr(original_name, char(92)) = 0),
  media_type TEXT NOT NULL CHECK(length(trim(media_type)) BETWEEN 1 AND 200),
  extension TEXT NOT NULL CHECK(extension IN ('hwp', 'hwpx', 'pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp')),
  size INTEGER NOT NULL CHECK(size >= 0),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE content_files (
  content_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT 'attachment' CHECK(role IN ('attachment', 'body', 'home')),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
  alt_text TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(content_id, file_id, role)
) STRICT;
CREATE INDEX content_files_file ON content_files(file_id);

CREATE TABLE home_items (
  section TEXT NOT NULL CHECK(section IN ('featured', 'notice', 'program', 'resource')),
  content_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
  PRIMARY KEY(section, content_id)
) STRICT;
CREATE INDEX home_items_content ON home_items(content_id);

CREATE TRIGGER home_items_kind_insert BEFORE INSERT ON home_items
WHEN NOT EXISTS (SELECT 1 FROM contents WHERE id = NEW.content_id AND (NEW.section = 'featured' OR (NEW.section = 'notice' AND kind = 'notice') OR (NEW.section = 'program' AND kind IN ('curriculum', 'activity')) OR (NEW.section = 'resource' AND kind = 'resource')))
BEGIN SELECT RAISE(ABORT, 'Home section does not match content kind'); END;
CREATE TRIGGER home_items_kind_update BEFORE UPDATE OF section, content_id ON home_items
WHEN NOT EXISTS (SELECT 1 FROM contents WHERE id = NEW.content_id AND (NEW.section = 'featured' OR (NEW.section = 'notice' AND kind = 'notice') OR (NEW.section = 'program' AND kind IN ('curriculum', 'activity')) OR (NEW.section = 'resource' AND kind = 'resource')))
BEGIN SELECT RAISE(ABORT, 'Home section does not match content kind'); END;

CREATE TABLE content_links (
  id TEXT PRIMARY KEY NOT NULL,
  content_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 200),
  url TEXT NOT NULL CHECK(length(url) <= 2048 AND (url LIKE 'https://%' OR url LIKE 'http://%')),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0)
) STRICT;
CREATE INDEX content_links_content ON content_links(content_id);

CREATE TABLE admins (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(username)) BETWEEN 3 AND 100 AND username = trim(username)),
  password_hash TEXT NOT NULL CHECK(length(password_hash) > 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  csrf_secret TEXT NOT NULL CHECK(length(csrf_secret) > 0),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX sessions_admin ON sessions(admin_id);
CREATE INDEX sessions_expires ON sessions(expires_at);

-- A seed is applied once, including after examples have been edited or intentionally removed.
CREATE TABLE seed_runs (
  key TEXT PRIMARY KEY NOT NULL,
  checksum TEXT NOT NULL CHECK(length(checksum) = 64),
  applied_at TEXT NOT NULL
) STRICT;
