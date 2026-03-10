--liquibase formatted sql
--changeset itamarg:000054_create_agent_config_env_history
--comment: Create history table to track blueprint-to-environment assignments over time

CREATE TABLE IF NOT EXISTS agent_config_env_history (
    id CHAR(36) NOT NULL,
    workspace_id VARCHAR(150) NOT NULL,
    project_id CHAR(36) NOT NULL,
    config_id CHAR(36) NOT NULL,
    env_name VARCHAR(50) NOT NULL,
    blueprint_id CHAR(36) NOT NULL,
    started_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    ended_at TIMESTAMP(6) NULL,
    created_by VARCHAR(100) NOT NULL,
    CONSTRAINT agent_config_env_history_pk PRIMARY KEY (id),
    INDEX idx_env_history_lookup (workspace_id, project_id, env_name, ended_at)
);

--rollback DROP TABLE IF EXISTS agent_config_env_history;
