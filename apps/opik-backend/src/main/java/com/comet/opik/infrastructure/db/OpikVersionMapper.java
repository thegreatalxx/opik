package com.comet.opik.infrastructure.db;

import com.comet.opik.api.OpikVersion;

public class OpikVersionMapper extends AbstractEnumColumnMapper<OpikVersion> {
    public OpikVersionMapper() {
        super(OpikVersion::fromValue, "opik_version");
    }
}
