/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var sorter = require('../../lib/algorithms/sort-ram.js');

var log = {
	trace: function () { return (true); },
	debug: function () { return (true); }
};

exports.sortRam =
function (t) {
	var givenServers = [
		{ unreserved_ram: 256 },
		{ unreserved_ram: 768 },
		{ unreserved_ram: 512 }
	];

	var expectedServers = [
		{ unreserved_ram: 768 },
		{ unreserved_ram: 512 },
		{ unreserved_ram: 256 }
	];

	var state = {};
	var constraints = {};

	var results = sorter.run(log, state, givenServers, constraints);
	var sortedServers = results[0];
	var reasons = results[1];

	t.deepEqual(sortedServers, expectedServers);
	t.deepEqual(state, {});
	t.deepEqual(reasons, undefined);

	t.done();
};

exports.name = function (t)
{
	t.ok(typeof (sorter.name) === 'string');
	t.done();
};
