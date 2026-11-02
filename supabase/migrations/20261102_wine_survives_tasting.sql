-- Deleting a tasting must never delete wines from the library. Old wines still carry the tasting they were first
-- made for (wines.tasting_id, from before the library); that link now just goes empty instead of cascading.
alter table wines drop constraint if exists wines_tasting_id_fkey;
alter table wines add constraint wines_tasting_id_fkey foreign key (tasting_id) references tastings(id) on delete set null;
