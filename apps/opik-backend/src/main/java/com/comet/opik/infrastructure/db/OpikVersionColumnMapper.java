package com.comet.opik.infrastructure.db;

import com.comet.opik.api.OpikVersion;
import lombok.extern.slf4j.Slf4j;
import org.jdbi.v3.core.mapper.ColumnMapper;
import org.jdbi.v3.core.statement.StatementContext;

import java.sql.ResultSet;
import java.sql.SQLException;

@Slf4j
public class OpikVersionColumnMapper implements ColumnMapper<OpikVersion> {

    @Override
    public OpikVersion map(ResultSet r, int columnNumber, StatementContext ctx) throws SQLException {
        return parse(r.getString(columnNumber));
    }

    @Override
    public OpikVersion map(ResultSet r, String columnLabel, StatementContext ctx) throws SQLException {
        return parse(r.getString(columnLabel));
    }

    private OpikVersion parse(String value) {
        if (value == null) {
            return null;
        }
        return OpikVersion.findByValue(value).orElse(null);
    }
}
