-- categories.folder: image folder of the category, relative to UPLOAD_DIR, mirroring the tree
-- (e.g. 'keripik/keripik-pisang'). Lowercase ascii slugs joined by '/'. Soft-deleted categories
-- keep their renamed folder ('...-unused'). Values are filled in by the startup backfill
-- (services/folders.js) because slugging happens in JS; NULL only until that runs.
ALTER TABLE categories ADD COLUMN folder TEXT;
CREATE UNIQUE INDEX uq_categories_folder ON categories (folder) WHERE folder IS NOT NULL;

-- Prefix range scans when a category folder is renamed/moved (file > 'a/b/' AND file < 'a/b0').
CREATE INDEX idx_images_file ON product_images (file);
