/*jshint -W051:true */
'use strict';

////////////////////////////////////////////////////////////////////////////////
/// @brief initialise a new database
///
/// @file
///
/// DISCLAIMER
///
/// Copyright 2014 ArangoDB GmbH, Cologne, Germany
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
/// Copyright holder is ArangoDB GmbH, Cologne, Germany
///
/// @author Dr. Frank Celler
/// @author Copyright 2014, ArangoDB GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
// --SECTION--                                         initialise a new database
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief initialise a new database
////////////////////////////////////////////////////////////////////////////////

(function () {
  var internal = require("internal");
  var console = require("console");
  var db = internal.db;

  // run the upgrade-database script
  var result = internal.loadStartup("server/upgrade-database.js");

  result = global.UPGRADE_STARTED && result;
  delete global.UPGRADE_STARTED;
  delete global.UPGRADE_ARGS;

  // set-up foxx routes for this database
  if (result) {
    internal.loadStartup("server/bootstrap/foxxes.js").foxx();
  }
  else {
    console.error("cannot initialise database '%s', upgrade script failed", db._name());
  }

  return result;
}());

// -----------------------------------------------------------------------------
// --SECTION--                                                       END-OF-FILE
// -----------------------------------------------------------------------------

// Local Variables:
// mode: outline-minor
// outline-regexp: "/// @brief\\|/// {@inheritDoc}\\|/// @page\\|// --SECTION--\\|/// @\\}"
// End:
