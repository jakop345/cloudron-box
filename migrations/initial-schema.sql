CREATE TABLE IF NOT EXISTS users(
    id VARCHAR(128) NOT NULL UNIQUE,
    username VARCHAR(512) NOT NULL,
    email VARCHAR(512) NOT NULL,
    password VARCHAR(1024) NOT NULL,
    salt VARCHAR(512) NOT NULL,
    createdAt VARCHAR(512) NOT NULL,
    modifiedAt VARCHAR(512) NOT NULL,
    admin INTEGER NOT NULL,
    PRIMARY KEY(id));

CREATE TABLE IF NOT EXISTS tokens(
    accessToken VARCHAR(128) NOT NULL UNIQUE,
    userId VARCHAR(128) NOT NULL,
    clientId VARCHAR(128),
    scope VARCHAR(512) NOT NULL,
    expires VARCHAR(512) NOT NULL,
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
    version VARCHAR(32),
    installationState VARCHAR(512) NOT NULL,
    installationProgress VARCHAR(512),
    runState VARCHAR(512),
    healthy INTEGER,
    containerId VARCHAR(128),
    manifestJson VARCHAR(2048),
    httpPort INTEGER,
    location VARCHAR(128) NOT NULL UNIQUE,
    dnsRecordId VARCHAR(512),
    accessRestriction VARCHAR(512),
    PRIMARY KEY(id));

CREATE TABLE IF NOT EXISTS appPortBindings(
    hostPort VARCHAR(5) NOT NULL UNIQUE,
    containerPort VARCHAR(5) NOT NULL,
    appId VARCHAR(128) NOT NULL,
    FOREIGN KEY(appId) REFERENCES apps(id),
    PRIMARY KEY(hostPort));

CREATE TABLE IF NOT EXISTS authcodes(
    authCode VARCHAR(128) NOT NULL UNIQUE,
    userId VARCHAR(128) NOT NULL,
    clientId VARCHAR(128) NOT NULL,
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

