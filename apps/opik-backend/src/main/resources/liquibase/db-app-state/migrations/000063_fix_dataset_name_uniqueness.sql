--liquibase formatted sql
--changeset yboiko:000063_fix_dataset_name_uniqueness
--comment: Fix dataset name uniqueness to be scoped per project, not just per workspace. Adds a generated column to normalize NULL project_id for unique constraint.

-- 1. Add generated column that normalizes NULL project_id to empty string.
--    MySQL treats NULL != NULL in unique constraints, so COALESCE ensures
--    workspace-level datasets (project_id IS NULL) are still uniquely constrained.
ALTER TABLE datasets
    ADD COLUMN project_id_or_empty VARCHAR(36)
    GENERATED ALWAYS AS (COALESCE(project_id, '')) STORED;

-- 2. Rename any duplicate (workspace_id, coalesced project_id, name) rows
--    so the new constraint can be added safely on existing data.
--    Keeps the oldest row's name intact (ORDER BY created_at ASC, rn=1 is untouched).
UPDATE datasets d
INNER JOIN (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY workspace_id, COALESCE(project_id, ''), name
               ORDER BY created_at ASC
           ) AS rn,
           name
    FROM datasets
) ranked ON d.id = ranked.id
SET d.name = CONCAT(LEFT(ranked.name, 240), '_dup_', ranked.rn)
WHERE ranked.rn > 1;

-- 3. Drop old workspace-only constraint
ALTER TABLE datasets DROP INDEX datasets_workspace_id_name_uk;

-- 4. Add new project-scoped constraint
ALTER TABLE datasets ADD CONSTRAINT datasets_workspace_project_name_uk
    UNIQUE (workspace_id, project_id_or_empty, name);

--rollback ALTER TABLE datasets DROP INDEX datasets_workspace_project_name_uk;
--rollback ALTER TABLE datasets ADD CONSTRAINT datasets_workspace_id_name_uk UNIQUE (workspace_id, name);
--rollback ALTER TABLE datasets DROP COLUMN project_id_or_empty;
