
/**
 * Application controller.
 * @exports App
 */
var App = {};

var GameMaster = {};
var Simulations = [];

/** 
 * Application entry point. This is called after the Data_Factory has prepared all the data.
 */
App.init = function () {
	$.widget("custom.iconselectmenu", $.ui.selectmenu, {
		_renderItem: function (ul, item) {
			var li = $("<li>"), wrapper = $("<div>", { text: item.label });
			if (item.disabled) {
				li.addClass("ui-state-disabled");
			}
			$("<span>", {
				style: item.element.attr("data-style"),
				"class": "ui-icon " + item.element.attr("data-class")
			}).appendTo(wrapper);
			return li.append(wrapper).appendTo(ul);
		}
	});

	dropdownMenuInit();
	try {
		welcomeDialogInit();
		moveEditFormInit();
		pokemonEditFormInit();
		parameterEditFormInit();
		modEditFormInit();
		userEditFormInit();
		MVLTableInit();
		teamBuilderInit();
	} catch (err) {
		console.log(err);
	}

	$("#UserGuideOpener").click(function () {
		window.open('https://gamepress.gg/pokemongo/comprehensive-guide-GoBattleSim', '_blank')
	});
	$("#ChanegLogOpener").click(function () {
		window.open('https://gamepress.gg/pokemongo/GoBattleSim-and-comprehensive-dps-spreadsheet-change-log', '_blank')
	});
	$("#AddPlayerButton").click(function () {
		addPlayerNode();
	});
	$("#GoButton").click(App.onclickGo);
	$("#ClearButton").click(App.onclickClear);
	$("#CopyClipboardButton").click(function () {
		copyTableToClipboard('MasterSummaryTable');
	});
	$("#CopyCSVButton").click(function () {
		exportTableToCSV('MasterSummaryTable', 'GoBattleSim_result.csv');
	});

	var playersNode = $("#input").find("[name=input-players]")[0];
	$(playersNode).sortable({ axis: 'y' });

	// Do it now because addPlayerNode() needs GBS ready (to fetch strategy)
	var engine_cfg = {};
	GameMaster = GM.convert();
	tryTillSuccess(function () {
		engine_cfg = GBS.config(GameMaster);
	});
	EngineStrategies = engine_cfg.PvEStrategies.concat(engine_cfg.PvPStrategies);

	addPlayerNode();
	addPlayerNode();
	UI.write({ team: "1", parties: [{ pokemon: [{ role: "a" }] }] }, playersNode.children[0]);
	UI.write({ team: "0", parties: [{ pokemon: [{ role: "rb" }] }] }, playersNode.children[1]);
	//comply();

	var weatherInput = $("#input").find("[name=input-weather]")[0];
	GM.each("weather", function (weatherSetting) {
		weatherInput.appendChild(createElement('option', weatherSetting.label, { value: weatherSetting.name }));
	});
	$("#timelimit").val(GM.get("battle", "timelimitLegendaryRaidMs"));

	if (window.location.href.includes('?')) {
		UI.write(UI.importConfig());
		UI.refresh();
	} else if (!LocalData.WelcomeDialogNoShow) {
		$("#WelcomeDialog").dialog("open");
	}
	parameterEditFormRefresh();

	UI.refresh();
}

/** 
 * Handler of "Go" button click event.
 */
App.onclickGo = function () {
	var input = UI.read();
	UI.exportConfig(input);
	UI.wait(function () {
		var battles = GBS.request(input);
		Simulations = Simulations.concat(battles);
		UI.updateMasterSummaryTable(Simulations, GBS.metrics());
	}, {
		error: function (err) {
			let js_err = err.toString();
			let gbs_err = GBS.error();
			let final_err = js_err || gbs_err || "unknown error";
			UI.sendFeedbackDialog("<p>Oops, something went wrong!</p>" + final_err);
		}
	});
}

/** 
 * Handler of "Clear" button click event.
 */
App.onclickClear = function () {
	Simulations = [];
	UI.exportConfig();
	UI.updateMasterSummaryTable(Simulations, GBS.metrics());
	UI.updateSimulationDetails();
}

/** 
 * Handler of interactive battle log change event.
 * TODO: interactive battle log is nowdisabled
 * 
 * @param {Object} battleInfo The current battle data in display.
 */
App.onBattleLogChange = function (battleInfo) {
	var output = GBS.run(battleInfo.input, battleInfo.output.battleLog || []);
	UI.updateSimulationDetails({
		input: battleInfo.input,
		output: output
	});
}
