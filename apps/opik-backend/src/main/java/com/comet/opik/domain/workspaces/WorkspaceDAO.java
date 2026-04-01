package com.comet.opik.domain.workspaces;

import com.comet.opik.api.OpikVersion;
import com.comet.opik.infrastructure.db.OpikVersionMapper;
import org.jdbi.v3.sqlobject.config.RegisterArgumentFactory;
import org.jdbi.v3.sqlobject.config.RegisterColumnMapper;
import org.jdbi.v3.sqlobject.customizer.Bind;
import org.jdbi.v3.sqlobject.statement.SqlQuery;
import org.jdbi.v3.sqlobject.statement.SqlUpdate;

import java.util.Optional;

@RegisterArgumentFactory(OpikVersionMapper.class)
@RegisterColumnMapper(OpikVersionMapper.class)
interface WorkspaceDAO {

    @SqlQuery("SELECT opik_version FROM workspaces WHERE workspace_id = :workspaceId")
    Optional<OpikVersion> getOpikVersion(@Bind("workspaceId") String workspaceId);

    @SqlUpdate("""
            INSERT INTO workspaces (workspace_id, opik_version, created_by, last_updated_by)
            VALUES (:workspaceId, :opikVersion, :userName, :userName)
            ON DUPLICATE KEY UPDATE opik_version = :opikVersion, last_updated_by = :userName
            """)
    int upsertOpikVersion(@Bind("workspaceId") String workspaceId,
            @Bind("opikVersion") OpikVersion opikVersion,
            @Bind("userName") String userName);
}
