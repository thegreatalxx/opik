package com.comet.opik.domain.workspaces;

import com.comet.opik.api.OpikVersion;
import com.comet.opik.infrastructure.db.OpikVersionArgumentFactory;
import com.comet.opik.infrastructure.db.OpikVersionColumnMapper;
import org.jdbi.v3.sqlobject.config.RegisterArgumentFactory;
import org.jdbi.v3.sqlobject.config.RegisterColumnMapper;
import org.jdbi.v3.sqlobject.customizer.Bind;
import org.jdbi.v3.sqlobject.statement.SqlQuery;
import org.jdbi.v3.sqlobject.statement.SqlUpdate;

import java.util.Optional;

@RegisterArgumentFactory(OpikVersionArgumentFactory.class)
@RegisterColumnMapper(OpikVersionColumnMapper.class)
interface WorkspaceDAO {

    @SqlQuery("SELECT version FROM workspaces WHERE workspace_id = :workspaceId")
    Optional<OpikVersion> getVersion(@Bind("workspaceId") String workspaceId);

    @SqlUpdate("""
            INSERT INTO workspaces (workspace_id, version)
            VALUES (:workspaceId, :version)
            ON DUPLICATE KEY UPDATE version = :version, last_updated_at = CURRENT_TIMESTAMP(6)
            """)
    void upsertVersion(@Bind("workspaceId") String workspaceId, @Bind("version") OpikVersion version);
}
