package com.comet.opik.domain.workspaces;

import com.comet.opik.api.OpikVersion;
import org.jdbi.v3.sqlobject.customizer.Bind;
import org.jdbi.v3.sqlobject.statement.SqlQuery;
import org.jdbi.v3.sqlobject.statement.SqlUpdate;

import java.util.Optional;

interface WorkspaceVersionDAO {

    @SqlQuery("SELECT version FROM workspace_versions WHERE workspace_id = :workspaceId")
    Optional<String> getStoredVersion(@Bind("workspaceId") String workspaceId);

    @SqlUpdate("""
            INSERT INTO workspace_versions (workspace_id, version)
            VALUES (:workspaceId, :version)
            ON DUPLICATE KEY UPDATE version = :version, last_updated_at = CURRENT_TIMESTAMP(6)
            """)
    void storeVersion(@Bind("workspaceId") String workspaceId, @Bind("version") String version);

    default Optional<OpikVersion> getStoredOpikVersion(String workspaceId) {
        return getStoredVersion(workspaceId).flatMap(OpikVersion::findByValue);
    }

    default void storeOpikVersion(String workspaceId, OpikVersion version) {
        storeVersion(workspaceId, version.getValue());
    }
}
