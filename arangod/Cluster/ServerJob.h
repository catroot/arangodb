////////////////////////////////////////////////////////////////////////////////
/// @brief Cluster server job
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
/// @author Copyright 2009-2014, triAGENS GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////

#ifndef ARANGODB_CLUSTER_SERVER_JOB_H
#define ARANGODB_CLUSTER_SERVER_JOB_H 1

#include "Basics/Common.h"
#include "Basics/Exceptions.h"
#include "Basics/Mutex.h"
#include "Dispatcher/Job.h"
#include "Rest/Handler.h"

struct TRI_server_s;

// -----------------------------------------------------------------------------
// --SECTION--                                                 class ServerJob
// -----------------------------------------------------------------------------

namespace triagens {
  namespace arango {
    class HeartbeatThread;
    class ApplicationV8;

////////////////////////////////////////////////////////////////////////////////
/// @brief general server job
////////////////////////////////////////////////////////////////////////////////

    class ServerJob : public triagens::rest::Job {
      private:
        ServerJob (ServerJob const&) = delete;
        ServerJob& operator= (ServerJob const&) = delete;

// -----------------------------------------------------------------------------
// --SECTION--                                      constructors and destructors
// -----------------------------------------------------------------------------

      public:

////////////////////////////////////////////////////////////////////////////////
/// @brief constructs a new db server job
////////////////////////////////////////////////////////////////////////////////

        ServerJob (HeartbeatThread* heartbeat,
                   struct TRI_server_s* server,
                   ApplicationV8* applicationV8);

////////////////////////////////////////////////////////////////////////////////
/// @brief destructs a db server job
////////////////////////////////////////////////////////////////////////////////

        ~ServerJob ();

// -----------------------------------------------------------------------------
// --SECTION--                                                    public methods
// -----------------------------------------------------------------------------

      public:

////////////////////////////////////////////////////////////////////////////////
/// @brief abandon job
////////////////////////////////////////////////////////////////////////////////

        void abandon ();

// -----------------------------------------------------------------------------
// --SECTION--                                                       Job methods
// -----------------------------------------------------------------------------

      public:

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

        JobType type () const {
          return Job::READ_JOB;
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief whether or not the job is detached
////////////////////////////////////////////////////////////////////////////////

        inline bool isDetached () const {
          return true;
        }

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

        Job::status_t work () override;

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

        bool cancel (bool running) override;

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

        void cleanup () {
          delete this;
        }

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

        bool beginShutdown () {
          _shutdown = 1;
          return true;
        }

////////////////////////////////////////////////////////////////////////////////
/// {@inheritDoc}
////////////////////////////////////////////////////////////////////////////////

        void handleError (basics::Exception const& ex) {
        }

// -----------------------------------------------------------------------------
// --SECTION--                                                   private methods
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief execute job
////////////////////////////////////////////////////////////////////////////////

        bool execute ();

// -----------------------------------------------------------------------------
// --SECTION--                                                 private variables
// -----------------------------------------------------------------------------

      private:

////////////////////////////////////////////////////////////////////////////////
/// @brief the heartbeat thread
////////////////////////////////////////////////////////////////////////////////

        HeartbeatThread* _heartbeat;

////////////////////////////////////////////////////////////////////////////////
/// @brief server
////////////////////////////////////////////////////////////////////////////////

        struct TRI_server_s* _server;

////////////////////////////////////////////////////////////////////////////////
/// @brief v8 dispatcher
////////////////////////////////////////////////////////////////////////////////

        ApplicationV8* _applicationV8;

// -----------------------------------------------------------------------------
// --SECTION--                                               protected variables
// -----------------------------------------------------------------------------

      protected:

////////////////////////////////////////////////////////////////////////////////
/// @brief shutdown in progress
////////////////////////////////////////////////////////////////////////////////

        volatile sig_atomic_t _shutdown;

////////////////////////////////////////////////////////////////////////////////
/// @brief server is dead lock
////////////////////////////////////////////////////////////////////////////////

        basics::Mutex _abandonLock;

////////////////////////////////////////////////////////////////////////////////
/// @brief server is dead
////////////////////////////////////////////////////////////////////////////////

        bool _abandon;

    };
  }
}

#endif

// -----------------------------------------------------------------------------
// --SECTION--                                                       END-OF-FILE
// -----------------------------------------------------------------------------

// Local Variables:
// mode: outline-minor
// outline-regexp: "/// @brief\\|/// {@inheritDoc}\\|/// @page\\|// --SECTION--\\|/// @\\}"
// End:
