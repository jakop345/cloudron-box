#### WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING
#### This file is not used by any code and is here to document the latest schema

#### General ideas
#### Default char set is utf8 and DEFAULT COLLATE is utf8_bin. Collate affects comparisons in WHERE and ORDER
#### Strict mode is enabled
#### VARCHAR - stored as part of table row (use for strings)
#### TEXT - stored offline from table row (use for strings)
#### BLOB - stored offline from table row (use for binary data)
#### https://dev.mysql.com/doc/refman/5.0/en/storage-requirements.html

CREATE TABLE IF NOT EXISTS users(
    id VARCHAR(128) NOT NULL UNIQUE,
    username VARCHAR(254) NOT NULL UNIQUE,
    email VARCHAR(254) NOT NULL UNIQUE,
    password VARCHAR(1024) NOT NULL,
    salt VARCHAR(512) NOT NULL,
    createdAt VARCHAR(512) NOT NULL,
    modifiedAt VARCHAR(512) NOT NULL,
    admin INTEGER NOT NULL,
    PRIMARY KEY(id));

CREATE TABLE IF NOT EXISTS tokens(
    accessToken VARCHAR(128) NOT NULL UNIQUE,
    identifier VARCHAR(128) NOT NULL,
    clientId VARCHAR(128),
    scope VARCHAR(512) NOT NULL,
    expires BIGINT NOT NULL,
    PRIMARY KEY(accessToken));

CREATE TABLE IF NOT EXISTS clients(
    id VARCHAR(128) NOT NULL UNIQUE,
    appId VARCHAR(128) NOT NULL,
    clientSecret VARCHAR(512) NOT NULL,
    redirectURI VARCHAR(512) NOT NULL,
    scope VARCHAR(512) NOT NULL,
    PRIMARY KEY(id));

CREATE TABLE IF NOT EXISTS apps(
    id VARCHAR(128) NOT NULL UNIQUE,
    appStoreId VARCHAR(128) NOT NULL,
    installationState VARCHAR(512) NOT NULL,
    installationProgress VARCHAR(512),
    runState VARCHAR(512),
    health VARCHAR(128),
    containerId VARCHAR(128),
    manifestJson VARCHAR(2048),
    httpPort INTEGER,                        // this is the nginx proxy port and not manifest.httpPort
    location VARCHAR(128) NOT NULL UNIQUE,
    dnsRecordId VARCHAR(512),
    accessRestriction VARCHAR(512),
    createdAt TIMESTAMP(2) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    lastBackupId VARCHAR(128),
    lastConfigJson VARCHAR(2048), // used for appstore and non-appstore installs
    PRIMARY KEY(id));

CREATE TABLE IF NOT EXISTS appPortBindings(
    hostPort INTEGER NOT NULL UNIQUE,
    environmentVariable VARCHAR(128) NOT NULL,
    appId VARCHAR(128) NOT NULL,
    FOREIGN KEY(appId) REFERENCES apps(id),
    PRIMARY KEY(hostPort));

CREATE TABLE IF NOT EXISTS authcodes(
    authCode VARCHAR(128) NOT NULL UNIQUE,
    userId VARCHAR(128) NOT NULL,
    clientId VARCHAR(128) NOT NULL,
    expiresAt BIGINT NOT NULL,
    PRIMARY KEY(authCode));

CREATE TABLE IF NOT EXISTS settings(
    name VARCHAR(128) NOT NULL UNIQUE,
    value VARCHAR(512),
    PRIMARY KEY(name));

CREATE TABLE IF NOT EXISTS appAddonConfigs(
    appId VARCHAR(128) NOT NULL,
    addonId VARCHAR(32) NOT NULL,
    value VARCHAR(512) NOT NULL,
    FOREIGN KEY(appId) REFERENCES apps(id));

