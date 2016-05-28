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
    username VARCHAR(254) UNIQUE,
    email VARCHAR(254) NOT NULL UNIQUE,
    password VARCHAR(1024) NOT NULL,
    salt VARCHAR(512) NOT NULL,
    createdAt VARCHAR(512) NOT NULL,
    modifiedAt VARCHAR(512) NOT NULL,
    admin INTEGER NOT NULL,
    displayName VARCHAR(512) DEFAULT '',
    showTutorial BOOLEAN DEFAULT 0,
    PRIMARY KEY(id));

CREATE TABLE IF NOT EXISTS groups(
    id VARCHAR(128) NOT NULL UNIQUE,
    username VARCHAR(254) NOT NULL UNIQUE,
    PRIMARY KEY(id));

CREATE TABLE IF NOT EXISTS groupMembers(
    groupId VARCHAR(128) NOT NULL,
    userId VARCHAR(128) NOT NULL,
    FOREIGN KEY(groupId) REFERENCES groups(id),
    FOREIGN KEY(userId) REFERENCES users(id));

CREATE TABLE IF NOT EXISTS tokens(
    accessToken VARCHAR(128) NOT NULL UNIQUE,
    identifier VARCHAR(128) NOT NULL,
    clientId VARCHAR(128),
    scope VARCHAR(512) NOT NULL,
    expires BIGINT NOT NULL,
    PRIMARY KEY(accessToken));

CREATE TABLE IF NOT EXISTS clients(
    id VARCHAR(128) NOT NULL UNIQUE, // prefixed with cid- to identify token easily in auth routes
    appId VARCHAR(128) NOT NULL,
    type VARCHAR(16) NOT NULL,
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
    manifestJson TEXT,
    httpPort INTEGER,                        // this is the nginx proxy port and not manifest.httpPort
    location VARCHAR(128) NOT NULL UNIQUE,
    dnsRecordId VARCHAR(512),
    accessRestrictionJson TEXT, // { users: [ ], groups: [ ] }
    oauthProxy BOOLEAN DEFAULT 0,
    createdAt TIMESTAMP(2) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    memoryLimit BIGINT DEFAULT 0,
    altDomain VARCHAR(256),

    lastBackupId VARCHAR(128),
    lastBackupConfigJson TEXT, // used for appstore and non-appstore installs. it's here so it's easy to do REST validation

    oldConfigJson TEXT, // used to pass old config for apptask

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

CREATE TABLE IF NOT EXISTS backups(
    filename VARCHAR(128) NOT NULL,
    creationTime TIMESTAMP,
    version VARCHAR(128) NOT NULL, /* app version or box version */
    type VARCHAR(16) NOT NULL, /* 'box' or 'app' */
    dependsOn VARCHAR(4096), /* comma separate list of objects this backup depends on */
    state VARCHAR(16) NOT NULL,

    PRIMARY KEY (filename));

CREATE TABLE IF NOT EXISTS eventlog(
    id VARCHAR(128) NOT NULL,
    action VARCHAR(128) NOT NULL,
    source JSON, /* { userId, username, ip }. userId can be null for cron,sysadmin */
    data JSON, /* free flowing json based on action */
    creationTime TIMESTAMP,

    PRIMARY KEY (id));

CREATE TABLE IF NOT EXISTS mailboxes(
    name VARCHAR(128) NOT NULL,
    aliasTarget VARCHAR(128), /* the target name type is an alias */
    creationTime TIMESTAMP,

    PRIMARY KEY (id));
