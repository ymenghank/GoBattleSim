/**
	@file Load the scripts dynamically.
*/

var curTime = Date.now();

var scriptsToLoad = [
	"https://gamepress.gg/pokemongo/sites/pokemongo/files/js_files/DPS_Calculator.js",
	"https://gamepress.gg/pokemongo/sites/pokemongo/files/js_files/GBS_Controller.js",
	"https://gamepress.gg/pokemongo/sites/pokemongo/files/js_files/GBS_Data_Factory.js",
	"https://gamepress.gg/pokemongo/sites/pokemongo/files/js_files/GBS_Kernel.js",
	"https://gamepress.gg/pokemongo/sites/pokemongo/files/js_files/GBS_Simulator_Interface.js",
	"https://gamepress.gg/pokemongo/sites/pokemongo/files/js_files/GBS_Tools.js",
	"https://gamepress.gg/pokemongo/sites/pokemongo/files/js_files/GBS_User_Interface.js"
];

function onfinishLoadingScripts() {
	App.init();
}


var numScriptsToLoad = scriptsToLoad.length;
var numScriptsLoaded = 0;

var date = new Date();
for (var i = 0; i < numScriptsToLoad; i++) {
	let url = scriptsToLoad[i];
	$.getScript(url + "?" + curTime, function () {
		numScriptsLoaded++;
		if (numScriptsLoaded >= numScriptsToLoad) {
			onfinishLoadingScripts();
		}
	});
}