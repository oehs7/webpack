/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra and Zackary Jackson @ScriptedAlchemy
*/

"use strict";

const validateOptions = require("schema-utils");
const schema = require("../../schemas/plugins/ContainerReferencePlugin.json");
const ExternalsPlugin = require("../ExternalsPlugin");
const RuntimeGlobals = require("../RuntimeGlobals");
const RemoteModule = require("./RemoteModule");
const RemoteOverrideDependency = require("./RemoteOverrideDependency");
const RemoteOverrideModuleFactory = require("./RemoteOverrideModuleFactory");
const RemoteRuntimeModule = require("./RemoteRuntimeModule");
const RemoteToExternalDependency = require("./RemoteToExternalDependency");
const RemoteToOverrideDependency = require("./RemoteToOverrideDependency");
const parseOptions = require("./parseOptions");

/** @typedef {import("../Compiler")} Compiler */

module.exports = class ContainerReferencePlugin {
	constructor(options) {
		this.remoteType = options.remoteType || "global";
		this.remotes = parseOptions(options.remotes || []);
		this.overrides = parseOptions(options.overrides || {});

		validateOptions(schema, options, {
			name: "Container Reference Plugin"
		});
		// TODO: Apply some validation around what was passed in.
	}

	/**
	 * @param {Compiler} compiler webpack compiler
	 * @returns {void}
	 */
	apply(compiler) {
		const { remotes, remoteType } = this;

		const remoteExternals = {};
		for (const [key, value] of remotes) {
			remoteExternals[`container-reference/${key}`] = value;
		}

		new ExternalsPlugin(remoteType || "var", remoteExternals).apply(compiler);

		compiler.hooks.compilation.tap(
			"ContainerReferencePlugin",
			(compilation, { normalModuleFactory }) => {
				compilation.dependencyFactories.set(
					RemoteToExternalDependency,
					normalModuleFactory
				);

				compilation.dependencyFactories.set(
					RemoteOverrideDependency,
					normalModuleFactory
				);

				compilation.dependencyFactories.set(
					RemoteToOverrideDependency,
					new RemoteOverrideModuleFactory()
				);

				normalModuleFactory.hooks.factorize.tap(
					"ContainerReferencePlugin",
					data => {
						if (!data.request.includes("!")) {
							for (const [key] of remotes) {
								if (data.request.startsWith(`${key}/`)) {
									return new RemoteModule(
										data.request,
										this.overrides,
										`container-reference/${key}`,
										data.request.slice(key.length + 1)
									);
								}
							}
						}
					}
				);

				compilation.hooks.runtimeRequirementInTree
					.for(RuntimeGlobals.ensureChunkHandlers)
					.tap("OverridablesPlugin", (chunk, set) => {
						set.add(RuntimeGlobals.module);
						set.add(RuntimeGlobals.moduleFactories);
						set.add(RuntimeGlobals.hasOwnProperty);
						compilation.addRuntimeModule(chunk, new RemoteRuntimeModule());
					});
			}
		);
	}
};