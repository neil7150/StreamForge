-- Read-only preflight for a direct TLS PostgreSQL client.
-- Does not create schemas, extensions, users, tables or application data.
SELECT
    current_setting('server_version') AS postgres_version,
    current_database() AS database_name,
    current_user AS database_user,
    has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schemas_and_trusted_extensions,
    has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_public_schema,
    has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_in_public_schema;

SELECT name, default_version, installed_version
FROM pg_available_extensions
WHERE name IN ('uuid-ossp', 'pgcrypto')
ORDER BY name;
