////////////////////////////////////////////////////////////////////////////////
/// @brief V8 queue job
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
/// @author Dr. Frank Celler
/// @author Copyright 2014, triAGENS GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////

#include "V8QueueJob.h"

#include "Basics/json.h"
#include "Basics/logging.h"
#include "V8/v8-conv.h"
#include "V8/v8-utils.h"
#include "V8Server/ApplicationV8.h"
#include "VocBase/vocbase.h"

using namespace std;
using namespace triagens::basics;
using namespace triagens::rest;
using namespace triagens::arango;

// -----------------------------------------------------------------------------
// --SECTION--                                      constructors and destructors
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief constructs a new V8 job
////////////////////////////////////////////////////////////////////////////////

V8QueueJob::V8QueueJob (const string& queue,
                        TRI_vocbase_t* vocbase,
                        ApplicationV8* v8Dealer,
                        TRI_json_t const* parameters)
  : Job("V8 Queue Job"),
    _queue(queue),
    _vocbase(vocbase),
    _v8Dealer(v8Dealer),
    _parameters(nullptr),
    _canceled(0) {

  if (parameters != nullptr) {
    // create our own copy of the parameters
    _parameters = TRI_CopyJson(TRI_UNKNOWN_MEM_ZONE, parameters);
  }
}

////////////////////////////////////////////////////////////////////////////////
/// @brief destroys a V8 job
////////////////////////////////////////////////////////////////////////////////

V8QueueJob::~V8QueueJob () {
  if (_parameters != nullptr) {
    TRI_FreeJson(TRI_UNKNOWN_MEM_ZONE, _parameters);
    _parameters = nullptr;
  }
}

// -----------------------------------------------------------------------------
// --SECTION--                                                       Job methods
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

Job::JobType V8QueueJob::type () const {
  return READ_JOB;
}

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

string const& V8QueueJob::queue () const {
  return _queue;
}

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

Job::status_t V8QueueJob::work () {
  if (_canceled) {
    return status_t(JOB_DONE);
  }

  ApplicationV8::V8Context* context = _v8Dealer->enterContext(_queue, _vocbase, false);

  // note: the context might be 0 in case of shut-down
  if (context == nullptr) {
    return status_t(JOB_DONE);
  }

  // now execute the function within this context
  {
    auto isolate = context->isolate;
    v8::HandleScope scope(isolate);

    // get built-in Function constructor (see ECMA-262 5th edition 15.3.2)
    auto current = isolate->GetCurrentContext()->Global();
    auto main = v8::Local<v8::Function>::Cast(current->Get(TRI_V8_ASCII_STRING("MAIN")));

    if (main.IsEmpty()) {
      _v8Dealer->exitContext(context);
      return status_t(JOB_DONE);
    }

    v8::Handle<v8::Value> fArgs;

    if (_parameters != nullptr) {
      fArgs = TRI_ObjectJson(isolate, _parameters);
    }
    else {
      fArgs = v8::Undefined(isolate);
    }

    // call the function
    v8::TryCatch tryCatch;
    main->Call(current, 1, &fArgs);

    if (tryCatch.HasCaught()) {
      if (tryCatch.CanContinue()) {
        TRI_LogV8Exception(isolate, &tryCatch);
      }
      else {
        TRI_GET_GLOBALS();

        v8g->_canceled = true;
        LOG_WARNING("caught non-catchable exception (aka termination) in V8 queue job");
      }
    }
  }

  _v8Dealer->exitContext(context);

  return status_t(JOB_DONE);
}

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

bool V8QueueJob::cancel (bool running) {
  if (running) {
    _canceled = 1;
  }

  return true;
}

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

void V8QueueJob::cleanup () {
  delete this;
}

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

bool V8QueueJob::beginShutdown () {
  return true;
}

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

void V8QueueJob::handleError (Exception const& ex) {
}

// -----------------------------------------------------------------------------
// --SECTION--                                                       END-OF-FILE
// -----------------------------------------------------------------------------

// Local Variables:
// mode: outline-minor
// outline-regexp: "/// @brief\\|/// {@inheritDoc}\\|/// @page\\|// --SECTION--\\|/// @\\}"
// End:
