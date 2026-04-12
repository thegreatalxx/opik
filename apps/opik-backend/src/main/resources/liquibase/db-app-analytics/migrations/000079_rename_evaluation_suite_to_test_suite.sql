--liquibase formatted sql
--changeset DanielDimenshtein:000079_rename_evaluation_suite_to_test_suite
--comment: Rename evaluation_method enum value from 'evaluation_suite' to 'test_suite' in experiments and experiment_aggregates

ALTER TABLE ${ANALYTICS_DB_DATABASE_NAME}.experiments ON CLUSTER '{cluster}'
    MODIFY COLUMN evaluation_method ENUM('unknown' = 0, 'dataset' = 1, 'test_suite' = 2) DEFAULT 'unknown';

ALTER TABLE ${ANALYTICS_DB_DATABASE_NAME}.experiment_aggregates ON CLUSTER '{cluster}'
    MODIFY COLUMN evaluation_method ENUM('unknown' = 0, 'dataset' = 1, 'test_suite' = 2) DEFAULT 'unknown';

--rollback ALTER TABLE ${ANALYTICS_DB_DATABASE_NAME}.experiments ON CLUSTER '{cluster}' MODIFY COLUMN evaluation_method ENUM('unknown' = 0, 'dataset' = 1, 'evaluation_suite' = 2) DEFAULT 'unknown';
--rollback ALTER TABLE ${ANALYTICS_DB_DATABASE_NAME}.experiment_aggregates ON CLUSTER '{cluster}' MODIFY COLUMN evaluation_method ENUM('unknown' = 0, 'dataset' = 1, 'evaluation_suite' = 2) DEFAULT 'unknown';
