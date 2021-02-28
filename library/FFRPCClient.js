const assert = require('assert');
const fetch = require('node-fetch');
const querystring = require('querystring');
const InternalAPI = require('./InternalAPI');

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random#getting_a_random_integer_between_two_values
const getRandomInteger = (min, max) => {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min) + min);
}

// Gets content type value.
const getContentType = (string) => {
	// Content-Type can have encoding appending to the end, this will remove it.
	const sepPos = string.indexOf(';');
	return (sepPos > 0
		? string.substring(0, sepPos)
		: string
	);
}

const TYPE_EMAIL = 'ff-email';
const TYPE_BACKEND = 'ff-backend';

class FFRPCClient
{
	constructor(data)
	{
		assert(typeof data === 'object');

		this.id = data.id;
		this.type = data.type;
		this.authToken = data.auth_token;
		this.endpoint = data.endpoint;
		this.port = data.port;
	}

	/**
	* Gets random FFRPCClient Instance by type
	*/
	static async getRpcByType(type)
	{
		try {
			assert(typeof type === 'string');

			// TODO: Cache this.
			const rpcs = await InternalAPI.get('ffrpc/list', {
				queryString: { type }
			});

			// Random RPCs index
			const rpcIndex = getRandomInteger(0, rpcs.length - 1);

			// Creating FFRPCClient object and returning it.
			return new FFRPCClient(rpcs[rpcIndex]);
		}
		catch(err) {
			throw err;
		}
	}

	/**
	* Sends DO request to FFRPC Server
	* @param name Name of the command
	* @param parameter Payload for server
	*/
	async do(name, parameter)
	{
		try {
			assert(typeof name === 'string');
			assert(typeof parameter === 'object');

			const payload = JSON.stringify(parameter);

			const response = await fetch(`http://${this.endpoint}:${this.port}/${name}`, {
				method: 'POST',
				body: payload,
				headers: {
					'Content-Type': 'application/json',
					'Authorization': this.authToken
				}
			});

			if(!response.ok) {
				throw new Error(response.statusText);
			}

			const responseType = getContentType(response.headers.get('content-type'));
			if(responseType === 'application/json') {
				return await response.json();
			}
			else if(responseType ==='application/x-www-form-urlencoded') {
				return querystring.parse(await response.text());
			}
			else {
				return await response.text();
			}
		}
		catch(err) {
			throw err;
		}
	}
}

module.exports = FFRPCClient;
module.exports.TYPE_EMAIL = TYPE_EMAIL;
module.exports.TYPE_BACKEND = TYPE_BACKEND;
