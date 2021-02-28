const assert = require('assert');
const os = require('os');
const InternalAPI = require('../library/InternalAPI');

describe('InternalAPI', function() {

	describe('#processOptions', function() {
		it('should return object with null queryString key on no parameters', function() {
			const obj = InternalAPI.processOptions();
			assert(obj.queryString === null);
		});

		it('should parse queryString parameter into object', function() {
			const obj = InternalAPI.processOptions({
				queryString: { eithan: 'god' }
			});

			assert(typeof obj.queryString === 'string');
			assert(obj.queryString === 'eithan=god');
		});
	});

	describe('#get', function() {
		it('should return list of ffrpc services (.ENV -> INTERNAL_API_x needs to be configured)', async function() {
			try {
				const res = await InternalAPI.get('ffrpc/list');
				assert(typeof res == 'object');
			}
			catch(err) {
				throw err;
			}
		});
	});
});
