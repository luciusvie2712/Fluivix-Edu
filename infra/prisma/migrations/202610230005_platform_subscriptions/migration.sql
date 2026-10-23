-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "monthly_price_vnd" BIGINT NOT NULL,
    "limits_json" JSONB NOT NULL,
    "feature_flags_json" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "grace_until" TIMESTAMPTZ NOT NULL,
    "source" VARCHAR(40) NOT NULL DEFAULT 'PLATFORM_MANUAL',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "effective_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "actor_id" UUID NOT NULL,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_starts_at_idx" ON "subscriptions"("tenant_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenant_id_id_key" ON "subscriptions"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_tenant_id_subscription_id_fkey" FOREIGN KEY ("tenant_id", "subscription_id") REFERENCES "subscriptions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE tenants ADD COLUMN contact_email varchar(254);
ALTER TABLE platform_audit ADD COLUMN reason varchar(500);
ALTER TABLE subscriptions ADD CONSTRAINT subscription_valid_dates CHECK (starts_at < ends_at AND ends_at <= grace_until);
ALTER TABLE subscriptions ADD CONSTRAINT subscription_status CHECK (status IN ('ACTIVE','EXPIRED','CANCELLED'));
ALTER TABLE subscriptions ADD CONSTRAINT subscription_no_active_overlap EXCLUDE USING gist
  (tenant_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (status = 'ACTIVE');
ALTER TABLE plans ADD CONSTRAINT plan_price_nonnegative CHECK (monthly_price_vnd >= 0);
ALTER TABLE plans ADD CONSTRAINT plan_status CHECK (status IN ('ACTIVE','ARCHIVED'));
CREATE TRIGGER subscription_events_append_only BEFORE UPDATE OR DELETE ON subscription_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE FUNCTION protect_subscribed_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM subscriptions WHERE plan_id = OLD.id) AND
     ROW(NEW.code,NEW.monthly_price_vnd,NEW.limits_json,NEW.feature_flags_json) IS DISTINCT FROM
     ROW(OLD.code,OLD.monthly_price_vnd,OLD.limits_json,OLD.feature_flags_json) THEN
    RAISE EXCEPTION 'subscribed plan terms are immutable; create a new version';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER subscribed_plan_immutable BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION protect_subscribed_plan();
