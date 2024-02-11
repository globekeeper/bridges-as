CREATE TABLE IF NOT EXISTS connections (
  broker TEXT NOT NULL,
  client_id TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  space_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
  PRIMARY KEY (broker, username)
);
