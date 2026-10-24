ALTER TABLE auth_sessions ADD COLUMN client_type varchar(10) NOT NULL DEFAULT 'WEB';
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_client_type_check CHECK (client_type IN ('WEB', 'MOBILE'));
