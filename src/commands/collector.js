const Argument = require('./argument');

/** Obtains, validates, and prompts for argument values */
class ArgumentCollector {
	/**
	 * @param {CommandoClient} client - Client the collector will use
	 * @param {ArgumentInfo[]} args - Arguments for the collector
	 * @param {number} [promptLimit=Infinity] - Maximum number of times to prompt for a single argument
	 */
	constructor(client, args, promptLimit = Infinity) {
		if (!client) throw new TypeError('Collector client must be specified.');
		if (!args || !Array.isArray(args)) throw new TypeError('Collector args must be an Array.');
		if (promptLimit === null) promptLimit = Infinity;

		Object.defineProperty(this, 'client', { value: client });

		/**
		 * Client this collector is for
		 * @type {CommandoClient}
		 * @readonly
		 */
		this.client;

		/**
		 * Arguments the collector handles
		 * @type {Argument[]}
		 */
		this.args = new Array(args.length);

		let hasInfinite = false;
		let hasOptional = false;
		for (let i = 0; i < args.length; i++) {
			if (hasInfinite) throw new Error('No other argument may come after an infinite argument.');
			if (args[i].default !== null) hasOptional = true;
			else if (hasOptional) throw new Error('Required arguments may not come after optional arguments.');
			this.args[i] = new Argument(this.client, args[i]);
			if (this.args[i].infinite) hasInfinite = true;
		}

		/**
		 * Maximum number of times to prompt for a single argument
		 * @type {number}
		 */
		this.promptLimit = promptLimit;
	}

	/**
	 * Result object from obtaining argument values from an {@link ArgumentCollector}
	 * @typedef {Object} ArgumentCollectorResult
	 * @property {?Object} values - Final values for the arguments, mapped by their keys
	 * @property {?string} cancelled - One of:
	 * - `user` (user cancelled)
	 * - `time` (wait time exceeded)
	 * - `promptLimit` (prompt limit exceeded)
	 * @property {Message[]} prompts - All messages that were sent to prompt the user
	 * @property {Message[]} answers - All of the user's messages that answered a prompt
	 */

	/**
	 * Obtains values for the arguments, prompting if necessary.
	 * @param {CommandoMessage} msg - Message that the collector is being triggered by
	 * @param {Array<*>} [provided=[]] - Values that are already available
	 * @param {number} [promptLimit=this.promptLimit] - Maximum number of times to prompt for a single argument
	 * @return {Promise<ArgumentCollectorResult>}
	 */
	async obtain(msg, provided = [], promptLimit = this.promptLimit) {
		const { author, channelId } = msg;
		const { dispatcher } = this.client;
		const { args } = this;
		const id = author.id + channelId;

		dispatcher._awaiting.add(id);
		const values = {};
		const results = [];

		try {
			for (let i = 0; i < args.length; i++) {
				const arg = args[i];
				const result = await arg.obtain(msg, arg.infinite ? provided.slice(i) : provided[i], promptLimit);
				results.push(result);

				if (result.cancelled) {
					dispatcher._awaiting.delete(id);
					return {
						values: null,
						cancelled: result.cancelled,
						prompts: results.map(res => res.prompts),
						answers: results.map(res => res.answers)
					};
				}

				values[arg.key] = result.value;
			}
		} catch (err) {
			dispatcher._awaiting.delete(id);
			throw err;
		}

		dispatcher._awaiting.delete(id);
		return {
			values,
			cancelled: null,
			prompts: results.map(res => res.prompts),
			answers: results.map(res => res.answers)
		};
	}
}

module.exports = ArgumentCollector;
