#!/usr/bin/env node

const path = require('path');
const chalk = require('chalk');             // colorize input
const clearTerminal = require('clear');     // clear terminal
const figlet = require('figlet');           // ascii art
const flatten = require('flat');
const configstore = require('configstore'); // easily loads and saves config without you having to think about where and how
const clui = require('clui');               // draws command-line tables, gauges and spinners
const inquirer = require('inquirer');
const minimist = require('minimist');       // parses argument options

const logger = require('./lib/logger');
const findKeys = require('./lib/find-keys');
const i18next = require('./lib/i18next');
const locizeSyncConfig = require('./locize-sync-config');

const Spinner = clui.Spinner;

const run = async () => {

    var argv = minimist(process.argv.slice(2));
    const debugLevel = argv['debugLevel'] || 'info';

    init(debugLevel);
    welcome();

    const dirname = path.dirname(process.cwd()) + path.sep + path.basename(process.cwd());
    const keys = await findKeys.find(dirname)
    const langs = await i18next.fetchAvailableLanguages();
    const resources = await getResources(langs);
    const actions = await collectNonTranslatedKeyActions(keys, langs, resources);
    await addMissingTranslations(actions);
    logger.debug('and we\'re done');

};

async function getResources(langs) {

    const spinner = new clui.Spinner('Fetching resources...');
    spinner.start();

    let resources = {};
    for (const lang of Object.keys(langs)) {
        let _resourcesPerLang = await i18next.fetchNamespaceResources(lang);
        _resourcesPerLang = flatten(_resourcesPerLang);
        resources = {...resources, [lang]: _resourcesPerLang};
    }

    logger.debug('getResources - result', resources);
    spinner.stop();

    return resources;
}

async function collectNonTranslatedKeyActions(keys, langs, resources) {

    logger.debug('collectNonTranslatedKeyActions', langs)

    let actions = Object.keys(langs).reduce((res, key) => ({...res, [key]: {}}), {});
    for (const key of keys) {
        for (const lang of Object.keys(langs)) {
            const translation = resources[lang][key];
            if (!translation) {
                const answer = await handleNonTranslatedKey(key, langs[lang]);
                const entry = Object.entries(answer)[0];
                const value = entry[1];
                if (!!value) {
                    const key = entry[0].replace(/\*/g, '.');
                    actions = {...actions, [lang]: {...actions[lang], [key]: value}};
                }
            }
        }
    }

    logger.debug('collectNonTranslatedKeyActions - result:', actions);

    return actions;
}

function handleNonTranslatedKey(key, lang) {

    const question = {
        name: key.replace(/\./g, '*'),
        message: `How would you translate ${key} in ${lang.name}? (leave empty to skip)`,
    };

    logger.debug('question', question);

    return inquirer
        .prompt([
            question
        ]);

}

async function addMissingTranslations(actions) {

    logger.debug('addMissingTranslations');
    const spinner = new clui.Spinner('Saving translations...');
    spinner.start();

    for (lang of Object.keys(actions)) {
        const _actions = actions[lang];
        if (Object.keys(_actions).length === 0) {
            continue;
        }

        try {
            await i18next.addMissingTranslations(lang, _actions);
        } catch (e) {
            const message = e.message || 'sth went wrong'
            logger.error(message);
        }
    }

    spinner.stop();

}

run();

function init(logLevel) {
    logger.debugLevel = logLevel;
    logger.debug('config', locizeSyncConfig);
    findKeys.config = locizeSyncConfig.findKeys;
    i18next.config = locizeSyncConfig.locize;
}

function welcome() {
    clearTerminal();
    console.log(chalk.blue('here we go'));
}
