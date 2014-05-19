/*jslint indent: 2, nomen: true, maxlen: 100, sloppy: true, vars: true, white: true, plusplus: true */
/*global require, exports, Graph, arguments */

////////////////////////////////////////////////////////////////////////////////
/// @brief Graph functionality
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
/// @author Florian Bartels
/// @author Copyright 2011-2014, triAGENS GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////


var arangodb = require("org/arangodb"),
  ArangoCollection = arangodb.ArangoCollection,
  db = arangodb.db,
  _ = require("underscore");


// -----------------------------------------------------------------------------
// --SECTION--                             module "org/arangodb/general-graph"
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// --SECTION--                                                 private functions
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief transform a string into an array.
////////////////////////////////////////////////////////////////////////////////


var stringToArray = function (x) {
  if (typeof x === "string") {
    return [x];
  }
  return x;
};

////////////////////////////////////////////////////////////////////////////////
/// @brief checks if a parameter is not defined, an empty string or an empty
//  array
////////////////////////////////////////////////////////////////////////////////


var isValidCollectionsParameter = function (x) {
  if (!x) {
    return false;
  }
  if (Array.isArray(x) && x.length === 0) {
    return false;
  }
  if (typeof x !== "string" && !Array.isArray(x)) {
    return false;
  }
  return true;
};

////////////////////////////////////////////////////////////////////////////////
/// @brief find or create a collection by name
////////////////////////////////////////////////////////////////////////////////

var findOrCreateCollectionByName = function (name, type) {
  var col = db._collection(name),res = false;
  if (col === null) {
    if (type === ArangoCollection.TYPE_DOCUMENT) {
      col = db._create(name);
    } else {
      col = db._createEdgeCollection(name);
    }
    res = true;
  } else if (!(col instanceof ArangoCollection) || col.type() !== type) {
    throw "<" + name + "> must be a " +
    (type === ArangoCollection.TYPE_DOCUMENT ? "document" : "edge")
    + " collection";
  }
  return res;
};

// -----------------------------------------------------------------------------
// --SECTION--                             module "org/arangodb/general-graph"
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// --SECTION--                             Fluent AQL bindins
// -----------------------------------------------------------------------------

var bindFluentAQLFunctionsToArray = function(arr) {
  var filter = arr.filter.bind(arr);
  arr.restrict = function(collections) {
    if (typeof collections === "string") {
      collections = [collections];
    }
    if (!Array.isArray(collections)) {
      throw "Restrict requires either one collection name, or a list of them.";
    }
    var res = filter(function(i) {
      var colName = i._id.split("/")[0];
      return _.contains(collections, colName);
    });
    return res;
  };
};


// -----------------------------------------------------------------------------
// --SECTION--                                                 public functions
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief define an undirected relation.
////////////////////////////////////////////////////////////////////////////////


var _undirectedRelationDefinition = function (relationName, vertexCollections) {

  if (arguments.length < 2) {
    throw "method _undirectedRelationDefinition expects 2 arguments";
  }

  if (typeof relationName !== "string" || relationName === "") {
    throw "<relationName> must be a not empty string";
  }

  if (!isValidCollectionsParameter(vertexCollections)) {
    throw "<vertexCollections> must be a not empty string or array";
  }

  return {
    collection: relationName,
    from: stringToArray(vertexCollections),
    to: stringToArray(vertexCollections)
  };
};


////////////////////////////////////////////////////////////////////////////////
/// @brief define an directed relation.
////////////////////////////////////////////////////////////////////////////////


var _directedRelationDefinition = function (
  relationName, fromVertexCollections, toVertexCollections) {

  if (arguments.length < 3) {
    throw "method _undirectedRelationDefinition expects 3 arguments";
  }

  if (typeof relationName !== "string" || relationName === "") {
    throw "<relationName> must be a not empty string";
  }

  if (!isValidCollectionsParameter(fromVertexCollections)) {
    throw "<fromVertexCollections> must be a not empty string or array";
  }

  if (!isValidCollectionsParameter(toVertexCollections)) {
    throw "<toVertexCollections> must be a not empty string or array";
  }

  return {
    collection: relationName,
    from: stringToArray(fromVertexCollections),
    to: stringToArray(toVertexCollections)
  };
};

////////////////////////////////////////////////////////////////////////////////
/// @brief create a list of edge definitions
////////////////////////////////////////////////////////////////////////////////


var edgeDefinitions = function () {

  var res = [], args = arguments;
  Object.keys(args).forEach(function (x) {
    res.push(args[x]);
  });

  return res;

};

////////////////////////////////////////////////////////////////////////////////
/// @brief create a new graph
////////////////////////////////////////////////////////////////////////////////


var _create = function (graphName, edgeDefinitions) {

  var gdb = db._collection("_graphs"),
    g,
    graphAlreadyExists = true;

  if (gdb === null) {
    throw "_graphs collection does not exist.";
  }

  if (!graphName) {
    throw "a graph name is required to create a graph.";
  }
  if (!Array.isArray(edgeDefinitions) || edgeDefinitions.length === 0) {
    throw "at least one edge definition is required to create a graph.";
  }

  try {
    g = gdb.document(graphName);
  } catch (e) {
    if (e.errorNum !== 1202) {
      throw e;
    }
    graphAlreadyExists = false;
  }

  if (graphAlreadyExists) {
    throw "graph " + graphName + " already exists.";
  }

  var vertexCollections = {};
  var edgeCollections = {};
  edgeDefinitions.forEach(function (e) {
    e.from.concat(e.to).forEach(function (v) {
      findOrCreateCollectionByName(v, ArangoCollection.TYPE_DOCUMENT);
      vertexCollections[v] = db[v];
    });
    findOrCreateCollectionByName(e.collection, ArangoCollection.TYPE_EDGE);
    edgeCollections[e.collection] = db[e.collection];
  });

  gdb.save({
    'edgeDefinitions' : edgeDefinitions,
    '_key' : graphName
  });

  return new Graph(graphName, edgeDefinitions, vertexCollections, edgeCollections);
};



////////////////////////////////////////////////////////////////////////////////
/// @brief load a graph.
////////////////////////////////////////////////////////////////////////////////

var Graph = function(graphName, edgeDefinitions, vertexCollections, edgeCollections) {
  var self = this;
  this.__vertexCollections = vertexCollections;
  this.__edgeCollections = edgeCollections;
  this.__edgeDefinitions = edgeDefinitions;


  _.each(vertexCollections, function(obj, key) {
    self[key] = obj;
  });

  _.each(edgeCollections, function(obj, key) {
    self[key] = obj;
  });

};

var _graph = function() {
  return new Graph();
};

////////////////////////////////////////////////////////////////////////////////
/// @brief return all edge collections of the graph.
////////////////////////////////////////////////////////////////////////////////

Graph.prototype._edgeCollections = function() {
  return _.values(this.__edgeCollections);
};

////////////////////////////////////////////////////////////////////////////////
/// @brief return all vertex collections of the graph.
////////////////////////////////////////////////////////////////////////////////

Graph.prototype._vertexCollections = function() {
  return _.values(this.__vertexCollections);
};

////////////////////////////////////////////////////////////////////////////////
/// @brief _edges(vertexId).
////////////////////////////////////////////////////////////////////////////////

Graph.prototype._edges = function(vertexId) {
  var edgeCollections = this._edgeCollections();
  var result = [];


  edgeCollections.forEach(
    function(edgeCollection) {
      //todo: test, if collection may point to vertex
      result = result.concat(edgeCollection.edges(vertexId));
    }
  );
  bindFluentAQLFunctionsToArray(result);
  return result;
};

////////////////////////////////////////////////////////////////////////////////
/// @brief inEdges(vertexId).
////////////////////////////////////////////////////////////////////////////////

Graph.prototype._inEdges = function(vertexId) {
  var edgeCollections = this._edgeCollections();
  var result = [];


  edgeCollections.forEach(
    function(edgeCollection) {
      //todo: test, if collection may point to vertex
      result = result.concat(edgeCollection.inEdges(vertexId));
    }
  );
  bindFluentAQLFunctionsToArray(result);
  return result;
};

////////////////////////////////////////////////////////////////////////////////
/// @brief outEdges(vertexId).
////////////////////////////////////////////////////////////////////////////////

Graph.prototype._outEdges = function(vertexId) {
  var edgeCollections = this._edgeCollections();
  var result = [];


  edgeCollections.forEach(
    function(edgeCollection) {
      //todo: test, if collection may point to vertex
      result = result.concat(edgeCollection.outEdges(vertexId));
    }
  );
  bindFluentAQLFunctionsToArray(result);
  return result;
};

////////////////////////////////////////////////////////////////////////////////
/// @brief get ingoing vertex of an edge.
////////////////////////////////////////////////////////////////////////////////

Graph.prototype._getInVertex = function(edgeId) {
  var edgeCollection = this._getEdgeCollectionByName(edgeId.split("/")[0]);
  var document = edgeCollection.document(edgeId);
  if (document) {
    var vertexId = document._from;
    var vertexCollection = this._getVertexCollectionByName(vertexId.split("/")[0]);
    return vertexCollection.document(vertexId);
  }
};

////////////////////////////////////////////////////////////////////////////////
/// @brief get outgoing vertex of an edge .
////////////////////////////////////////////////////////////////////////////////

Graph.prototype._getOutVertex = function(edgeId) {
  var edgeCollection = this._getEdgeCollectionByName(edgeId.split("/")[0]);
  var document = edgeCollection.document(edgeId);
  if (document) {
    var vertexId = document._to;
    var vertexCollection = this._getVertexCollectionByName(vertexId.split("/")[0]);
    return vertexCollection.document(vertexId);
  }
};


////////////////////////////////////////////////////////////////////////////////
/// @brief get edge collection by name.
////////////////////////////////////////////////////////////////////////////////

Graph.prototype._getEdgeCollectionByName = function(name) {
  if (this.__edgeCollections[name]) {
    return this.__edgeCollections[name];
  }
  throw "Collection " + name + " does not exist in graph.";
};

////////////////////////////////////////////////////////////////////////////////
/// @brief get vertex collection by name.
////////////////////////////////////////////////////////////////////////////////

Graph.prototype._getVertexCollectionByName = function(name) {
  if (this.__vertexCollections[name]) {
    return this.__vertexCollections[name];
  }
  throw "Collection " + name + " does not exist in graph.";
};

// -----------------------------------------------------------------------------
// --SECTION--                                                    MODULE EXPORTS
// -----------------------------------------------------------------------------

exports._undirectedRelationDefinition = _undirectedRelationDefinition;
exports._directedRelationDefinition = _directedRelationDefinition;
exports._graph = _graph;
exports.edgeDefinitions = edgeDefinitions;
exports._create = _create;

// -----------------------------------------------------------------------------
// --SECTION--                                                       END-OF-FILE
// -----------------------------------------------------------------------------

// Local Variables:
// mode: outline-minor
// outline-regexp: "^\\(/// @brief\\|/// @addtogroup\\|// --SECTION--\\|/// @page\\|/// @}\\)"
// End:
