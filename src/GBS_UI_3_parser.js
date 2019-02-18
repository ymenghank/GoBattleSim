/* GBS_UI_3_parser.js */

/**
	@file Process simulation request and handle Batch Input.
	@author BIOWP
*/


function createNewMetric(metric, nameDisplayed){
	MasterSummaryTableMetrics[metric] = nameDisplayed || metric;
}

function getPokemonConfig(cfg, address){
	var arr = address.split('-');
	var i = parseInt(arr[0])-1, j = parseInt(arr[1])-1, k = parseInt(arr[2])-1; // indices start from 1 in address
	return cfg.players[i].parties[j].pokemon[k];
}

var attributesEnumeration = [
	{
		name: "name",
		matcher: x => getEntryIndex(x, Data.Pokemon),
		database: a => getPokemonOptions(true),
		default: "latios"
	},{
		name: "level",
		matcher: parseFloat,
		database: a => Data.LevelSettings,
		default: "40"
	},{
		name: "atkiv",
		matcher: parseInt,
		database: a => Data.IndividualValues,
		default: "15"
	},{
		name: "defiv",
		matcher: parseInt,
		database: a => Data.IndividualValues,
		default: "15"
	},{
		name: "stmiv",
		matcher: parseInt,
		database: a => Data.IndividualValues,
		default: "15"
	},{
		name: "fmove",
		matcher: x => getEntryIndex(x, Data.FastMoves),
		database: a => Data.FastMoves,
		default: "current, legacy, exclusive"
	},{
		name: "cmove",
		matcher: x => getEntryIndex(x, Data.ChargedMoves),
		database: a => Data.ChargedMoves,
		default: "current, legacy, exclusive"
	},{
		name: "cmove2",
		matcher: x => getEntryIndex(x, Data.ChargedMoves),
		database: a => Data.ChargedMoves,
		default: "=this.cmove"
	}
];

function batchSim(cfg, start){
	start = start || [0, 0, 0, 0];
	for (var i = start[0]; i < cfg.players.length; i++){
		let player = cfg.players[i];
		for (var j = start[1]; j < player.parties.length; j++){
			let party = player.parties[j];
			for (var k = start[2]; k < party.pokemon.length; k++){
				let pokemon = party.pokemon[k];
				let pokemonInstance = getEntry(pokemon.name.trim().toLowerCase(), Data.Pokemon);
				for (var m = start[3]; m < attributesEnumeration.length; m++){
					let attr = attributesEnumeration[m];
					let database = attr.database([i, j, k, m]);
					let expression = (pokemon[attr.name] || attr.default).toString().toLowerCase();
					if (attr.matcher(expression) >= 0){
						continue;
					}
					if (expression[0] == '='){ // Dynamic Paster
						try{
							var arr = expression.slice(1).split('.');
							var address = arr[0].trim(), attrSrc = arr[1] || attr.name;
							var pokemonSrc = (address == "this" ? pokemon : getPokemonConfig(cfg, address));
							pokemon[attr.name] = pokemonSrc[attrSrc];
							continue;
						}catch(err){
							sendFeedback((i+1) + "-" + (j+1) + "-" + (k+1) + '.' + attr.name + ": Invalid Dynamic Paster", true);
							return [];
						}
					}else{ // Logical Expression
						let branches = [];
						let selector = expression[0];
						if (SELECTORS.includes(selector)){
							expression = expression.slice(1).trim() || attr.default;
						}
						let matches = database.filter(Predicate(expression, pokemonInstance, attr.name));
						if (matches.length == 0){
							return [];
						}
						if (selector != '?'){
							createNewMetric('*' + (i+1) + "-" + (j+1) + "-" + (k+1) + '.' + attr.name);
						}
						for (let match of matches){
							let cfg_copy = JSON.parse(JSON.stringify(cfg));
							pokemon = cfg_copy.players[i].parties[j].pokemon[k];
							pokemon[attr.name] = match.name;
							if (attr.name == "name" && match.uid){ // Match user's Pokemon
								for (let ae of attributesEnumeration){
									let a = ae.name;
									pokemon[a] = (pokemon[a] || match[a]).toString().replace("#", match[a]);
								}
								pokemon.label = match.label;
							}
							branches = branches.concat(batchSim(cfg_copy, [i, j, k, m+1]));
						}
						if (selector == '?'){ // Forced prouping	
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
	return [cfg];
}

// Simulate a specific configuration
function runSimulation(input){
	if (input.aggregation != "enum"){
		input.hasLog = false;
	}
	var battle = new Battle(input);
	let simPerConfig = parseInt(input.simPerConfig) || 1;
	let simulations = [];
	for (var i = 0; i < simPerConfig; i++){
		battle.init();
		battle.go();
		simulations.push({
			input: input,
			output: battle.getBattleResult()
		});
	}
	currentJobSize += simPerConfig;
	if (input.aggregation == "avrg"){
		simulations = [averageSimulations(simulations)];
	}
	return simulations;
}


function averageSimulations(sims){
	var avrgOutput = JSON.parse(JSON.stringify(sims[0].output));
	
	// 1. Initialize everything to 0
	traverseLeaf(avrgOutput, function(v, path){
		if (!isNaN(parseFloat(v))){
			setProperty(avrgOutput, path, 0);
		}
	});
	
	// 2. Sum them up
	for (let sim of sims){
		sim.output.battleLog = [];
		traverseLeaf(sim.output, function(v, path){
			if (!isNaN(parseFloat(v))){
				setProperty(avrgOutput, path, getProperty(avrgOutput, path) + v);
			}
		});
	}
	
	// 3. Divide and get the results
	traverseLeaf(avrgOutput, function(v, path){
		if (!isNaN(parseFloat(v))){
			v = v / sims.length;
			setProperty(avrgOutput, path, v);
		}
	});
	
	return {
		input: sims[0].input,
		output: avrgOutput
	};
}


function requestSimulation(){
	sendFeedbackDialog("<i class='fa fa-spinner fa-spin fa-3x fa-fw'><\/i><span class='sr-only'><\/span>Simulating...");
	setTimeout(function(){
		try{
			GoBattleSim();
			sendFeedback(currentJobSize + " sims have been performed", true);
			setTimeout(function(){
				document.getElementById('ui-mastersummarytable').scrollIntoView({behavior: "smooth", block: "center", inline: "center"});
			}, 100);
			while (DialogStack.length){
				DialogStack.pop().dialog('close');
			}
		}catch(err){
			while (DialogStack.length){
				DialogStack.pop().dialog('close');
			}
			sendFeedbackDialog("<p>Oops, something went wrong!</p>" + err.toString());
		}
	}, 100);
}


function processConfig(config){
	if (Array.isArray(config)){
		var sims = [];
		for (let subConfig of config){
			sims = sims.concat(processConfig(subConfig));
		}
		return [averageSimulations(sims)];
	}else{
		return runSimulation(config);
	}
}


function GoBattleSim(){
	var userInput = read();
	if (userInput.battleMode == "pvp"){
		assignMoveParameterSet("load", Data.FastMoves, "combat");
		assignMoveParameterSet("load", Data.ChargedMoves, "combat");
	}else{
		assignMoveParameterSet("load", Data.FastMoves, "regular");
		assignMoveParameterSet("load", Data.ChargedMoves, "regular");
	}
	
	window.history.pushState('', "GoBattleSim", window.location.href.split('?')[0] + '?' + exportConfig(userInput));
	userInput.hasLog = true;
	
	date = new Date();
	console.log(date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds() + '.' + date.getMilliseconds()  + ": Simulations started");
	
	var configurations = batchSim(userInput, [0,0,0,0]);
	for (let config of configurations){
		Simulations = Simulations.concat(processConfig(config));
	}
	
	date = new Date();
	console.log(date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds() + '.' + date.getMilliseconds()  + ": Simulations completed");

	updateMasterSummaryTable();
	updateSimulationDetails(Simulations[Simulations.length - 1]);
}


function applicationInit(){
	var playersNode = $$$(document.getElementById("input")).child("input-players").node;
	$(playersNode).sortable({axis: 'y'});
	addPlayerNode();
	addPlayerNode();
	write(playersNode.children[1], {team: "1", parties: [{pokemon: [{role: "rb"}]}]});
	//comply();

	if (window.location.href.includes('?')){
		write(document.getElementById("input"), importConfig(window.location.href));
	}else if (!LocalData.WelcomeDialogNoShow){
		$( "#WelcomeDialog" ).dialog( "open" );
	}

	formatting(playersNode);
	relabel();
}