const os = require('os');
const assert = require('assert');

const FILE_CLIENT_LIST = 'OpenVPN CLIENT LIST';
const FILE_ROUTING_TABLE = 'ROUTING TABLE';
const FILE_GLOBAL_STATUS = 'GLOBAL STATS';
const FILE_END = 'END';

// array of all file headings
const FILE_HEADERS = [
	FILE_CLIENT_LIST,
	FILE_ROUTING_TABLE,
	FILE_GLOBAL_STATUS,
	FILE_END
];

// milliseconds to seconds
const msToSec = (ms) => Math.round(ms / 1000);

/**
* Class for reading and parsing the OpenVPN Status file.
*/
class OpenVPNStatus
{
	/**
	* Processes CLIENT LIST lines.
	*/
	static clientListLine(line)
	{
		const segments = line.split(',');
		if(segments.length != 5) {
			// should be 5 long.
			return null;
		}

		if(
			segments[0] === 'Common Name' &&
			segments[1] === 'Real Address' &&
			segments[2] === 'Bytes Received' &&
			segments[3] === 'Bytes Sent' &&
			segments[4] === 'Connected Since'
		) {
			// CSV header
			return null;
		}

		return {
			commonName: segments[0],
			realAddress: segments[1],
			bytesReceived: parseInt(segments[2]),
			bytesSend: parseInt(segments[3]),
			connectedSince: msToSec(Date.parse(segments[4]))
		};
	}

	/**
	* Processing ROUTING TABLE line
	*/
	static routingTableLine(line)
	{
		const segments = line.split(',');
		if(segments.length != 4) {
			// should be 4 long.
			return null;
		}

		if(
			segments[0] === 'Virtual Address' &&
			segments[1] === 'Common Name' &&
			segments[2] === 'Real Address' &&
			segments[3] === 'Last Ref'
		) {
			// CSV header
			return null;
		}

		return {
			virtualAddress: segments[0],
			commonName: segments[1],
			realAddress: segments[2],
			lastRef: msToSec(Date.parse(segments[3]))
		};
	}

	/**
	* PArses OpenVPN Status file
	* @param string content File content
	*/
	static async parse(content)
	{
		assert(typeof content === 'string');

		const lines = content.split(os.EOL);
		if(lines.length <= 8) {
			// File is 8 lines, only including placeholder data
			return false;
		}

		if(lines[0] !== FILE_CLIENT_LIST) {
			return false;
		}

		let returnData = {};
		let currentFileHeader = null;// Type of row we are parsing

		for(let rowIndex = 0; rowIndex < lines.length; rowIndex++) {
			// Setting the current file header we are parsing
			const possibleFileHeader = FILE_HEADERS.indexOf(lines[rowIndex]);
			if(possibleFileHeader >= 0) {
				currentFileHeader = FILE_HEADERS[possibleFileHeader];
				continue;
			}

			if(currentFileHeader === null) {
				// Invalid syntax of file
				return false;
			}

			switch (currentFileHeader) {
				case FILE_CLIENT_LIST: {
					const lineParsed = OpenVPNStatus.clientListLine(lines[rowIndex]);
					if(lineParsed) {
						returnData[lineParsed.commonName] = lineParsed;
					}
					break;
				}

				case FILE_ROUTING_TABLE: {
					// Only additional information this table holds is the Virual Address
					// and Last Ref. For this reason, we will push the table of router
					// to the client list, merge them into a singular list with the
					// common attribute being Common Name. Should be noted, this doesn't
					// accuont for multiple clients connected under the same name. But
					// it doess not matter as we do not permit user to connect to same
					// server.
					const lineParsed = OpenVPNStatus.routingTableLine(lines[rowIndex]);
					if(lineParsed) {
						returnData[lineParsed.commonName] = Object.assign(
							returnData[lineParsed.commonName],
							lineParsed
						);
					}
					break;
				}

				case FILE_GLOBAL_STATUS: {
					// Ignored
					break;
				}

				default:
					break;
			}

		}
		return returnData;
	}
}

module.exports = OpenVPNStatus;
