-- Additive031, only after030 is committed and exact CI is green.
ALTER TABLE rooms ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version > 0);
CREATE FUNCTION advance_room_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.tenant_id,NEW.code) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.code) THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='room identity is immutable';
 END IF;
 IF (NEW.name,NEW.capacity,NEW.active) IS DISTINCT FROM (OLD.name,OLD.capacity,OLD.active) THEN
  NEW.version := OLD.version + 1;
 ELSE
  NEW.version := OLD.version;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER room_version BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION advance_room_version();
