--liquibase formatted sql
--changeset andrescrz:000063_create_workspace_versions_table

CREATE TABLE IF NOT EXISTS workspace_versions (
    workspace_id    VARCHAR(150)    NOT NULL PRIMARY KEY,
    version         VARCHAR(20)     NOT NULL,
    created_at      TIMESTAMP(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_updated_at TIMESTAMP(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);
