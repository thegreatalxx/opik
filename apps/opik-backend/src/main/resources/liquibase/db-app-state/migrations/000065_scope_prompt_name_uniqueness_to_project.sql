--liquibase formatted sql
--changeset daniela:opik-5891-scope-prompt-name-uniqueness-to-project
--comment: Scope prompt name uniqueness to project level and drop redundant index

-- The old constraint enforced name uniqueness per workspace. Now that prompts
-- are project-scoped, uniqueness should be per (workspace, project).
ALTER TABLE prompts
    DROP INDEX prompts_workspace_id_name_uk,
    ADD CONSTRAINT prompts_workspace_project_name_uk UNIQUE (workspace_id, project_id, name);

-- The (workspace_id, project_id) index from migration 000057 is now redundant
-- because the new unique constraint covers the same leftmost prefix.
DROP INDEX prompts_workspace_project_idx ON prompts;

--rollback ALTER TABLE prompts DROP INDEX prompts_workspace_project_name_uk, ADD CONSTRAINT prompts_workspace_id_name_uk UNIQUE (workspace_id, name);
--rollback CREATE INDEX prompts_workspace_project_idx ON prompts (workspace_id, project_id);

