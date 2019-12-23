
/**
	Simulator Interface. This module serves as a programming interface to the simulator. It performs validation on the input, parses user raw input which could be batch input, and averages the output if the aggregation mode is average.
	@exports GBS
*/
var GBS = {};


/**
	Do batch simulations.
	@param {Object} input User input.
	@return {Object[]} A list of specific battle data.
*/
GBS.request = function (input) {
	AdditionalSummaryMetrics = {};
	input.hasLog = (input.aggregation == "enum");
	var battles = [];
	var battleInputs = GBS.parse(input);
	for (let binput of battleInputs) {
		battles = battles.concat(processConfig(binput));
	}
	return battles;
}

/**
	Do single simulation.
	@param {Object} input Specific battle input.
	@param {Object[]} log Battle log to resume (optional).
	@return {BattleOutput} The result attle data.
*/
GBS.run = function (input, log) {
	var battle = new Battle(new BattleInput(input));
	battle.init();
	if (log) {
		battle.load(log);
	}
	battle.go();
	return battle.getBattleResult();
}

/**
	Parse a batch battle input to specific battle inputs.
	@param {Object} input General battle input.
	@param {Object[]} A list of specific battle input.
*/
GBS.parse = function (input, start) {
	start = start || [0, 0, 0, 0];
	for (var i = start[0]; i < input.players.length; i++) {
		let player = input.players[i];
		for (var j = start[1]; j < player.parties.length; j++) {
			let party = player.parties[j];
			for (var k = start[2]; k < party.pokemon.length; k++) {
				let pokemon = party.pokemon[k];
				let species = GM.get("pokemon", pokemon.name.trim().toLowerCase()) || {};
				for (var a in species) {
					if (!pokemon.hasOwnProperty(a)) {
						pokemon[a] = species[a];
					}
				}
				for (var m = start[3]; m < AttributeDefinition.length; m++) {
					let attrDef = AttributeDefinition[m];
					let value = (pokemon[attrDef.name] || attrDef.default).toString().toLowerCase();
					if (GM.get(attrDef.dbname, value) != null) {
						continue;
					} else if (value[0] == '=') { // Dynamic Paster
						try {
							var arr = value.slice(1).split('.');
							var srcPokemonAddress = arr[0].trim(), srcAttrName = arr[1] || attrDef.name;
							var srcPokemon = (srcPokemonAddress == "this" ? pokemon : getPokemonConfig(input, srcPokemonAddress));
							pokemon[attrDef.name] = srcPokemon[srcAttrName];
							continue;
						} catch (err) {
							throw new Exception((i + 1) + "-" + (j + 1) + "-" + (k + 1) + '.' + attrDef.name + ": Invalid Dynamic Paster");
						}
					} else { // Poke Query
						let selector = value[0];
						if (SELECTORS.includes(selector)) {
							value = value.slice(1).trim() || attrDef.default;
						}
						let matches = GM.select(attrDef.dbname, value, attrDef.name == "name" ? null : pokemon);
						if (matches.length == 0) {
							return [];
						}
						if (selector != '?') {
							let metric = '*' + (i + 1) + "-" + (j + 1) + "-" + (k + 1) + '.' + attrDef.name;
							AdditionalSummaryMetrics[metric] = metric;
						}
						let branches = [];
						for (let match of matches) {
							let cfg_copy = {};
							deepCopy(cfg_copy, input);
							pokemon = cfg_copy.players[i].parties[j].pokemon[k];
							pokemon[attrDef.name] = match.name;
							if (attrDef.name == "name") {
								if (match.uid) {
									// Match user's Pokemon
									for (var a in match) {
										if (pokemon[a]) {
											pokemon[a] = pokemon[a].toString().replace("#", match[a]);
										} else {
											pokemon[a] = match[a];
										}
									}
								} else {
									// Match generic Pokemon, copy everything
									deepCopy(pokemon, match);
								}
							}
							branches = branches.concat(GBS.parse(cfg_copy, [i, j, k, m + 1]));
						}
						if (selector == '?') { // Forced prouping	
							branches = [branches];
						}
						return branches;
					}
				}
				start[3] = 0;
			}
			start[2] = 0;
		}
		start[1] = 0;
	}
	return [input];
}

/**
	Take arithmetic average for each numerical metric in the battle data object.
	@param {Object[]} outputs A list of battle data object.
	@return {Object} Averged battle data.
*/
GBS.average = function (battles) {
	var averageBattleOutput = JSON.parse(JSON.stringify(battles[0].output));

	// 1. Initialize everything to 0
	traverseLeaf(averageBattleOutput, function (v, path) {
		if (!isNaN(parseFloat(v))) {
			setProperty(averageBattleOutput, path, 0);
		}
	});

	// 2. Sum them up
	for (let battle of battles) {
		battle.output.battleLog = [];
		traverseLeaf(battle.output, function (v, path) {
			if (!isNaN(parseFloat(v))) {
				setProperty(averageBattleOutput, path, getProperty(averageBattleOutput, path) + v);
			}
		});
	}

	// 3. Divide and get the results
	traverseLeaf(averageBattleOutput, function (v, path) {
		if (!isNaN(parseFloat(v))) {
			v = v / battles.length;
			setProperty(averageBattleOutput, path, v);
		}
	});

	return {
		input: battles[0].input,
		output: averageBattleOutput
	};
}

/**
	Get or set the metrics (columns) used for the master summary table.
	@param {Object} user_metrics The metrics to set.
	@return {Object} The updated metrics.
*/
GBS.metrics = function (user_metrics) {
	if (user_metrics) {
		DefaultSummaryMetrics = {};
		AdditionalSummaryMetrics = {};
		for (var m in user_metrics) {
			DefaultSummaryMetrics[m] = user_metrics[m];
		}
	}
	var combinedMetrics = {};
	for (var m in DefaultSummaryMetrics) {
		combinedMetrics[m] = DefaultSummaryMetrics[m];
	}
	for (var m in AdditionalSummaryMetrics) {
		combinedMetrics[m] = AdditionalSummaryMetrics[m];
	}
	return combinedMetrics;
}

/**
	Apply battle settings to the simulator.
	@param {Object} bdata Battle parameters. If omitted, default settings will be used.
*/
GBS.settings = function (bdata) {
	if (bdata) {
		for (var param in bdata) {
			Battle.setting(param, bdata[param]);
		}
	} else {
		GM.each("battle", function (v, k) {
			Battle.setting(k, v);
		});
	}
}

/**
	Change the global battle mode settings.
	@param {string} mode Name of the battle mode. "raid", "gym", or "pvp"
*/
GBS.mode = function (mode) {
	if (mode == "pvp") {
		Battle.setting("globalAttackBonusMultiplier", GM.get("battle", "PvPAttackBonusMultiplier"));
		Battle.setting("energyDeltaPerHealthLost", 0);
		Battle.setting("fastMoveLagMs", 0);
		Battle.setting("chargedMoveLagMs", 0);
		GM.each("fast", function (move) {
			for (var a in move.combat) {
				move[a] = move.combat[a];
			}
		});
		GM.each("charged", function (move) {
			for (var a in move.combat) {
				move[a] = move.combat[a];
			}
		});
	} else {
		Battle.setting("globalAttackBonusMultiplier", 1);
		GBS.settings();
		GM.each("fast", function (move) {
			for (var a in move.regular) {
				move[a] = move.regular[a];
			}
		});
		GM.each("charged", function (move) {
			for (var a in move.regular) {
				move[a] = move.regular[a];
			}
		});
	}
}


/*
	Use pogoapi.gamepress.gg simulator engine
*/
GBS.submit = function (reqType, reqInput, reqOutput_handler, oncomplete) {
	if (GBS.Processing) {
		return;
	}
	GBS.Processing = 1;

	var request_json = {
		"reqId": GBS.RequestId,
		"reqType": reqType,
		"reqInput": reqInput
	};

	$.ajax({
		url: GBS.HostURL,
		type: "POST",
		dataType: "json",
		data: JSON.stringify(request_json),
		processData: false,
		success: function (resp) {
			while (DialogStack.length > 0) {
				DialogStack.pop().dialog('close');
			}
			reqOutput_handler(resp["reqOutput"]);
		},
		error: function (jqXHR, textStatus, errorThrown) {
			while (DialogStack.length > 0) {
				DialogStack.pop().dialog('close');
			}
			UI.sendFeedbackDialog(errorThrown);
		},
		complete: function () {
			GBS.RequestId++;
			GBS.Processing = 0;
			if (oncomplete) {
				oncomplete();
			}
		}
	});
}





/*
	Non-interface members
*/

var DefaultSummaryMetrics = { outcome: 'Outcome', duration: 'Time', tdo_percent: 'TDO%', dps: 'DPS', numDeaths: '#Death' };
var AdditionalSummaryMetrics = {};


/**
	@class A wrapper class to validate and format Pokemon input.
	@param {Object} kwargs Information defining the Pokemon.
*/
function PokemonInput(kwargs) {
	this.name = (kwargs.name !== undefined ? kwargs.name.toLowerCase() : undefined);
	let species = null;

	// 0. Role and immortality
	let roleArgs = (kwargs.role || "a").split('_');
	this.role = roleArgs[0].toLowerCase();
	if (typeof kwargs.immortal == typeof false) {
		this.immortal = kwargs.immortal;
	} else {
		this.immortal = roleArgs[0] == roleArgs[0].toUpperCase();
	}

	// 1. The core three stats (Attack, Defense and Stamina)
	this.Atk = kwargs.Atk;
	this.Def = kwargs.Def;
	this.Stm = kwargs.Stm;
	this.maxHP = kwargs.maxHP;
	if (typeof this.Atk == typeof 0 && typeof this.Def == typeof 0 && typeof this.Stm == typeof 0) {
		// If Atk, Def and Stm are all defined, then no need to look up species stats.
	} else {
		// Otherwise (at least one of {Atk, Def, Stm} is missing), need to calculate them using Stat = (baseStat + ivStat) * cpm;
		// 1.1 Find baseAtk, baseDef and baseStm.
		if (typeof kwargs.baseAtk == typeof 0 && typeof kwargs.baseDef == typeof 0 && typeof kwargs.baseStm == typeof 0) {
			// If all of them are defined, then no need to look up species stats.
			this.baseAtk = kwargs.baseAtk;
			this.baseDef = kwargs.baseDef;
			this.baseStm = kwargs.baseStm;
		} else {
			// Do the look up
			species = GM.get("pokemon", this.name);
			if (species == null) {
				throw new Error("Cannot create Pokemon");
			}
			this.baseAtk = species.baseAtk;
			this.baseDef = species.baseDef;
			this.baseStm = species.baseStm;
		}
		// 1.2 Unless the role of the Pokemon is "rb" (Raid Boss), need to find ivs
		if (this.role == "rb") {
			// For raid bosses, attack IV and defense IV are 15. maxHP and cpm are also defined.
			let raidTier = GM.get("RaidTierSettings", kwargs.raidTier);
			if (raidTier == null) {
				throw new Error("Raid Tier not found");
			}
			this.atkiv = 15;
			this.defiv = 15;
			this.stmiv = 15;
			this.maxHP = raidTier.maxHP;
			this.cpm = raidTier.cpm;
		} else {
			this.atkiv = kwargs.atkiv;
			this.defiv = kwargs.defiv;
			this.stmiv = kwargs.stmiv;
			if (roleArgs[1] == "basic" || kwargs.atkiv == undefined || kwargs.defiv == undefined || kwargs.stmiv == undefined) {
				// Infer level and IVs from cp, given base stats.
				let quartet = inferLevelAndIVs(this, parseInt(kwargs.cp));
				if (quartet) {
					this.atkiv = quartet.atkiv;
					this.defiv = quartet.defiv;
					this.stmiv = quartet.stmiv;
					this.level = quartet.level;
					this.cpm = quartet.cpm;
				} else {
					throw new Exception("No combination of IVs and level found");
				}
			} else {
				this.atkiv = parseInt(this.atkiv) || 0;
				this.defiv = parseInt(this.defiv) || 0;
				this.stmiv = parseInt(this.stmiv) || 0;
			}
		}
		// 1.3 Find cpm
		if (typeof this.cpm == typeof 0) {
			// cpm already defined (such as raid boss), do nothing
		} else if (typeof kwargs.cpm == typeof 0) {
			this.cpm = kwargs.cpm;
		} else {
			// Find cpm from level
			this.level = kwargs.level;
			let levelSetting = GM.get("level", this.level);
			if (levelSetting == null) {
				throw new Error("Cannot find level or cpm");
			}
			this.cpm = levelSetting.cpm;
		}
		// 1.4 With everything ready, calculate the three stats if necessary
		if (typeof this.Atk != typeof 0) {
			this.Atk = (this.baseAtk + this.atkiv) * this.cpm;
		}
		if (typeof this.Def != typeof 0) {
			this.Def = (this.baseDef + this.defiv) * this.cpm;
		}
		if (typeof this.Stm != typeof 0) {
			this.Stm = (this.baseStm + this.stmiv) * this.cpm;
		}
	}
	// 1.5 Calculate maxHP
	if (typeof this.maxHP != typeof 0) {
		if (this.role == "gd") { // Gym Defender
			this.maxHP = 2 * Math.floor(this.Stm);
		} else { // Attacker
			this.maxHP = Math.floor(this.Stm);
		}
	}

	// 2. Moves
	this.fmove = null;
	if (typeof kwargs.fmove == typeof "") {
		this.fmove = GM.get("fast", kwargs.fmove.toLowerCase());
	} else if (kwargs.fmove) {
		this.fmove = kwargs.fmove;
	}

	this.cmove = null;
	this.cmoves = [];
	let cmoves = {};
	if (Array.isArray(kwargs.cmoves)) {
		for (let move of kwargs.cmoves) {
			if (typeof move == typeof "") {
				move = GM.get("charged", move.toLowerCase());
			}
			if (move) {
				cmoves[move.name] = move;
			}
		}
		this.cmoves = Object.values(cmoves);
		this.cmove = this.cmoves[0];
	} else if (typeof kwargs.cmove == typeof "") {
		let move = GM.get("charged", pokemon.cmove.toLowerCase());
		if (move) {
			this.cmove = move;
			cmoves[move.name] = move;
		}
		if (pokemon.cmove2) {
			if (typeof pokemon.cmove2 == typeof "") {
				move = GM.get("charged", pokemon.cmove2.toLowerCase());
			}
			if (move) {
				cmoves[move.name] = move;
			}
		}
		this.cmoves = Object.values(cmoves);
	}
}


/**
	@class A wrapper class to validate and format battle input.
	@param {Object} kwargs User input for a simulation.
*/
function BattleInput(kwargs) {
	deepCopy(this, kwargs);
	for (let player of this.players) {
		player.fab = (GM.get("friend", player.friend) || {}).multiplier || 1;
		for (let party of player.parties) {
			party.delay = parseInt(party.delay) || 0;
			for (let pokemon of party.pokemon) {
				pokemon.name = pokemon.name.toLowerCase();
				let species = GM.get("pokemon", pokemon.name);
				if (!species) {
					throw new Error("No pokemon matched name", pokemon.name);
				}
				deepCopy(pokemon, species);

				// Find cpm
				let level_setting = GM.get("level", pokemon.level);
				if (level_setting) {
					pokemon.cpm = level_setting.cpm;
				}

				// Handle role, immortality, and cpm/level
				let role_params = (pokemon.role || "a").split('_');
				pokemon.role = role_params[0];
				pokemon.immortal = (pokemon.role == role_params[0].toUpperCase());
				pokemon.role = pokemon.role.toLowerCase();
				if (role_params[1] == 'basic') {
					quartet = inferLevelAndIVs(pokemon, parseInt(pokemon.cp));
					if (quartet) {
						deepCopy(pokemon, quartet);
					} else {
						throw new Exception("No combination of IVs and level found");
					}
				}
				if (pokemon.role == "rb") {
					let raid_tier = GM.get("RaidTierSettings", pokemon.raidTier);
					pokemon.cpm = raid_tier.cpm;
					pokemon.maxHP = raid_tier.maxHP;
				}

				// Handle moves
				if (typeof pokemon.fmove == typeof "") {
					pokemon.fmove = GM.get("fast", pokemon.fmove.toLowerCase());
				}
				let cmoves = {};
				if (kwargs.cmoves) {
					for (let move of kwargs.cmoves) {
						if (typeof move == typeof "") {
							move = GM.get("charged", move.toLowerCase());
						}
						if (move) {
							cmoves[move.name] = move;
						}
					}
				} else if (typeof pokemon.cmove == typeof "") {
					let move = GM.get("charged", pokemon.cmove.toLowerCase());
					if (move) {
						cmoves[move.name] = move;
					}
					if (pokemon.cmove2) {
						if (typeof pokemon.cmove2 == typeof "") {
							move = GM.get("charged", pokemon.cmove2.toLowerCase());
						}
						if (move) {
							cmoves[move.name] = move;
						}
					}
				}
				pokemon.cmoves = Object.values(cmoves);
				pokemon.cmove = pokemon.cmoves[0];

				if (this.battleMode == "pvp") {
					for (let move of [pokemon.fmove].concat(pokemon.cmoves)) {
						for (var a in move.combat) {
							move[a] = move.combat[a];
						}
					}
				}
			}
		}
	}
}


/**
	The CP formula, calculating the current CP of a Pokemon.
	@param {Object|Pokemon} pkm The Pokemon to calculate CP for. Expected to have Atk, Def and Stm. If not, then must have base stats, IV stats and cpm/level.
	@return {number} The CP value
*/
function calculateCP(pkm) {
	var cpm = parseFloat(pkm.cpm);
	var atk = pkm.Atk || (pkm.baseAtk + pkm.atkiv) * cpm;
	var def = pkm.Def || (pkm.baseDef + pkm.defiv) * cpm;
	var stm = pkm.Stm || (pkm.baseStm + pkm.stmiv) * cpm;
	return Math.max(10, Math.floor(atk * Math.sqrt(def * stm) / 10));
}

/**
	Find a combination of {level, atkiv, defiv, stmiv} that yields the target CP for a Pokemon.
	@param {Pokemon} pkm The Pokemon to infer level and IVs for. Expected to have baseAtk, baseDef and baseStm.
	@param {number} cp The target CP.
	@param {boolean} exact If no combination yields the target CP, it return the combination that gets the closest but is less than the target CP.
	@return {Object} A combination that yields the target CP.
*/
function inferLevelAndIVs(pkm, cp, exact) {
	var pkm2 = { baseAtk: pkm.baseAtk, baseDef: pkm.baseDef, baseStm: pkm.baseStm };

	var levels = [];
	if (pkm.level !== undefined) {
		if (pkm.cpm == undefined) {
			levels = [GM.get("level", pkm.level)];
		} else {
			levels = [{ "name": pkm.level.toString(), "cpm": pkm.cpm }];
		}
	} else {
		GM.each("level", function (levelSetting) {
			levels.push(levelSetting);
		});
	}
	var atkivs = [];
	if (pkm.atkiv !== undefined) {
		atkivs = [parseInt(pkm.atkiv)];
	} else {
		atkivs = Array(16).fill().map((x, i) => i);
	}
	var defivs = [];
	if (pkm.defiv !== undefined) {
		defivs = [parseInt(pkm.defiv)];
	} else {
		defivs = Array(16).fill().map((x, i) => i);
	}
	var stmivs = [];
	if (pkm.stmiv !== undefined) {
		stmivs = [parseInt(pkm.stmiv)];
	} else {
		stmivs = Array(16).fill().map((x, i) => i);
	}

	var minLevelIndex = null;
	pkm2.atkiv = pkm2.defiv = pkm2.stmiv = 15;
	for (var i = 0; i < levels.length; i++) {
		pkm2.cpm = levels[i].cpm;
		if (calculateCP(pkm2) <= cp)
			minLevelIndex = i;
		else
			break;
	};
	if (minLevelIndex == null)
		return null;

	let pkm3 = { cpm: levels[0].cpm, level: levels[0].name, atkiv: 0, defiv: 0, stmiv: 0 };
	for (var i = minLevelIndex; i < levels.length; i++) {
		pkm2.level = levels[i].name;
		pkm2.cpm = levels[i].cpm;
		for (let aktiv of atkivs) {
			pkm2.atkiv = aktiv;
			for (let defiv of defivs) {
				pkm2.defiv = defiv;
				for (let stmiv of stmivs) {
					pkm2.stmiv = stmiv;
					pkm2.cp = calculateCP(pkm2);
					if (pkm2.cp == cp) {
						return pkm2;
					} else if (pkm2.cp > pkm3.cp && pkm2.cp < cp) {
						pkm3.level = pkm2.level;
						pkm3.atkiv = pkm2.atkiv;
						pkm3.defiv = pkm2.defiv;
						pkm3.stmiv = pkm2.stmiv;
						pkm3.cpm = pkm2.cpm;
					}
				}
			}
		}
	}
	if (!exact)
		return pkm3;
}


function getPokemonConfig(cfg, address) {
	var arr = address.split('-');
	var i = parseInt(arr[0]) - 1, j = parseInt(arr[1]) - 1, k = parseInt(arr[2]) - 1; // indices start from 1 in address
	return cfg.players[i].parties[j].pokemon[k];
}

var AttributeDefinition = [
	{
		name: "name",
		dbname: "pokemon_all",
		default: "latios"
	}, {
		name: "level",
		dbname: "level",
		default: "40"
	}, {
		name: "atkiv",
		dbname: "IndividualValues",
		default: "15"
	}, {
		name: "defiv",
		dbname: "IndividualValues",
		default: "15"
	}, {
		name: "stmiv",
		dbname: "IndividualValues",
		default: "15"
	}, {
		name: "fmove",
		dbname: "fast",
		default: "current, legacy, exclusive"
	}, {
		name: "cmove",
		dbname: "charged",
		default: "current, legacy, exclusive"
	}, {
		name: "cmove2",
		dbname: "charged",
		default: "=this.cmove"
	}
];


function processConfig(input) {
	var battles = [];
	if (Array.isArray(input)) {
		for (let subInput of input) {
			battles = battles.concat(processConfig(subInput));
		}
		return [GBS.average(battles)];
	} else {
		var battleInput = new BattleInput(input);
		if (battleInput.aggregation != "enum") {
			battleInput.hasLog = false;
		}
		var battle = new Battle(battleInput);
		let simPerConfig = parseInt(battleInput.simPerConfig) || 1;
		for (var i = 0; i < simPerConfig; i++) {
			battle.init();
			battle.go();
			battles.push({
				input: input,
				output: battle.getBattleResult()
			});
		}
		if (battleInput.aggregation == "avrg") {
			battles = [GBS.average(battles)];
		}
		return battles;
	}
}