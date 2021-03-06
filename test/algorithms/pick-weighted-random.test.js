/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var picker = require('../../lib/algorithms/pick-weighted-random.js');

var log = {
	trace: function () { return (true); },
	debug: function () { return (true); }
};

exports.pickWeightedRandom_with_many_servers = function (t)
{
	var numServers = 100;
	var weightRatio = 0.05;
	var iterPerServer = 60;
	var selectedServerRange = numServers * weightRatio;
	var givenServers = [];
	var constraints = {};
	var pickedServers = [];
	var iterations;

	for (var i = 0; i !== numServers; i++) {
		/*
		 * note that we're just using 'index' here to keep track of
		 * which server is which
		 */
		givenServers[i] = { index: i };
	}

	iterations = numServers * weightRatio * iterPerServer;
	for (i = 0; i != iterations; i++) {
		var state = {};
		var results = picker.run(log, state, givenServers, constraints);
		var servers = results[0];
		var reasons = results[1];
		var index;

		t.equal(servers.length, 1);
		t.deepEqual(state, {});
		t.deepEqual(reasons, undefined);

		index = servers[0].index;
		pickedServers[index] = true;

		t.ok(index !== null);
		t.ok(index >= 0 && index <= selectedServerRange);
	}

	for (i = 0; i !== selectedServerRange; i++)
		t.ok(pickedServers[i]);

	for (i = selectedServerRange; i !== numServers; i++)
		t.ok(!pickedServers[i]);

	t.done();
};

exports.pickWeightedRandom_with_one_server = function (t)
{
	var givenServers = [ { memory_available_bytes: 256 } ];
	var constraints = {};

	for (var i = 0; i != 60; i++) {
		var state = {};

		var results = picker.run(log, state, givenServers, constraints);
		var pickedServers = results[0];
		var reasons = results[1];

		t.equal(pickedServers.length, 1);
		t.deepEqual(pickedServers[0], givenServers[0]);
		t.deepEqual(state, {});
		t.deepEqual(reasons, undefined);
	}

	t.done();
};

exports.pickWeightedRandom_with_no_servers = function (t)
{
	var servers = [];
	var constraints = {};

	for (var i = 0; i != 60; i++) {
		var state = {};

		var results = picker.run(log, state, servers, constraints);
		var pickedServers = results[0];
		var reasons = results[1];

		t.deepEqual(pickedServers, []);
		t.deepEqual(state, {});
		t.deepEqual(reasons, undefined);
	}

	t.done();
};

exports.name = function (t)
{
	t.ok(typeof (picker.name) === 'string');
	t.done();
};
