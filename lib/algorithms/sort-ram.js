/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Sorts servers by amount of unreserved RAM. Returns result ordered by
 * preference (first being highest).
 */

function
sortUnreservedRam(log, state, servers)
{
	/* shallow copy to avoid mutating order of referred array */
	servers = servers.slice(0);

	servers.sort(function (a, b) {
		return (b.unreserved_ram - a.unreserved_ram);
	});

	return ([servers]);
}

module.exports = {
	name: 'Sort servers by unreserved RAM',
	run: sortUnreservedRam,
	affectsCapacity: false
};
