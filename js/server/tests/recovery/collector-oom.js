/*jshint globalstrict: false, unused : false */
/*global require,  assertEqual */

////////////////////////////////////////////////////////////////////////////////
/// @brief tests for dump/reload
///
/// @file
///
/// DISCLAIMER
///
/// Copyright 2010-2012 triagens GmbH, Cologne, Germany
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
/// @author Copyright 2012, triAGENS GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////

var db = require("org/arangodb").db;
var internal = require("internal");
var jsunity = require("jsunity");


function runSetup () {
  "use strict";
  internal.debugClearFailAt();
  
  db._drop("UnitTestsRecovery");
  var c = db._create("UnitTestsRecovery"), i;
  for (i = 0; i < 10000; ++i) {
    c.save({ _key: "test" + i, value1: "test" + i, value2: i }); 
  }

  internal.debugSetFailAt("CollectorThreadProcessQueuedOperations");
  internal.wal.flush(true, false);
  internal.wait(5);

  internal.debugSegfault("crashing server");
}

////////////////////////////////////////////////////////////////////////////////
/// @brief test suite
////////////////////////////////////////////////////////////////////////////////

function recoverySuite () {
  "use strict";
  jsunity.jsUnity.attachAssertions();

  return {
    setUp: function () {
    },
    tearDown: function () {
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief test whether we can restore the data
////////////////////////////////////////////////////////////////////////////////
    
    testCollectorOom : function () {
      var i, c = db._collection("UnitTestsRecovery");
        
      assertEqual(10000, c.count());
      for (i = 0; i < 10000; ++i) {
        var doc = c.document("test" + i);

        assertEqual("test" + i, doc.value1);
        assertEqual(i, doc.value2);
      }
    }
        
  };
}

////////////////////////////////////////////////////////////////////////////////
/// @brief executes the test suite
////////////////////////////////////////////////////////////////////////////////

function main (argv) {
  "use strict";
  if (argv[1] === "setup") {
    runSetup();
    return 0;
  }
  else {
    jsunity.run(recoverySuite);
    return jsunity.done().status ? 0 : 1;
  }
}

