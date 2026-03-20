--liquibase formatted sql
--changeset itamarg:000073_add_dataset_item_count_to_experiment_aggregates
--comment: Add dataset_item_count column to experiment_aggregates table for storing pre-aggregated dataset item counts

ALTER TABLE ${ANALYTICS_DB_DATABASE_NAME}.experiment_aggregates ON CLUSTER '{cluster}'
    ADD COLUMN IF NOT EXISTS dataset_item_count UInt64 DEFAULT 0 CODEC(Delta, ZSTD(1));

--rollback ALTER TABLE ${ANALYTICS_DB_DATABASE_NAME}.experiment_aggregates ON CLUSTER '{cluster}' DROP COLUMN IF EXISTS dataset_item_count;
