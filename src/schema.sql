CREATE TABLE IF NOT EXISTS users(
    id VARCHAR(128) NOT NULL UNIQUE,
    username VARCHAR(512) NOT NULL,
    email VARCHAR(512) NOT NULL,
    _password VARCHAR(512) NOT NULL,
    publicPem VARCHAR(2048) NOT NULL,
    _privatePemCipher VARCHAR(2048) NOT NULL,
    _salt VARCHAR(512) NOT NULL,
    createdAt VARCHAR(512) NOT NULL,
    modifiedAt VARCHAR(512) NOT NULL,
    admin INTEGER NOT NULL,
    PRIMARY KEY(id));

CREATE TABLE IF NOT EXISTS tokens(
    accessToken VARCHAR(512) NOT NULL UNIQUE,
    userId VARCHAR(512) NOT NULL,
    clientId VARCHAR(512),
    scope VARCHAR(512) NOT NULL,
    expires VARCHAR(512) NOT NULL,
    PRIMARY KEY(accessToken));

CREATE TABLE IF NOT EXISTS clients(
    id VARCHAR(512) NOT NULL UNIQUE,
    appId VARCHAR(512) NOT NULL,
    clientId VARCHAR(512) NOT NULL,
    clientSecret VARCHAR(512) NOT NULL,
    name VARCHAR(512) NOT NULL,
    redirectURI VARCHAR(512) NOT NULL,
    PRIMARY KEY(id));

CREATE TABLE IF NOT EXISTS apps(
    id VARCHAR(512) NOT NULL UNIQUE,
    appStoreId VARCHAR(512) NOT NULL UNIQUE,
    version VARCHAR(32),
    installationState VARCHAR(512) NOT NULL,
    installationProgress VARCHAR(512),
    runState VARCHAR(512),
    healthy INTEGER,
    containerId VARCHAR(128),
    manifestJson VARCHAR,
    httpPort INTEGER,
    location VARCHAR(512) NOT NULL UNIQUE,
    PRIMARY KEY(id));

CREATE TABLE IF NOT EXISTS appPortBindings(
    hostPort VARCHAR(5) NOT NULL UNIQUE,
    containerPort VARCHAR(5) NOT NULL,
    appId VARCHAR(512) NOT NULL,
    FOREIGN KEY(appId) REFERENCES apps(id),
    PRIMARY KEY(hostPort));

CREATE TABLE IF NOT EXISTS authcodes(
    authCode VARCHAR(512) NOT NULL UNIQUE,
    redirectURI VARCHAR(512) NOT NULL,
    userId VARCHAR(512) NOT NULL,
    clientId VARCHAR(512) NOT NULL,
    scope VARCHAR(512) NOT NULL,
    PRIMARY KEY(authCode));

CREATE TABLE IF NOT EXISTS settings(
    key VARCHAR(512) NOT NULL UNIQUE,
    value VARCHAR(512),
    PRIMARY KEY(key));

