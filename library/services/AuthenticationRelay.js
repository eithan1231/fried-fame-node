const EventEmitter = require('events');
const process = require('process');

const Koa = require('koa');
const KoaBodyParser = require('koa-bodyparser');

const FFRPCClient = require('../FFRPCClient');


class AuthenticationRelay extends EventEmitter
{
	constructor(opts)
	{
		super();

		opts = opts || { };
		this.logger = opts.logger || console;

		this.server = null;// underlying server.
		this.app = new Koa();
		this.app.proxy = false;
		this._setupMiddleware();
	}

	/**
	* Starts authentication relay
	*/
	start()
	{
		this.logger.info(`AuthenticationRelay is starting... port ${process.env.RELAY_PORT}`);
		this.server = this.app.listen(process.env.RELAY_PORT);

		// Server shutdown even is here, cuz if we call it when we do call the clsoe
		// bethod it will result in an edgecase where the closed event wont be called
		// on unexpected closures.
		this.server.addListener('close', this._closeEvent.bind(this));
	}

	/**
	* Closes authetnication relay.
	*/
	close()
	{
		this.server.close();
	}

	/**
	* Event that is invoked whenever the server closes.
	*/
	_closeEvent()
	{
		this.logger.info(`AuthenticationRelay has closed.`);
		this.emit('close')
	}

	_setupMiddleware()
	{
		this.app.use(KoaBodyParser());

		this.app.use(this._middlewareAuthorize.bind(this));
		this.app.use(this._middlewareRelay.bind(this));
	}

	/**
	* Middleware for Authorizting the request. Valdiates its from a genuind source.
	*/
	async _middlewareAuthorize(ctx, next)
	{
		const permittedAddresses = [
			'127.0.0.1',
			'::1'
		];

		if(permittedAddresses.includes(ctx.request.ip)) {
			this.logger.info(`AuthenticationRelay relay authorize request from ${ctx.request.ip} passed`);
			await next();
		}
		else {
			this.logger.info(`AuthenticationRelay relay authorize request from ${ctx.request.ip} failed`);
			return ctx.status = 401;
		}
	}

	/**
	* Middleware for handling the relay of the reuqest.
	**/
	async _middlewareRelay(ctx, next)
	{
		try {
			if(
				typeof ctx.request.body != 'object' ||
				typeof ctx.request.body.username === 'undefined' ||
				typeof ctx.request.body.password !== 'string'
			) {
				this.logger.info(`AuthenticationRelay relay request for ${ctx.request.ip} bad request body`);
				return ctx.status = 401;
			}

			// logging permit attempt with username
			this.logger.info(`AuthenticationRelay relay request for ${ctx.request.body.username} started`);

			// FFRPC authentication request
			const ffrpc = await FFRPCClient.getRpcByType(FFRPCClient.TYPE_BACKEND);
			const paramNode = parseInt(process.env.NODE_ID);
			const authResult = await ffrpc.do('node-authentication', {
				node: paramNode,
				username: ctx.request.body.username,
				password: ctx.request.body.password
			});

			this.logger.info(`AuthenticationRelay relay request for ${ctx.request.body.username} ${authResult.permitConnection ? 'allowed' : 'denied'} ${authResult.reason}`);
			return ctx.status = (authResult.permitConnection
				? 200
				: 401
			);
		}
		catch(err) {
			throw err;
		}
	}
}

module.exports = AuthenticationRelay;
