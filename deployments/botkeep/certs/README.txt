Only provider-issued public CA certificates belong here. No private keys.
PostgreSQL example: postgres-ca.pem, referenced by sslrootcert in DATABASE_URL.
Redis examples: auth-redis-ca.pem and cache-redis-ca.pem, referenced by the
corresponding *_REDIS_CA_FILE environment setting when private CAs are used.
Publicly trusted Redis certificates normally need no custom CA file.
