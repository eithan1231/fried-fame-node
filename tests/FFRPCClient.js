const assert = require('assert');
const os = require('os');
const FFRPCClient = require('../library/FFRPCClient');

describe('FFRPCClient', function() {
	describe('#getRpcByType', function() {
		it('should return an FFRPCClient object', async function() {
			try {
				const res = await FFRPCClient.getRpcByType(FFRPCClient.TYPE_BACKEND);
				assert(res instanceof FFRPCClient);
			}
			catch(err) {
				throw err;
			}
		});
	});
});
