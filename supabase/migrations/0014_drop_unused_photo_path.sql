-- =============================================================================
-- HACCP SaaS — 0014: odstránenie nepoužitého stĺpca photo_path
--
-- Pridaný v 0009 v očakávaní nahrávania fotiek, ktoré sa nakoniec nezapojilo —
-- nič doň nezapisuje ani z neho nečíta. Mŕtva schéma mätie: pri audite vyzerá,
-- že fotky evidujeme, hoci nie.
--
-- Až bude nahrávanie hotové, pridá sa späť aj so Storage bucketom a policies.
-- =============================================================================

alter table public.measurements drop column if exists photo_path;
