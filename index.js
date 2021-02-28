require('dotenv').config();
const process = require('process');
const OpenVPNMonitor = require('./library/services/OpenVPNMonitor');
const AuthenticationRelay = require('./library/services/AuthenticationRelay');


// Method for handling shutdown and close events. It has a run-once method as
// when the application shuts down, this WILL be invoked several times.
const shutdown = () => {
	if(shutdown.once) return;
	shutdown.once = true;
	console.log('Shutdown procedure started');

	if(openVPNMonitor) {
		openVPNMonitor.close();
	}

	if(authenticationRelay) {
		authenticationRelay.close();
	}

	console.log('Shutdown procedure completed... allow several seconds.');
}

// Creating services
let openVPNMonitor = new OpenVPNMonitor();
let authenticationRelay = new AuthenticationRelay();

// when one shuts down, it should shut down the others.
openVPNMonitor.addListener('close', shutdown);
authenticationRelay.addListener('close', shutdown);

// Starting services
openVPNMonitor.start();
authenticationRelay.start();

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
