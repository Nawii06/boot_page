-- P-04: persistent pre-login CSRF state and login throttling; no existing content is changed.
CREATE TABLE pre_auth_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  csrf_secret TEXT NOT NULL CHECK(length(csrf_secret) = 43 AND csrf_secret NOT GLOB '*[^a-zA-Z0-9_-]*'),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX pre_auth_sessions_expires ON pre_auth_sessions(expires_at);

CREATE TABLE auth_rate_limits (
  key_hash TEXT PRIMARY KEY NOT NULL CHECK(length(key_hash) = 64 AND key_hash NOT GLOB '*[^0-9a-f]*'),
  attempts INTEGER NOT NULL CHECK(attempts >= 1),
  reset_at TEXT NOT NULL
) STRICT;
CREATE INDEX auth_rate_limits_reset ON auth_rate_limits(reset_at);
