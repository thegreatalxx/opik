--liquibase formatted sql
--changeset danield:000064_rename_evaluation_suite_to_test_suite
--comment: Rename dataset type enum value from 'evaluation_suite' to 'test_suite'

ALTER TABLE datasets MODIFY COLUMN type ENUM('dataset', 'evaluation_suite', 'test_suite') NOT NULL DEFAULT 'dataset';
UPDATE datasets SET type = 'test_suite' WHERE type = 'evaluation_suite';
ALTER TABLE datasets MODIFY COLUMN type ENUM('dataset', 'test_suite') NOT NULL DEFAULT 'dataset';

--rollback ALTER TABLE datasets MODIFY COLUMN type ENUM('dataset', 'test_suite', 'evaluation_suite') NOT NULL DEFAULT 'dataset';
--rollback UPDATE datasets SET type = 'evaluation_suite' WHERE type = 'test_suite';
--rollback ALTER TABLE datasets MODIFY COLUMN type ENUM('dataset', 'evaluation_suite') NOT NULL DEFAULT 'dataset';
