/*
 * Copyright (c) 2012, Joyent, Inc. All rights reserved.
 *
 * Starts up an HTTP server and adds a route where a server allocation can be
 * requested. It validates the request, then passes it on to an algorithm
 * pipeline to filter down the servers to the most suitable server to fulfill
 * the request.
 */



var assert = require('assert');
var restify = require('restify');
var Logger = require('bunyan');
var util = require('util');
var path = require('path');
var algorithms = require('./algorithms');



var UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
var ALGORITHMS_PATH = './algorithms/';
var DEFAULT_ALGORITHMS = [ 'hard-filter-min-ram', 'hard-filter-running',
                           'hard-filter-setup', 'hard-filter-reserved',
                           'hard-filter-vlans', 'soft-filter-recent-servers',
                           'sort-2adic', 'pick-weighted-random' ];



/*
 * HTTP constructor
 */
function HTTP(options) {
    this.config = options;
    this.algorithms = [];
    this.log = null;
    this.server = null;

    this._init();
}



/*
 * HTTP init code. Connects HTTP routes, loads algorithm pipeline, and starts up
 * HTTP server.
 *
 * Will throw exception when config is bad
 */
HTTP.prototype._init =
function () {
    var self = this;

    self.log = new Logger({
        name: 'dapi',
        level: self.config.logLevel,
        serializers: {
            err: Logger.stdSerializers.err,
            req: Logger.stdSerializers.req,
            res: restify.bunyan.serializers.response
        }
    });

    self.server = restify.createServer({
        name: 'Designation API',
        log: self.log,
        version: self.config.version,
        serverName: 'SmartDataCenter',
        accept: ['text/plain',
                 'application/json',
                 'text/html',
                 'image/png',
                 'text/css'],
        contentWriters: {
            'text/plain': function (obj) {
                if (!obj)
                    return '';
                if (typeof (obj) === 'string')
                    return obj;
                return JSON.stringify(obj, null, 2);
            }
        }
    });

    self.server.on('after', restify.auditLogger({log: self.log, body: true}));
    self.server.on('uncaughtException', function (req, res, route, error) {
        req.log.info({
            err: error,
            url: req.url,
            params: req.params
        });

        res.send(new restify.InternalError('Internal Server Error'));
    });

    self._loadAlgorithms();
    self._setMiddleware();
    self._setRoutes();
};



/*
 * Sets custom middlewares to use for the API
 */
HTTP.prototype._setMiddleware =
function () {
    this.server.use(restify.acceptParser(this.server.acceptable));
    this.server.use(restify.bodyParser());
    this.server.use(restify.queryParser());
};



/*
 * Sets all routes for the HTTP server
 */
HTTP.prototype._setRoutes =
function () {
    var self = this;

    function addProxies(req, res, next) {
        req.config = self.config;
        req.algorithms = self.algorithms;

        return next();
    }

    var before = [
        addProxies
    ];

    self.server.post({ path: '/allocation', name: 'Allocation'},
                     before,
                     self._validateVmPayload,
                     self._validateServers,
                     self._allocate);
};



/*
 * Loads all algorithms listed in the config file. If no algorithms is listed
 * then a default algorithm pipeline will be used.
 */
HTTP.prototype._loadAlgorithms =
function () {
    var self = this;

    var algorithmFiles = self.config.algorithms;
    if (!algorithmFiles) {
        self.log.info('No algorithms listed, using defaults');
        algorithmFiles = DEFAULT_ALGORITHMS;
    }

    for (var i = 0; i < algorithmFiles.length; i++) {
        var fileName = algorithmFiles[i];
        var algorithm = self._loadAlgorithm(fileName);

        if (algorithm)
            self.algorithms.push(algorithm);
    }

    if (!self.algorithms.length) {
        self.log.error('No valid algorithms found');
        process.exit(1);
    } else {
        var algoNames = self.algorithms.map(function (algo) {
            return algo.name;
        });

        self.log.info('Loaded the following algorithms: ', algoNames);
    }
};



/*
 * Load an algorithm from a file. Return the algorithm if valid.
 */
HTTP.prototype._loadAlgorithm =
function (fileName) {
    var self = this;
    var algoPath = ALGORITHMS_PATH + fileName;

    try {
        var algorithm = require(algoPath);
    } catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND')
            throw (e);

        self.log.error('Algorithm not found: ', algoPath);
        return null;
    }

    if (!algorithm.run || typeof (algorithm.run) !== 'function') {
        /* JSSTYLED */
        self.log.error("Algorithm '%s' does not have a run function", fileName);
        return null;
    } else if (!algorithm.name || typeof (algorithm.name) != 'string') {
        /* JSSTYLED */
        self.log.error("Algorithm '%s' does not have a name", fileName);
        return null;
    } else {
        /* JSSTYLED */
        self.log.info("Algorithm '%s' has been loaded", fileName);
        return algorithm;
    }
};



/*
 * Validates the 'vm' payload parameter for correct JSON required properties
 */
HTTP.prototype._validateVmPayload =
function (req, res, next) {
    req.log.trace('validateVmPayload start');

    var vm = req.params.vm;

    if (!vm)
        return next(new restify.MissingParameterError('\'vm\' is required'));

    try {
        validVm(vm);
    } catch (err) {
        return next(err);
    }

    req.vm = vm;
    return next();
};



/*
 * Validates the servers parameter for correct JSON required properties
 */
HTTP.prototype._validateServers =
function (req, res, next) {
    req.log.trace('validateServers start');

    var validServers = [];
    var servers = req.params.servers;

    if (!servers) {
        return next(
            new restify.MissingParameterError('\'servers\' are required'));
    }

    if (!Array.isArray(servers)) {
        return next(
        new restify.MissingParameterError('\'servers\' input is not an array'));
    }

    if (servers.length === 0) {
        return next(
            new restify.MissingParameterError('\'servers\' array is empty'));
    }

    for (var i = 0; i < servers.length; i++) {
        var server = servers[i];
        try {
            if (validServer(server))
                validServers.push(server);
        } catch (err) {
            return next(err);
        }
    }

    if (!validServers.length) {
        return next(
            new restify.InvalidArgumentError('No valid \'servers\' found'));
    }

    req.servers = validServers;
    return next();
};



/*
 * Given the request details, returns an appropriate server which the VM should
 * be allocated to.
 */
HTTP.prototype._allocate =
function (req, res, next) {
    req.log.trace('Allocation start');

    var vm = req.params.vm;
    var server = algorithms.allocate(req.log, req.algorithms, req.servers,
                                     vm.ram, vm.nic_tags);

    if (!server) {
        return next(
            new restify.
                InvalidArgumentError('No allocatable \'servers\' found'));
    }

    res.send(server);
    return next();
};



/*
 * Validates if server is a valid server object.
 * Pretty simple validation at the moment: just check for ram and UUID.
 *
 * uuid: 564d89c4-e368-1a0b-564f-b8a33f47c134
 * hostname: headnode
 * memory_total_bytes: 2943930368
 * memory_available_bytes: 1544368128
 * reserved: true
 * cpucores: 2
 * os: 20120319T230411Z
 * cpuvirtualization: none
 * status: running
 * headnode: true
 */
function validServer(server) {
    assert.ok(server);

    if (!server.uuid)
        throw new restify.MissingParameterError('Server does not have a UUID');

    if (!UUID_RE.test(server.uuid))
        throw new restify.InvalidArgumentError('Server does not have ' +
                                               'a valid UUID');

    if (!server['memory_available_bytes'])
        return false;

    if (!server['memory_total_bytes'])
        return false;

    if (server['reserved'] === true || server['reserved'] === 'true')
        return false;

    if (server['setup'] !== true && server['setup'] !== 'true')
        return false;

    return true;
}



/*
 * Validates if a vm is a valid vm object.
 * Pretty simple validation at the moment: just check for ram.
 */
function validVm(vm) {
    assert.ok(vm);

    if (!vm.ram) {
        throw new restify.MissingParameterError(
            /* JSSTYLED */
            "'ram' attribute not present in 'vm' payload");
    }

    return true;
}



/*
 * Starts listening on the port given specified by config.api.port.
 */
HTTP.prototype.listen =
function (callback) {
    var self = this;

    self.server.listen(this.config.api.port, '0.0.0.0', function () {
        self.log.info({ url: self.server.url },
                      '%s listening', self.server.name);

        if (callback)
            callback();

        return;
    });
};



module.exports = HTTP;