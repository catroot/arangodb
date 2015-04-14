////////////////////////////////////////////////////////////////////////////////
/// @brief JSHint wrapper
///
/// @file
///
/// DISCLAIMER
///
/// Copyright 2010-2014 triagens GmbH, Cologne, Germany
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///
/// Copyright holder is triAGENS GmbH, Cologne, Germany
///
/// @author Jan Steemann
/// @author Alan Plum
/// @author Copyright 2012, triAGENS GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////

var internal = require("internal");
var fs = require("fs");
var console = require("console");
var _ = require('underscore')

var JSHINT = require("jshint").JSHINT;
var jshintrc = {};

try {
  jshintrc = JSON.parse(fs.read('./js/.jshintrc'));
}
catch (err) {
  // ignore any errors
}

// -----------------------------------------------------------------------------
// --SECTION--                                                  public functions
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief runs a JSLint test on a file
////////////////////////////////////////////////////////////////////////////////

function RunTest (path, options) {
  var content;

  try {
    content = fs.read(path);
  }
  catch (err) {
    console.error("cannot load test file '%s'", path);
    return;
  }

  var result = { };
  content = content.replace("/*jslint", "/*xxxxxx");
  result["passed"] = JSHINT(content, _.extend({}, jshintrc, options));

  if (JSHINT.errors) {
    result["errors"] = JSHINT.errors;
  }

  return result;
}

////////////////////////////////////////////////////////////////////////////////
/// @brief runs tests from command-line
////////////////////////////////////////////////////////////////////////////////

function RunCommandLineTests (options) {
  var result = true;
  var tests = internal.unitTests();

  for (var i = 0;  i < tests.length;  ++i) {
    var file = tests[i];

    try {
      var testResult = RunTest(file, options);
      result = result && testResult && testResult.passed;
      if (testResult && (! testResult.passed && testResult.errors)) {
        for (var j = 0; j < testResult.errors.length; ++j) {
          var err = testResult.errors[j];
          if (! err) {
            continue;
          }

          var position = file + ":" + err.line + ", " + err.character;
          var reason = err.reason;
          console.error("jslint: %s : %s", position, reason);
        }
      }
      else {
        console.info("jslint: %s passed", file);
      }
    }
    catch (err) {
      print("cannot run test file '" + file + "': " + err);
      print(err.stack);
      result = false;
    }
  }

  internal.setUnitTestsResult(result);
}

// -----------------------------------------------------------------------------
// --SECTION--                                                    MODULE EXPORTS
// -----------------------------------------------------------------------------

exports.runTest = RunTest;
exports.runCommandLineTests = RunCommandLineTests;

// Local Variables:
// mode: outline-minor
// outline-regexp: "^\\(/// @brief\\|/// @addtogroup\\|// --SECTION--\\|/// @page\\|/// @}\\)"
// End:
