package com.comet.opik.infrastructure.db;

import com.comet.opik.api.OpikVersion;
import org.jdbi.v3.core.argument.AbstractArgumentFactory;
import org.jdbi.v3.core.argument.Argument;
import org.jdbi.v3.core.config.ConfigRegistry;

import java.sql.Types;

public class OpikVersionArgumentFactory extends AbstractArgumentFactory<OpikVersion> {
    public OpikVersionArgumentFactory() {
        super(Types.VARCHAR);
    }

    @Override
    protected Argument build(OpikVersion value, ConfigRegistry config) {
        return (position, statement, ctx) -> {
            if (value == null) {
                statement.setNull(position, Types.VARCHAR);
            } else {
                statement.setString(position, value.getValue());
            }
        };
    }
}
