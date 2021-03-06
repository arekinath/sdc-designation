/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Sorts servers according to the 2adic ranking using unreserved RAM on a server
 * and the requested RAM. The returned result is in order of preference (first
 * being highest).
 *
 * 2adic ordering has some problems in non-n^2 cases, but for servers and VMs
 * that have n^2 RAM it packs the VMs so that more valuable sizes
 * (e.g. 8GiB free) are preserved longer.
 *
 * Theory: https://hub.joyent.com/wiki/display/support/Selecting+the+server+\
 * for+a+new+Zone%2C+part+II
 */

/*
 * Sorts servers by their 2adic ranking using unreserved RAM and requested RAM.
 *
 * Uses a schwarzian transform.
 *
 * We filter out servers that have less unreserved RAM that the requested RAM
 * (thus making overprovisioning RAM impossible) because 2adic ordering breaks
 * down in that case.
 */
function
sort2Adic(log, state, servers, constraints)
{
	var requestedRam = constraints.vm.ram;
	var adics;
	var sortedAdics;
	var sortedServers;

	var serversEnoughSpace = servers.filter(function (server) {
		if (server.unreserved_ram < requestedRam) {
			log.trace('Discarded %s because it was too small',
			    server.uuid);
			return (false);
		}

		return (true);
	});

	adics = serversEnoughSpace.map(function (server) {
		var unreservedRam = server.unreserved_ram;
		var hexRatio = Math.floor(unreservedRam /
		    requestedRam).toString(2);
		var adicFractional = hexRatio.split('').reverse().join('');
		var adic = +('0.' + adicFractional);

		return ([adic, server]);
	});

	sortedAdics = adics.sort(function (i, j) {
		return (j[0] - i[0]);
	});

	sortedServers = sortedAdics.map(function (adic) {
		return (adic[1]);
	});

	return ([sortedServers]);
}

module.exports = {
	name: 'Sort servers by 2adic',
	run: sort2Adic,
	affectsCapacity: false
};
