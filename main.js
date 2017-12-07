'use babel';
'use strict';

var babel = require('babel/register'),
    fs = require('fs'),
    app = require('app'),
    Q = require('q'),
    _ = require('lodash'),
    ipc = require('ipc'),
    shell = require('shell'),
    dialog = require('dialog'),
    path = require('path'),
    BrowserWindow = require('browser-window'); // Module to create native browser window.

global.Q = Q;
global._ = _;
global.LOG_LEVEL = 888;
global.LOG_REGISTRY = new Set();

var Migrate = require('./lib/jobs/Migrate'),
    Logger = require('./lib/util/Logger'),
    ClientServerBinding = require('./lib/ClientServerBinding'),
    store = require('./lib/util/global-store');

global.Logger = Logger;

global.quiet = Logger.verbosity.bind(Logger, Logger.NONE);
global.loud = Logger.verbosity.bind(Logger, Logger.ALL);

var mainWindow = null, migrateApp, ipcBinding,
    log = new Logger('main');

global._unhandledErrors = [];
Q.onerror = function (err) {
  log.error('Unhandled Promise Error', err);
  global._unhandledErrors.push(err);
};

// TODO should datastore get saved on close before exit?
// Quit when all windows are closed.
app.on('window-all-closed', function() {
  migrateApp.end();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});


// This method will be called when atom-shell has done everything
// initialization and ready for creating browser windows.
app.on('ready', function() {
  var config = {},
      configPath = '../config.json';

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      log.info('config file loaded. VERSION: ' + config.version);
    } catch (err) {
      log.error('error loading config.json', err);
    }
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({width: 1200, height: 800});
  global.mainWindow = mainWindow;

  // and load the index.html of the app.
  mainWindow.loadUrl(path.join('file://', __dirname, '/static/index.html'));

  // Emitted when the window is closed.
  mainWindow.on('closed', function() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
    ipcBinding.unbind();
    app.quit();
  });

  mainWindow.on('close', function () {
    console.log('unbinding IPC');
    ipcBinding.unbind();
  });

  mainWindow.webContents.on('did-finish-load', function() {
    log.info('binding IPC');

    ipcBinding = new ClientServerBinding(migrateApp, ipc, mainWindow.webContents.send.bind(mainWindow.webContents));

    var serverSend = global.serverSend = ipcBinding.getServerSend();

    if (config.debugMode) {
      ipcBinding.loggingEnabled = true;
    }

    global.ipcBinding = ipcBinding;

    serverSend('config', config);

  });

  migrateApp = new Migrate(config);

  global.migrateApp = migrateApp;
  store.set('migrateApp', migrateApp);

  migrateApp.on('debugMode', function (isEnabled) {
    if (ipcBinding) ipcBinding.loggingEnabled = isEnabled;

    if (isEnabled) {
      mainWindow.openDevTools();
    } else {
      mainWindow.closeDevTools();
    }

  });

  migrateApp.on('progress', function (stats) {
    mainWindow.setProgressBar(stats.progress);
  });

  migrateApp.openFolderDialog = function () {
    var deferred = Q.defer(),
        options = {
          title: 'Choose Output Folder',
          properties: [ 'openDirectory']
        };

    try {
      dialog.showOpenDialog(mainWindow, options, function (result) {
        if (Array.isArray(result)) {
          result = result[0];
        }
        if (result) {
          deferred.resolve(result);
        } else {
          deferred.reject('Cancelled');
        }
      });
    } catch (err) {
      deferred.reject(err);
    }

    return deferred.promise;

  };

  migrateApp.showExportFolder = function () {
    var folder = migrateApp.config.db.folder,
        filename = migrateApp.config.db.contentFilename,
        outputFile = path.resolve(folder, filename);
    mainWindow.setProgressBar(1.0);
    try {
      shell.showItemInFolder(outputFile);
      return Q.resolve(outputFile);
    } catch (err) {
      log.error('unable to show output file on system ' + outputFile, err);
      return Q.reject(err);
    }

  };

});
