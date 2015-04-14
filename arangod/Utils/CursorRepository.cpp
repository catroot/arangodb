////////////////////////////////////////////////////////////////////////////////
/// @brief list of cursors present in database
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
/// @author Copyright 2012-2013, triAGENS GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////

#include "Utils/CursorRepository.h"
#include "Basics/json.h"
#include "Basics/MutexLocker.h"
#include "Utils/CollectionExport.h"
#include "VocBase/server.h"
#include "VocBase/vocbase.h"

using namespace triagens::arango;

// -----------------------------------------------------------------------------
// --SECTION--                                                  CursorRepository
// -----------------------------------------------------------------------------

size_t const CursorRepository::MaxCollectCount = 32;

// -----------------------------------------------------------------------------
// --SECTION--                                        constructors / destructors
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief create a cursor repository
////////////////////////////////////////////////////////////////////////////////

CursorRepository::CursorRepository (TRI_vocbase_t* vocbase) 
  : _vocbase(vocbase),
    _lock(),
    _cursors() {

  _cursors.reserve(64);
}

////////////////////////////////////////////////////////////////////////////////
/// @brief destroy a cursor repository
////////////////////////////////////////////////////////////////////////////////

CursorRepository::~CursorRepository () {
  MUTEX_LOCKER(_lock);

  for (auto it : _cursors) {
    delete it.second;
  }
  _cursors.clear();
}

// -----------------------------------------------------------------------------
// --SECTION--                                                    public methods
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief creates a cursor and stores it in the registry
/// the cursor will be returned with the usage flag set to true. it must be
/// returned later using release() 
/// the cursor will take ownership of both json and extra
////////////////////////////////////////////////////////////////////////////////

JsonCursor* CursorRepository::createFromJson (TRI_json_t* json,
                                              size_t batchSize,
                                              TRI_json_t* extra,
                                              double ttl,
                                              bool count) {
  TRI_ASSERT(json != nullptr);

  CursorId const id = TRI_NewTickServer();
  triagens::arango::JsonCursor* cursor = nullptr;

  try {
    cursor = new triagens::arango::JsonCursor(_vocbase, id, json, batchSize, extra, ttl, count);
  }
  catch (...) {
    TRI_FreeJson(TRI_UNKNOWN_MEM_ZONE, json);
    if (extra != nullptr) {
      TRI_FreeJson(TRI_UNKNOWN_MEM_ZONE, extra);
    }
    throw;
  }

  cursor->use();

  try {
    MUTEX_LOCKER(_lock);
    _cursors.emplace(std::make_pair(id, cursor));
    return cursor;
  }
  catch (...) {
    delete cursor;
    throw;
  }
}

////////////////////////////////////////////////////////////////////////////////
/// @brief creates a cursor and stores it in the registry
////////////////////////////////////////////////////////////////////////////////

ExportCursor* CursorRepository::createFromExport (triagens::arango::CollectionExport* ex,
                                                  size_t batchSize,
                                                  double ttl,
                                                  bool count) {
  TRI_ASSERT(ex != nullptr);

  CursorId const id = TRI_NewTickServer();
  triagens::arango::ExportCursor* cursor = new triagens::arango::ExportCursor(_vocbase, id, ex, batchSize, ttl, count);

  cursor->use();

  try {
    MUTEX_LOCKER(_lock);
    _cursors.emplace(std::make_pair(id, cursor));
    return cursor;
  }
  catch (...) {
    delete cursor;
    throw;
  }
}

////////////////////////////////////////////////////////////////////////////////
/// @brief remove a cursor by id
////////////////////////////////////////////////////////////////////////////////

bool CursorRepository::remove (CursorId id) {
  triagens::arango::Cursor* cursor = nullptr;
  
  {
    MUTEX_LOCKER(_lock);

    auto it = _cursors.find(id);
    if (it == _cursors.end()) {
      // not found
      return false;
    }

    cursor = (*it).second;

    if (cursor->isDeleted()) {
      // already deleted
      return false;
    }
   
    if (cursor->isUsed()) {
      // cursor is in use by someone else. now mark as deleted
      cursor->deleted();
      return true;
    }

    // cursor not in use by someone else
    _cursors.erase(it);
  }

  TRI_ASSERT(cursor != nullptr);

  delete cursor;
  return true;
}

////////////////////////////////////////////////////////////////////////////////
/// @brief find an existing cursor by id
/// if found, the cursor will be returned with the usage flag set to true. 
/// it must be returned later using release() 
////////////////////////////////////////////////////////////////////////////////

Cursor* CursorRepository::find (CursorId id,
                                bool& busy) {
  triagens::arango::Cursor* cursor = nullptr;
  busy = false;

  {
    MUTEX_LOCKER(_lock);

    auto it = _cursors.find(id);
    if (it == _cursors.end()) {
      // not found
      return nullptr;
    }

    cursor = (*it).second;

    if (cursor->isDeleted()) { 
      // already deleted
      return nullptr;
    }

    if (cursor->isUsed()) {
      busy = true;
      return nullptr;
    }

    cursor->use();
  }

  return cursor;
}

////////////////////////////////////////////////////////////////////////////////
/// @brief return a cursor
////////////////////////////////////////////////////////////////////////////////

void CursorRepository::release (Cursor* cursor) {
  {
    MUTEX_LOCKER(_lock);
  
    TRI_ASSERT(cursor->isUsed());
    cursor->release();

    if (! cursor->isDeleted()) {
      return;
    }

    // remove from the list
    _cursors.erase(cursor->id());
  }

  // and free the cursor
  delete cursor;
}

////////////////////////////////////////////////////////////////////////////////
/// @brief run a garbage collection on the cursors
////////////////////////////////////////////////////////////////////////////////

bool CursorRepository::garbageCollect (bool force) {
  std::vector<triagens::arango::Cursor*> found;
  found.reserve(MaxCollectCount);

  auto const now = TRI_microtime();

  {
    MUTEX_LOCKER(_lock);

    for (auto it = _cursors.begin(); it != _cursors.end(); /* no hoisting */) {
      auto cursor = (*it).second;

      if (cursor->isUsed()) {
        // must not destroy used cursors
        ++it;
        continue;
      } 
   
      if (force || cursor->expires() < now) {
        cursor->deleted();
      }  

      if (cursor->isDeleted()) {
        try {
          found.emplace_back(cursor);
          it = _cursors.erase(it);
        }
        catch (...) {
          // stop iteration
          break;
        }

        if (! force &&
            found.size() >= MaxCollectCount) {
          break;
        }
      }
      else {
        ++it;
      }
    }
  }

  // remove cursors outside the lock
  for (auto it : found) {
    delete it;
  }

  return (! found.empty());
}

// -----------------------------------------------------------------------------
// --SECTION--                                                       END-OF-FILE
// -----------------------------------------------------------------------------

// Local Variables:
// mode: outline-minor
// outline-regexp: "/// @brief\\|/// {@inheritDoc}\\|/// @page\\|// --SECTION--\\|/// @\\}"
// End:
