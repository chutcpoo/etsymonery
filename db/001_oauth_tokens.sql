CREATE TABLE IF NOT EXISTS oauth_tokens (
  provider text NOT NULL,
  account_key text NOT NULL,
  access_token_enc text NOT NULL,
  refresh_token_enc text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  token_type text,
  user_id bigint,
  shop_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, account_key)
);
