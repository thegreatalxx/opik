--liquibase formatted sql
--changeset andrescrz:000063_create_workspaces_table

CREATE TABLE IF NOT EXISTS workspaces (
    workspace_id        VARCHAR(150)    NOT NULL PRIMARY KEY,
    version             ENUM('version_1', 'version_2') NOT NULL,
    created_at          TIMESTAMP(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    created_by          VARCHAR(100)    NOT NULL DEFAULT 'admin',
    last_updated_at     TIMESTAMP(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    last_updated_by     VARCHAR(100)    NOT NULL DEFAULT 'admin'
);
