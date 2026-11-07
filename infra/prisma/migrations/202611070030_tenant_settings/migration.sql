-- Additive030. Existing profile content and business history remain unchanged.
ALTER TABLE tenants ADD COLUMN settings_version integer NOT NULL DEFAULT 1 CHECK(settings_version > 0);
CREATE FUNCTION advance_tenant_settings_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.name,NEW.contact_email,NEW.timezone) IS DISTINCT FROM (OLD.name,OLD.contact_email,OLD.timezone) THEN
  NEW.settings_version := OLD.settings_version + 1;
 ELSE
  NEW.settings_version := OLD.settings_version;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tenant_settings_version BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION advance_tenant_settings_version();
