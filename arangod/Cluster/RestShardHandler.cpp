////////////////////////////////////////////////////////////////////////////////
/// @brief shard control request handler
///
/// @file
///
/// DISCLAIMER
///
/// Copyright 2014 ArangoDB GmbH, Cologne, Germany
/// Copyright 2004-2014 triAGENS GmbH, Cologne, Germany
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
/// @author Jan Steemann
/// @author Copyright 2014, ArangoDB GmbH, Cologne, Germany
/// @author Copyright 2010-2014, triAGENS GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////

#include "RestShardHandler.h"

#include "Basics/ConditionLocker.h"
#include "Cluster/ServerState.h"
#include "Cluster/ClusterComm.h"
#include "Dispatcher/Dispatcher.h"
#include "Rest/HttpRequest.h"
#include "Rest/HttpResponse.h"
#include "HttpServer/HttpServer.h"
#include "HttpServer/HttpHandlerFactory.h"

using namespace std;
using namespace triagens::arango;
using namespace triagens::rest;

// -----------------------------------------------------------------------------
// --SECTION--                                      constructors and destructors
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief constructor
////////////////////////////////////////////////////////////////////////////////

RestShardHandler::RestShardHandler (triagens::rest::HttpRequest* request,
                                    Dispatcher* data)
  : RestBaseHandler(request),
    _dispatcher(data) {
  TRI_ASSERT(_dispatcher != nullptr);
}

// -----------------------------------------------------------------------------
// --SECTION--                                                   Handler methods
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

bool RestShardHandler::isDirect () const {
  return true;
}

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

triagens::rest::HttpHandler::status_t RestShardHandler::execute () {
  // Deactivated to allow for asynchronous cluster internal communication 
  // between two DBservers. 30.7.2014 Max.
#if 0
  ServerState::RoleEnum role = ServerState::instance()->getRole();
  if (role != ServerState::ROLE_COORDINATOR) {
    generateError(triagens::rest::HttpResponse::BAD,
                  (int) triagens::rest::HttpResponse::BAD,
                  "this API is meant to be called on a coordinator node");
    return status_t(HANDLER_DONE);
  }
#endif

  bool found;
  char const* _coordinator = _request->header("x-arango-coordinator", found);

  if (! found) {
    generateError(triagens::rest::HttpResponse::BAD,
                  (int) triagens::rest::HttpResponse::BAD,
                  "header 'X-Arango-Coordinator' is missing");
    return status_t(HANDLER_DONE);
  }

  string coordinatorHeader = _coordinator;
  string result = ClusterComm::instance()->processAnswer(coordinatorHeader,
                                                         stealRequest());

  if (result == "") {
    _response = createResponse(triagens::rest::HttpResponse::ACCEPTED);
  }
  else {
    generateError(triagens::rest::HttpResponse::BAD,
                  (int) triagens::rest::HttpResponse::BAD,
                  result.c_str());
  }

  return status_t(HANDLER_DONE);
}

// -----------------------------------------------------------------------------
// --SECTION--                                                       END-OF-FILE
// -----------------------------------------------------------------------------

// Local Variables:
// mode: outline-minor
// outline-regexp: "/// @brief\\|/// {@inheritDoc}\\|/// @page\\|// --SECTION--\\|/// @\\}"
// End:
