/*global $, JSONEditor, ace, Storage, Logger, Utils, Rules, Rule, I18n, ChromeBootstrap, Editor JSONF Libs UsageReport settings */
/*eslint no-unused-vars: [2, { "vars": "local"}]*/
// This file is a big bag of mixed responsibilities.
// Break this into parts!
var noticesVisible = false;
var ruleJson = null;

I18n.loadPages(["help", "importexport", "settings", "about", "changelog", "modalimportall", "modalimportallencrypted", "modaldeletetab", "modalusagereport", "tutorials"]);

ChromeBootstrap.init();

// Append extracted rule to the end of the rule definitions
// TODO: use a promise here
var appendRule = function(prettyRule, responseCallback) {
  Rules.load(currentTabId()).then(function(arrayOfRules) {
    // Create a rule from the parsed json and append to already present rules
    var rule = Rule.create(JSONF.parse(prettyRule), currentTabId(), arrayOfRules.length + 1);
    arrayOfRules.push(rule);
  });
};

// Check for freshly extracted rules and show UI
Storage.load(Utils.keys.extractedRule).then(function (extractedRule) {
  // There are extracted rules
  if (typeof extractedRule !== "undefined") {
    var $notice = $("#ruleeditor .notice.extracted-present");
    $notice.show();
    $("#ruleeditor .cmd-append-extracted").on("click", function () {
      Logger.info("[options.js] Appending extracted rules to the end of the definition");
      appendRule(extractedRule, function() {
        $notice.hide();
        Storage.delete(Utils.keys.extractedRule);
      });
    });
  }
});

// Check for rule filling errors
var displayExecutionErrors = function() {
  Storage.load(Utils.keys.errors).then(function (errorsStorage) {
    if (typeof errorsStorage !== "undefined") {
      var rule = errorsStorage.rule;
      var errors = errorsStorage.errors;
      var $notice = $("#ruleeditor .notice.form-fill-errors");
      $notice.find("tr").not("#form-filling-errors-thead").remove();
      var tableTrs = [];
      var fullMsg = false;
      errors.forEach(function (error) {
        Logger.info("[options.js] Got error " + JSONF.stringify(error) + " for rule " + JSONF.stringify(rule));
        if (typeof error.fullMessage !== "undefined") {
          // One line output
          tableTrs.push("<tr><td>" + error.fullMessage + "</td></tr>");
          fullMsg = true;
        } else {
          // Typically an error in a rule
          tableTrs.push("<tr><td>" + error.selector + "</td><td>" + error.value + "</td><td>" + error.message + "</td></tr>");
        }
      });
      $notice.find("table").append(tableTrs.join("\n"));
      if (fullMsg) {
        $notice.find("#form-filling-errors-thead").remove();
      }
      $notice.find(".rule-name").html(rule.nameClean);
      $notice.find(".rule-url").html(rule.urlClean);
      $notice.show();

      // Activate the tab with the rule
      var match = rule.id.match(/^([0-9]+)/);
      if (match) {
        Logger.info("[options.js] Activating tab #" + match[1]);
        $(".tab[data-tab-id='" + match[1] + "']").trigger("click");
      }
    }
  });
};

// Read all rules to update stats
// Also fill quickjump select
var updateTabStats = function() {
  Rules.all().then(function (rules) {
    var rulesStats = { tabCount: {}, rules: []};

    rules.forEach(function (rule) {
      // Count rules
      if (typeof rulesStats.tabCount[rule.tabId] === "undefined") {
        rulesStats.tabCount[rule.tabId] = 0;
      }
      rulesStats.tabCount[rule.tabId] += 1;
      rulesStats.rules.push({
        name: rule.nameClean,
        id: rule.id
      });
    });

    // rulesStats now has a count of all rules per tab
    Object.keys(rulesStats.tabCount).forEach(function (key) {
      $(".tab[data-tab-id='" + key + "'] .rule-count").html("(" + rulesStats.tabCount[key] + ")");
    });

    // Fill <select> rules overview
    var options = ["<option value=''>" + chrome.i18n.getMessage("opt_quickjump_rule") + "</option>"];

    // Remove rules without names (eg. libs)
    var onlyRealRules = rulesStats.rules.filter(function (rule) {
      return typeof rule.name != "undefined";
    });

    // Create <option> tags for sorted list of rules and insert into DOM
    Utils.sortRules(onlyRealRules).forEach(function (rule) {
      options.push("<option value='" + rule.id + "'>" + rule.name + "</option>");
    });
    $("#rules-overview").html(options.join(""));
  });
};

// Save the rules
var saveRules = function(tabId) {
  // Detect used libs and inject them into options
  var libs = Libs.detectVendoredLibraries(ruleJson);
  Libs.loadLibs(libs, "saveRules").then(function() {
      Rules.save(ruleJson, tabId).then(function () {
        Utils.infoMsg("Rules saved");
        updateTabStats();
        // If the editor contained something that looks like a library function
        // reimport the libs in the background page
        // because they COULD have been changed
        if (ruleJson.indexOf("export") > -1) {
          chrome.runtime.sendMessage({action: "reloadLibs"});
        }
      });

  });
};

// Load the rules
var loadRules = function(tabId) {
  Storage.load(Utils.keys.rules + "-tab-" + tabId).then(function (ruleData) {
    ruleJson = null;
    if (typeof ruleData === "undefined" || typeof ruleData.code === "undefined") {
      ruleJson = "";
    } else {
      ruleJson = ruleData.code;
    }

	var source   = $("#entry-template").html();
	var template = Handlebars.compile(source);
	eval(ruleJson);
	var rules__html = template({rules: rules});
	$('#rules__list').html(rules__html);

    // Detect used libs and inject them into options
    var libs = Libs.detectVendoredLibraries(ruleJson);
    Libs.loadLibs(libs, "loadRules").then(function() {
      editor.setValue(ruleJson, -1);
      editor.editor().clearSelection();
      Utils.infoMsg(chrome.i18n.getMessage("opt_rules_loaded_from_dics"));
      updateTabStats();
    });
  });
};

// This centers the editor on a rule selected in the quickjump menu
var quickJumpToRule = function() {
  var selected = $(this).find("option:selected");
  var tabId = selected.val().split("-")[0];
  var name = selected.text();

  // If the target tab is not the active one, click to trigger
  if (currentTabId().toString() !== tabId) {
    $("#ruleeditor .tab[data-tab-id=" + tabId + "]").trigger("click");
  }

  var found = editor.editor().find(name, { backwards: false, skipCurrent: false }, false);
  editor.editor().gotoLine(found.start.row, 1, false);
};

displayExecutionErrors();

// Load data from tab and prefill editor
loadRules(currentTabId());

// Try to make ACE behave :)
editor.resize();
setTimeout(editor.redraw, 250);

// Start a tutorial if set previously
// This can only be set by defined URLs (see manifest)
window.Tutorial.startOnOpen();

// Button handling for "save" and "load"
$(".editor .menu").on("click", "button.save", function() {
  saveRules(currentTabId());
}).on("click", "button.reload", function() {
  loadRules(currentTabId());
}).on("click", "button.format", function() {
  editor.format(Rules);
  Utils.infoMsg(chrome.i18n.getMessage("opt_rules_formatted"));
});

// Show modal import window
$(document).on("click", "button.import, .rl-button-import", $("#modalimportrules").show);

// Support for the quickjump <select>
$("#rules-overview").on("change", quickJumpToRule);

// Event handler for notices
$(".notice.form-fill-errors a.cmd-close-notice").on("click", function() {
  Storage.delete(Utils.keys.errors);
  $(this).parents(".notice").hide();
});

$(".notice.extracted-present a.cmd-close-notice").on("click", function() {
  Storage.delete(Utils.keys.extractedRule);
  $(this).parents(".notice").hide();
});

$(".notice.annotations-present a.cmd-close-notice, .notice.error a.cmd-close-notice").on("click", function() {
  $(this).parents(".notice").hide();
});

// When the options window gets focused,
// check to see if errors are present
document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === "visible") {
    Logger.info("[option.js] Options are visible. Checking for errors!");
    displayExecutionErrors();
  }
});

// Load all tutorials and insert them in the DOM
// Must be last.
I18n.loadPages(["tour1", "tour2", "tour3", "tour4", "tour5", "tour6", "tour7", "tour8", "tour9", "tour10", "tour11", "tour12", "tour13"], "tutorial");
