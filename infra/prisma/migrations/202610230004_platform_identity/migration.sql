-- CreateTable
CREATE TABLE "platform_users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mfa_secret" TEXT,
    "last_totp_step" BIGINT NOT NULL DEFAULT -1,
    "recovery_hashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "pending_secret" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "platform_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "resource_id" VARCHAR(80) NOT NULL,
    "trace_id" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_challenges_token_hash_key" ON "platform_challenges"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "platform_sessions_token_hash_key" ON "platform_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "platform_sessions_family_id_idx" ON "platform_sessions"("family_id");

-- CreateIndex
CREATE INDEX "platform_audit_created_at_idx" ON "platform_audit"("created_at");

-- AddForeignKey
ALTER TABLE "platform_challenges" ADD CONSTRAINT "platform_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE platform_users ADD CONSTRAINT platform_email_canonical CHECK (email = lower(btrim(email)));
ALTER TABLE platform_users ADD CONSTRAINT platform_recovery_limit CHECK (cardinality(recovery_hashes) <= 10);
ALTER TABLE platform_challenges ADD CONSTRAINT platform_challenge_attempts CHECK (attempts BETWEEN 0 AND 5);
CREATE TRIGGER platform_audit_append_only BEFORE UPDATE OR DELETE ON platform_audit FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
