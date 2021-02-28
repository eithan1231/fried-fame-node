const EventEmitter = require('events');
const process = require('process');
const fs = require('fs');
const fsPromises = require('fs/promises');

const OpenVPNStatus = require('../OpenVPNStatus');
const FFRPCClient = require('../FFRPCClient');


// function for awaiting timeouts
const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


// FS watch has bugs from variance in multiple kernals where it may double report
// file modifications. This basically limits one update per 100 milliseconds,
// all others will be ignores.
// NOTE: will break the event 'change'
// https://stackoverflow.com/questions/12978924/fs-watch-fired-twice-when-i-change-the-watched-file/33047844
const customWatch = (filename, opt, callback) => {
	// making opt optional. (filename[, opt], callback)
	if(typeof opt === 'function') {
		callback = opt;
		opt = {};
	}

	let lock = false;
	return fs.watch(filename, opt, (...args) => {
		if(!lock) {
			lock = true;
			callback(...args);
			setTimeout(() => lock = false, 100);
		}
	});
}


class OpenVPNMonitor extends EventEmitter
{
	constructor(opts)
	{
		super();
		this.sessions = { };
		this.watch = null;

		opts = opts || { };
		this.logger = opts.logger || console;
	}

	/**
	* Starst OpenVPN Monitor
	*/
	async start()
	{
		try {
			this.logger.info('OpenVPNMonitor is starting...');

			await this._prestartRoutine();
			await this._crashRecovery();

			this._startWatch();
			this._statusFileUpdater();// force status file to load.
			this.logger.info('OpenVPNMonitor has started');
		}
		catch(err) {
			throw err;
		}
	}

	/**
	* Closes OpenVPN Monitor
	*/
	close()
	{
		if(this.watch) {
			this.watch.close();
		}

		this.logger.info('OpenVPNMonitor has closed');
		this.emit('closed');
	}

	/**
	* Simple routine to check this monitor will start without errors.
	*/
	async _prestartRoutine()
	{
		try {
			// Attempting to access status file.
			await fsPromises.access(
				process.env.OPENVPN_STATUS_FILE,
				fs.constants.R_OK | fs.constants.W_OK
			);

			// Trying to access env NDOE_ID and validating it.
			const node = parseInt(process.env.NODE_ID);
			if(isNaN(node) || node < 1) {
				throw new Error('NODE_ID envirnment variable is invalid.');
			}
		}
		catch (err) {
			throw err;
		}
	}

	/**
	* Handles unexpected crash recovery
	*/
	async _crashRecovery()
	{
		// crash recovery needs to resynchronize state between this service and
		// the backed-api. How we will achieve this, is by getting the server
		// state and then changing it to match our state.

		try {
			this.logger.info('OpenVPNMonitor Crash Recovery - procedure starting');

			// Getting FFRPC & sending command to get connections active on this node.
			const ffrpc = await FFRPCClient.getRpcByType(FFRPCClient.TYPE_BACKEND);
			const paramNode = parseInt(process.env.NODE_ID);
			const connections = await ffrpc.do('get-node-connections', {
				node: paramNode
			});
			this.logger.debug('OpenVPNMonitor Crash Recover - backend persistent connections', connections);


			// Reading recovery content.
			const recoverySessions = await fsPromises.readFile(process.env.RECOVERY_FILE);
			const recoverySessionsParsed = JSON.parse(recoverySessions);
			this.logger.debug('OpenVPNMonitor Crash Recover - recovery persistent connections',recoverySessionsParsed);

			// Enumerating through connections persistent on the backend server, and
			// comparing them against the crash recovered sessions. Then sending
			// disconnect for all recovered sessions, and also sessions with failed
			// recovery.
			for (const connection of connections) {
				if(typeof recoverySessionsParsed[connection.user_id] === 'object') {
					// Recovery state exists
					this.logger.info(`OpenVPNMonitor Crash Recovery - sending disconnect ${connection.user_id}`);
					await this.clientDisconnected(recoverySessionsParsed[connection.user_id]);
				}
				else {
					// Recovery state does not exist
					this.logger.info(`OpenVPNMonitor Crash Recovery - local state missing, sending disconnect with fake information ${connection.user_id}`);

					// Generating a fake recovery session, as a real one does not exist
					// and we need to mark the user as disconnected some-how
					const fakeRecoverySession = {
						commonName: parseInt(connection.user_id),
						bytesReceived: parseInt(connection.data_received),
						bytesSend: parseInt(connection.data_sent),
						connectedSince: parseInt(connection.connect_date),
						lastRef: parseInt(connection.connect_date) + 60,

						// unknown
						realAddress: '',
						virtualAddress: ''
					};

					await this.clientDisconnected(fakeRecoverySession);
				}
			}
		}
		catch(err) {
			// ENOENT means no file or directory, and the only file we attempt to
			// read is the recovery state file. This means said file simply does
			// not exist, and therefore no state to recover. So we should not throw
			// errors because there is nothing to recover.
			if(err.code !== 'ENOENT') {
				throw err;
			}
		}
		finally {
			this.logger.info('OpenVPNMonitor Crash Recovery - completed');
		}
	}

	/**
	* Saves crash recovery file.
	*/
	async _crashFileSave()
	{
		try {
			const content = JSON.stringify(this.sessions);

			await fsPromises.writeFile(
				process.env.RECOVERY_FILE,
				content
			);
		}
		catch(err) {
			throw err;
		}
	}

	/**
	* Starts watching OpenVPN Status file.
	*/
	_startWatch()
	{
		this.logger.info(`OpenVPNMonitor FS watcher initiated`);
		this.watch = customWatch(process.env.OPENVPN_STATUS_FILE, this._statusFileUpdater.bind(this));
		this.watch.addListener('close', () => {
			this.logger.info(`OpenVPNMonitor FS Watcher closed`);
		});
	}

	/**
	* Handles event of whenever OpenVPN Status file updates.
	*/
	async _statusFileUpdater()
	{
		try {
			this.logger.info(`OpenVPNMonitor refreshing status file`);

			// As per the original version of this project, 'vpn-bridge', there is a bug
			// in open vpn. The bug means OpenVPN seems to not write the file all in
			// one chunk, which may mean we read half a file.
			// https://github.com/eithan1231/vpn-bridge/blob/master/library/statsnif.js#L52
			await timeout(500);

			const content = await fsPromises.readFile(process.env.OPENVPN_STATUS_FILE);
			const sessions = await OpenVPNStatus.parse(content.toString());

			await this._statusUpdated(sessions);
		}
		catch(err) {
			this.close();
			throw err;
		}
	}

	/**
	* Handles the processing of the status file whenever it has been updated,
	*/
	async _statusUpdated(sessions)
	{
		try {
			// Disconnect Event. Looking through this-sessions and seeing if there is a
			// missing entry on parameter sessions.
			for (const property in Object.keys(this.sessions)) {
				if(typeof sessions[property] === 'undefined') {
					// Disconnect event
					await this.clientDisconnected(this.sessions[property]);
				}
			}

			// Connect event. Looking through parameter sessions, and seeing if there is a
			// missing entry on this-sessions (previous sessions)
			for(const property in Object.keys(sessions)) {
				if(typeof this.sessions[property] === 'undefined') {
					// Connect event
					await this.clientConnected(sessions[property]);
				}
			}

			// Update Events.
			for (const property in Object.keys(this.sessions)) {
				if(typeof sessions[property] === 'object') {
					if(sessions[property].connectedSince > this.sessions[property].connectedSince) {
						// OpenVPN doesnt remove people from the status file after they
						// disconnect, and they remain there for several minutes. So if user
						// reconnects within that period it will simply update connectedSince.
						// So we will handle this reconnection event.
						// NOTE: Data is reset on this reconnection, this is why it is important
						// to push the disconnect before the state is reset.
						await this.clientDisconnected(this.sessions[property]);
						await this.clientConnected(sessions[property]);
					}
					else {
						// Handle possible update events.
						await this.clientUpdated(this.sessions[property]);
					}
				}
			}

			// Updating sessions object
			this.sessions = sessions;

			// Saving crash recovery file after every update.
			await this._crashFileSave();
		}
		catch(err) {
			throw err;
		}
	}

	/**
	* Client update event.
	*/
	async clientUpdated(session)
	{
		this.logger.info(`OpenVPNMonitor Client Updated ${session.commonName}`);
	}

	/**
	* Client connect event.
	*/
	async clientDisconnected(session)
	{
		try {
			this.logger.info(`OpenVPNMonitor Client Disconnected ${session.commonName}`);

			const ffrpc = await FFRPCClient.getRpcByType(FFRPCClient.TYPE_BACKEND);

			const paramUser = parseInt(session.commonName);
			const paramNode = parseInt(process.env.NODE_ID);
			const paramLocalIp = session.virtualAddress;
			const paramDataRecived = session.bytesReceived;
			const paramDataSent = session.bytesSend;
			const paramDisconnectDate = session.lastRef;

			if(isNaN(paramUser) || isNaN(paramNode)) {
				throw new Error('paramUser or paramNode is invalid');
			}

			await ffrpc.do('mark-disconnected', {
				user: paramUser,
				node: paramNode,
				localIp: paramLocalIp,
				dataReceived: paramDataRecived,
				dataSent: paramDataSent,
				disconnectDate: paramDisconnectDate
			});
		}
		catch(err) {
			throw err;
		}
	}

	/**
	* Client disconnect event.
	*/
	async clientConnected(session)
	{
		try {
			this.logger.info(`OpenVPNMonitor Client Connected ${session.commonName}`);

			const ffrpc = await FFRPCClient.getRpcByType(FFRPCClient.TYPE_BACKEND);

			const paramUser = parseInt(session.commonName);
			const paramNode = parseInt(process.env.NODE_ID);
			const paramLocalIp = session.virtualAddress;

			if(isNaN(paramUser) || isNaN(paramNode)) {
				throw new Error('paramUser or paramNode is invalid');
			}

			await ffrpc.do('mark-connected', {
				user: paramUser,
				node: paramNode,
				localIp: paramLocalIp
			});
		}
		catch(err) {
			throw err;
		}
	}
}

module.exports = OpenVPNMonitor;
