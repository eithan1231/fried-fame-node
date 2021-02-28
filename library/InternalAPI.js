const assert = require('assert');
const fetch = require('node-fetch');
const querystring = require('querystring');
const process = require('process');

const URL_SCHEME = (process.env.INTERNAL_API_ENDPOINT_SECURE === 'true' ? 'https' : 'http');
const URL_HOSTNAME = process.env.INTERNAL_API_ENDPOINT;
const URL_PATH_PREFIX = process.env.INTERNAL_API_PATH_PREFIX;
const URL_BASE = `${URL_SCHEME}://${URL_HOSTNAME}${URL_PATH_PREFIX}/internal-api/`;

// Be sure to update test when doing this.
const DEFAULT_OPTIONS = { queryString: null };

/**
* Internal API
*/
class InternalAPI
{
	/**
	* Processes options for all options parameters
	*/
	static processOptions(options = {})
	{
		options = Object.assign(DEFAULT_OPTIONS, options);

		if(
			typeof options.queryString === 'object' &&
			options.queryString !== null // null is an object
		) {
			options.queryString = querystring.stringify(options.queryString);
		}

		return options;
	}

	/**
	* InternalAPI POST request
	* @param path Path of request
	* @param body body of post request (ensure type is object)
	* @param options Options.
	*		options.queryString null to ignore, string for raw qs, object with key/value
	*/
	static async post(path, body, options = {})
	{
		try {
			assert(typeof path === 'string');
			assert(typeof body === 'object');
			assert(typeof options === 'object');

			// parsing options
			options = InternalAPI.processOptions(options);

			// building post request
			const response = await fetch(`${URL_BASE}${path}?${options.queryString}`, {
				method: 'POST',
				body: JSON.stringify(body),
				headers: {
					'token': process.env.INTERNAL_API_TOKEN,
					'content-type': 'application/json'
				}
			});

			// checking response status
			if(!response.ok) {
				throw new Error(response.statusText);
			}

			if(response.headers.get('content-type') === 'application/json') {
				// getting json response
				return await reesponse.json();
			}
			else {
				return response.ok;
			}
		}
		catch(err) {
			throw err;
		}
	}

	/**
	* InternalAPI GET request
	* @param path Path of request
	* @param options Options. See above for more.
	*/
	static async get(path, options = {})
	{
		try {
			assert(typeof path === 'string');
			assert(typeof options === 'object');

			// parsing options
			options = InternalAPI.processOptions(options);

			// getting get request
			const response = await fetch(`${URL_BASE}${path}?${options.queryString}`, {
				method: 'GET',
				headers: {
					'token': process.env.INTERNAL_API_TOKEN,
				}
			});

			// checking response status
			if(!response.ok) {
				throw new Error(`HTTP Error: ${response.statusText}`);
			}

			if(response.headers.get('content-type') === 'application/json') {
				// getting json response
				return await response.json();
			}
			else {
				return response.ok;
			}
		}
		catch(err) {
			throw err;
		}
	}
}

module.exports = InternalAPI;
