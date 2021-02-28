const assert = require('assert');
const os = require('os');
const OpenVPNStatus = require('../library/OpenVPNStatus');

// messy... yes, but functional and accounts for EOL on all OS's
const validParseData = (
	`OpenVPN CLIENT LIST` + os.EOL +
	`Updated,Thu Feb 11 06:46:05 2021` + os.EOL +
	`Common Name,Real Address,Bytes Received,Bytes Sent,Connected Since` + os.EOL +
	`cname,192.168.1.1:50318,10371,2688,Thu Feb 11 06:45:56 2021` + os.EOL +
	`ROUTING TABLE` + os.EOL +
	`Virtual Address,Common Name,Real Address,Last Ref` + os.EOL +
	`10.8.0.2,cname,192.168.1.1:50318,Thu Feb 11 06:45:56 2021` + os.EOL +
	`GLOBAL STATS` + os.EOL +
	`Max bcast/mcast queue length,0` + os.EOL +
	`END` + os.EOL
);

describe('OpenVPNStatus', function() {

	/**
	* CLIENT LIST line parser
	**/
	describe('#clientListLine', function() {
		it('should return null when CSV length is not equal to 5', function() {
			assert(OpenVPNStatus.clientListLine('i am invalid,still invalid') === null);
		});

		it('should return null when CSV header is passed', function() {
			assert(OpenVPNStatus.clientListLine(
				'Common Name,Real Address,Bytes Received,Bytes Sent,Connected Since'
			) === null);
		});

		it('should return object with valid keys when valid CSV passed', function() {
			const parsed = OpenVPNStatus.clientListLine(
				'Test Name,127.0.0.1,2323,4444,Thu Feb 11 06:45:56 2021'
			);

			assert(typeof parsed === 'object');
			assert(parsed.commonName === 'Test Name');
			assert(parsed.realAddress === '127.0.0.1');
			assert(parsed.bytesReceived === 2323);
			assert(parsed.bytesSend === 4444);
			assert(parsed.connectedSince === 1612986356);
		});
	});

	/**
	* ROUTING TABLE line parser
	*/
	describe('#routingTableLine', function() {
		it('should return null when CSV length is not equal to 4', function() {
			assert(OpenVPNStatus.routingTableLine('i am invalid,still invalid') === null);
		});

		it('should return null when CSV header is passed', function() {
			assert(OpenVPNStatus.routingTableLine(
				'Virtual Address,Common Name,Real Address,Last Ref'
			) === null);
		});

		it('should return object with valid keys when valid CSV passed', function() {
			const parsed = OpenVPNStatus.routingTableLine(
				'v-addr,name,r-addr,Thu Feb 11 06:45:56 2021'
			);

			assert(typeof parsed === 'object');
			assert(parsed.virtualAddress === 'v-addr');
			assert(parsed.commonName === 'name');
			assert(parsed.realAddress === 'r-addr');
			assert(parsed.lastRef === 1612986356);
		});
	});

	/**
	* Primary parsing function
	*/
	describe('#parse', function() {
		it('should return false when line length is below or equal to 8', async function() {
			const parsed = await OpenVPNStatus.parse(`line1${os.EOL}line2`);
			assert(parsed === false);
		});

		it('should return false when first line is not \'OpenVPN CLIENT LIST\', and there are more than 8 lines', async function() {
			const parsed = await OpenVPNStatus.parse(`invalid first line${os.EOL}${os.EOL}${os.EOL}${os.EOL}${os.EOL}${os.EOL}${os.EOL}${os.EOL}${os.EOL}${os.EOL}${os.EOL}`);
			assert(parsed === false);
		});

		it('should return a valid parsed object with populated object keys', async function() {
			const parsed = await OpenVPNStatus.parse(validParseData);
			assert(typeof parsed === 'object');
			assert(typeof parsed['cname'] === 'object');
			assert(parsed['cname'].commonName === 'cname');
			assert(parsed['cname'].realAddress === '192.168.1.1:50318');
			assert(parsed['cname'].bytesReceived === 10371);
			assert(parsed['cname'].bytesSend === 2688);
			assert(parsed['cname'].connectedSince === 1612986356);
			assert(parsed['cname'].virtualAddress === '10.8.0.2');
			assert(parsed['cname'].lastRef === 1612986356);
		});
	});
});
