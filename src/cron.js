'use strict';

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize
};

var apps = require('./apps.js'),
    assert = require('assert'),
    cloudron = require('./cloudron.js'),
    CronJob = require('cron').CronJob,
    debug = require('debug')('box:cron'),
    janitor = require('./janitor.js'),
    scheduler = require('./scheduler.js'),
    settings = require('./settings.js'),
    updateChecker = require('./updatechecker.js');

var gAutoupdaterJob = null,
    gBoxUpdateCheckerJob = null,
    gAppUpdateCheckerJob = null,
    gHeartbeatJob = null,
    gBackupJob = null,
    gCleanupTokensJob = null,
    gDockerVolumeCleanerJob = null,
    gSchedulerSyncJob = null;

var gInitialized = false;

var NOOP_CALLBACK = function (error) { if (error) console.error(error); };

// cron format
// Seconds: 0-59
// Minutes: 0-59
// Hours: 0-23
// Day of Month: 1-31
// Months: 0-11
// Day of Week: 0-6

function initialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (gInitialized) return callback();

    settings.events.on(settings.TIME_ZONE_KEY, recreateJobs);
    settings.events.on(settings.AUTOUPDATE_PATTERN_KEY, autoupdatePatternChanged);

    gInitialized = true;

    recreateJobs(callback);
}

function recreateJobs(unusedTimeZone, callback) {
    if (typeof unusedTimeZone === 'function') callback = unusedTimeZone;

    settings.getAll(function (error, allSettings) {
        debug('Creating jobs with timezone %s', allSettings[settings.TIME_ZONE_KEY]);

        if (gHeartbeatJob) gHeartbeatJob.stop();
        gHeartbeatJob = new CronJob({
            cronTime: '00 */1 * * * *', // every minute
            onTick: cloudron.sendHeartbeat,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gBackupJob) gBackupJob.stop();
        gBackupJob = new CronJob({
            cronTime: '00 00 */4 * * *', // every 4 hours
            onTick: cloudron.ensureBackup,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gBoxUpdateCheckerJob) gBoxUpdateCheckerJob.stop();
        gBoxUpdateCheckerJob = new CronJob({
            cronTime: '00 */10 * * * *', // every 10 minutes
            onTick: updateChecker.checkBoxUpdates,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gAppUpdateCheckerJob) gAppUpdateCheckerJob.stop();
        gAppUpdateCheckerJob = new CronJob({
            cronTime: '00 */10 * * * *', // every 10 minutes
            onTick: updateChecker.checkAppUpdates,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gCleanupTokensJob) gCleanupTokensJob.stop();
        gCleanupTokensJob = new CronJob({
            cronTime: '00 */30 * * * *', // every 30 minutes
            onTick: janitor.cleanupTokens,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gDockerVolumeCleanerJob) gDockerVolumeCleanerJob.stop();
        gDockerVolumeCleanerJob = new CronJob({
            cronTime: '00 00 */12 * * *', // every 12 hours
            onTick: janitor.cleanupDockerVolumes,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        if (gSchedulerSyncJob) gSchedulerSyncJob.stop();
        gSchedulerSyncJob = new CronJob({
            cronTime: '00 */10 * * * *', // every 10 minutes
            onTick: scheduler.sync,
            start: true,
            timeZone: allSettings[settings.TIME_ZONE_KEY]
        });

        autoupdatePatternChanged(allSettings[settings.AUTOUPDATE_PATTERN_KEY]);

        if (callback) callback();
    });
}

function autoupdatePatternChanged(pattern) {
    assert.strictEqual(typeof pattern, 'string');

    debug('Auto update pattern changed to %s', pattern);

    if (gAutoupdaterJob) gAutoupdaterJob.stop();

    if (pattern === 'never') return;

    gAutoupdaterJob = new CronJob({
        cronTime: pattern,
        onTick: function() {
            var updateInfo = updateChecker.getUpdateInfo();
            if (updateInfo.box) {
                debug('Starting autoupdate to %j', updateInfo.box);
                cloudron.update(updateInfo.box, NOOP_CALLBACK);
            } else if (updateInfo.apps) {
                debug('Starting app update to %j', updateInfo.apps);
                apps.autoupdateApps(updateInfo.apps, NOOP_CALLBACK);
            } else {
                debug('No auto updates available');
            }
        },
        start: true,
        timeZone: gBoxUpdateCheckerJob.cronTime.zone // hack
    });
}

function uninitialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (!gInitialized) return callback();

    if (gAutoupdaterJob) gAutoupdaterJob.stop();
    gAutoupdaterJob = null;

    gBoxUpdateCheckerJob.stop();
    gBoxUpdateCheckerJob = null;

    gAppUpdateCheckerJob.stop();
    gAppUpdateCheckerJob = null;

    gHeartbeatJob.stop();
    gHeartbeatJob = null;

    gBackupJob.stop();
    gBackupJob = null;

    gCleanupTokensJob.stop();
    gCleanupTokensJob = null;

    gDockerVolumeCleanerJob.stop();
    gDockerVolumeCleanerJob = null;

    gSchedulerSyncJob.stop();
    gSchedulerSyncJob = null;

    gInitialized = false;

    callback();
}
