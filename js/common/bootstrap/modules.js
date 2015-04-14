/*jshint -W051:true */
'use strict';

////////////////////////////////////////////////////////////////////////////////
/// @brief JavaScript server functions
///
/// @file
///
/// DISCLAIMER
///
/// Copyright 2011-2014 triAGENS GmbH, Cologne, Germany
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
/// @author Dr. Frank Celler
/// @author Copyright 2011-2014, triAGENS GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
// --SECTION--                                                  global variables
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief top-level module
////////////////////////////////////////////////////////////////////////////////

global.module = null;

// -----------------------------------------------------------------------------
// --SECTION--                                                  global functions
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief global require function
////////////////////////////////////////////////////////////////////////////////

function require (path) {
  return global.module.require(path);
}

// -----------------------------------------------------------------------------
// --SECTION--                                                 private variables
// -----------------------------------------------------------------------------

(function () {

////////////////////////////////////////////////////////////////////////////////
/// @brief running under windows
////////////////////////////////////////////////////////////////////////////////

  var isWindows = global.SYS_PLATFORM.substr(0, 3) === 'win';

////////////////////////////////////////////////////////////////////////////////
/// @brief appPath
////////////////////////////////////////////////////////////////////////////////

  var appPath;

  if (global.APP_PATH) {
    appPath = global.APP_PATH;
    delete global.APP_PATH;
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief devAppPath
////////////////////////////////////////////////////////////////////////////////

  var devAppPath;

  if (global.DEV_APP_PATH) {
    devAppPath = global.DEV_APP_PATH;
    delete global.DEV_APP_PATH;
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief modulesPath
////////////////////////////////////////////////////////////////////////////////

  var modulesPaths = [];

  if (global.MODULES_PATH) {
    modulesPaths = global.MODULES_PATH;
    delete global.MODULES_PATH;
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief startupPath
////////////////////////////////////////////////////////////////////////////////

  var startupPath = "";

  if (global.STARTUP_PATH) {
    startupPath = global.STARTUP_PATH;
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief systemPackage
////////////////////////////////////////////////////////////////////////////////

  var systemPackage = [];

////////////////////////////////////////////////////////////////////////////////
/// @brief globalPackages
////////////////////////////////////////////////////////////////////////////////

  var globalPackages = [];

////////////////////////////////////////////////////////////////////////////////
/// @brief module "internal" declaration
////////////////////////////////////////////////////////////////////////////////

  var internal;

////////////////////////////////////////////////////////////////////////////////
/// @brief module "fs" declaration
////////////////////////////////////////////////////////////////////////////////

  var fs;

////////////////////////////////////////////////////////////////////////////////
/// @brief module "console" declaration
////////////////////////////////////////////////////////////////////////////////

  var console;

////////////////////////////////////////////////////////////////////////////////
/// @brief Package constructor declaration
////////////////////////////////////////////////////////////////////////////////

  var Package;

////////////////////////////////////////////////////////////////////////////////
/// @brief Module constructor declaration
////////////////////////////////////////////////////////////////////////////////

  var Module;

////////////////////////////////////////////////////////////////////////////////
/// @brief in-flight modules
///
/// These modules are currently loading and must be cleanup when a cancellation
/// occured.
////////////////////////////////////////////////////////////////////////////////

  var inFlight = {};

// -----------------------------------------------------------------------------
// --SECTION--                                                 private functions
// -----------------------------------------------------------------------------

  function extend(a, b) {
    if (b) {
      Object.keys(b).forEach(function (key) {
        a[key] = b[key];
      });
    }
    return a;
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief normalizes a module name
///
/// If @FA{path} starts with "." or "..", then it is a relative path.
/// Otherwise it is an absolute path.
///
/// @FA{prefix} must not end in `/` unless it is equal to `"/"`.
///
/// The normalized name will start with a `/`, but does not end in `/' unless it
/// is equal to `"/"`.
////////////////////////////////////////////////////////////////////////////////

  function normalizeModuleName (prefix, path) {

    var i;

    if (path === undefined) {
      path = prefix;
      prefix = "";
    }

    if (path === "") {
      return prefix;
    }

    var p = path.split('/');
    var q;

    // relative path
    if (p[0] === "." || p[0] === "..") {
      q = prefix.split('/');
      if (q[q.length - 1].indexOf('.') > 0) {
        q = q.slice(0, -1);
      }
      q = q.concat(p);
    }

    // absolute path
    else {
      q = p;
    }

    // normalize path
    var n = [];

    for (i = 0;  i < q.length;  ++i) {
      var x = q[i];

      if (x === "..") {
        if (n.length === 0) {
          throw new internal.ArangoError({
            errorNum: internal.errors.ERROR_MODULE_CAN_NOT_ESCAPE.code,
            errorMessage: internal.errors.ERROR_MODULE_CAN_NOT_ESCAPE.message
            + " Prefix: " + prefix
            + " Path: " + path
          });
        }

        n.pop();
      }
      else if (x !== "" && x !== ".") {
        n.push(x);
      }
    }

    return "/" + n.join('/');
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief converts a path into a file uri
////////////////////////////////////////////////////////////////////////////////

  function path2FileUri (path) {

    if (isWindows) {
      path = path.replace(/\\/g, '/');
    }

    if (path === "") {
      return "file:///";
    }

    if (path[0] === '.') {
      return "file:///" + path;
    }

    if (path[0] === '/') {
      return "file://" + path;
    }

    if (isWindows) {
      if (path[1] === ':') {
        if (path[2] !== '/') {
          throw new internal.ArangoError({
            errorNum: internal.errors.ERROR_MODULE_DRIVE_LETTER.code,
            errorMessage: internal.errors.ERROR_MODULE_DRIVE_LETTER.message
            + " Path: " + path
          });
        }

        return "file:///" + path;
      }
    }

    return "file:///./" + path;
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief converts a file uri into a path
////////////////////////////////////////////////////////////////////////////////

  function fileUri2Path (uri) {

    if (uri.substr(0, 8) !== "file:///") {
      return null;
    }

    var filename = uri.substr(8);

    if (filename[0] === ".") {
      return filename;
    }

    if (isWindows) {
      if (filename[1] === ':') {
        if (filename[2] !== '/') {
          throw new internal.ArangoError({
            errorNum: internal.errors.ERROR_MODULE_DRIVE_LETTER.code,
            errorMessage: internal.errors.ERROR_MODULE_DRIVE_LETTER.message
            + " Path: " + filename
          });
        }

        return filename;
      }
    }

    return "/" + filename;
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief checks if a file exists without cache
////////////////////////////////////////////////////////////////////////////////

  function checkModulePathFileNoCache (root, path) {

    var filename = fs.join(root, path);
    var agumented;

    // file exists with given name
    if (fs.isFile(filename)) {
      var type = "unknown";
      var id;

      if (/\.js$/.test(filename)) {
        id = path.substr(0, path.length - 3);
        type = "js";
      }
      else if (/\.json$/.test(filename)) {
        id = path.substr(0, path.length - 5);
        type = "json";
      }
      else if (/\.coffee$/.test(filename)) {
        id = path.substr(0, path.length - 7);
        type = "coffee";
      }
      else {
        throw new internal.ArangoError({
          errorNum: internal.errors.ERROR_MODULE_UNKNOWN_FILE_TYPE.code,
          errorMessage: internal.errors.ERROR_MODULE_UNKNOWN_FILE_TYPE.message
          + " Path: " + path
        });
      }

      return {
        id: id,
        path: normalizeModuleName(path + "/.."),
        origin: path2FileUri(filename),
        type: type
      };
    }

    // try to append ".js"
    agumented = filename + ".js";

    if (fs.isFile(agumented)) {
      return {
        id: path,
        path: normalizeModuleName(path + "/.."),
        origin: path2FileUri(agumented),
        type: "js"
      };
    }

    // try to append ".json"
    agumented = filename + ".json";

    if (fs.isFile(agumented)) {
      return {
        id: path,
        path: normalizeModuleName(path + "/.."),
        origin: path2FileUri(agumented),
        type: "json"
      };
    }

    // try to append ".coffee"
    agumented = filename + ".coffee";

    if (fs.isFile(agumented)) {
      return {
        id: path,
        path: normalizeModuleName(path + "/.."),
        origin: path2FileUri(agumented),
        type: "coffee"
      };
    }

    // maybe this is a directory with an index file
    if (fs.isDirectory(filename)) {
      agumented = fs.join(filename, "index.js");

      if (fs.isFile(agumented)) {
        return {
          id: fs.join(path, "index"),
          path: path,
          origin: path2FileUri(agumented),
          type: "js"
        };
      }
    }

    // no idea
    return null;
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief checks if a file exists without cache
////////////////////////////////////////////////////////////////////////////////

  function checkModulePathFile (pkg, root, path) {
    var key = root + "/" + path;

    if (pkg._pathCache.hasOwnProperty(key)) {
      return pkg._pathCache[key];
    }

    return (pkg._pathCache[key] = checkModulePathFileNoCache(root, path));
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief checks if a file exists as document in a collection
////////////////////////////////////////////////////////////////////////////////

  function checkModulePathDb (origin, path) {

    if (internal.db === undefined) {
      return null;
    }

    var match = /^db:\/\/(.*)\/$/.exec(origin);

    if (match === null) {
      throw new internal.ArangoError({
        errorNum: internal.errors.ERROR_MODULE_BAD_PACKAGE_ORIGIN.code,
        errorMessage: internal.errors.ERROR_MODULE_BAD_PACKAGE_ORIGIN.message
        + " Origin: " + origin
      });
    }

    var doc;
    var collection;
    var collectionName = match[1];

    try {
      collection = internal.db._collection(collectionName);

      if (collection === null || typeof collection.firstExample !== "function") {
        return null;
      }

      doc = collection.firstExample({ path: path });
    }
    catch (err) {
      return null;
    }

    if (doc === null) {
      return null;
    }

    if (doc.hasOwnProperty('content')) {
      return {
        id: path,
        path: normalizeModuleName(path + "/.."),
        origin: origin + path.substr(1),
        type: "js",
        content: doc.content,
        revision: collection.revision()
      };
    }

    throw new internal.ArangoError({
      errorNum: internal.errors.ERROR_MODULE_DOCUMENT_IS_EMPTY.code,
      errorMessage: internal.errors.ERROR_MODULE_DOCUMENT_IS_EMPTY.message
      + " Collection: " + match[1]
      + " Path: " + path
    });
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief creates a new module in a given package
////////////////////////////////////////////////////////////////////////////////

  function createModule (currentModule, currentPackage, description) {
    var localModule;
    try {
      localModule = currentPackage.defineModule(
        description.id,
        "js",
        new Module(
          description.id,
          currentPackage,
          currentModule._applicationContext,
          description.path,
          description.origin,
          currentPackage._isSystem
        )
      );

      inFlight[localModule.id] = localModule;

      var context = {};

      var env = currentPackage._environment;
      if (env !== undefined) {
        Object.keys(env).forEach(function (key) {
          context[key] = env[key];
        });
      }

      if (localModule._applicationContext) {
        context.applicationContext = localModule._applicationContext;
      }

      localModule.run(description.content, context);

      return localModule;
    } catch (err) {
      if (localModule) {
        currentPackage.clearModule(localModule.id, "js");
      }
      throw err;
    } finally {
      if (localModule) {
        delete inFlight[localModule.id];
      }
    }
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief requires a module from a package
////////////////////////////////////////////////////////////////////////////////

  function requireModuleFrom (currentModule, currentPackage, path) {

    var description = null;

    if (currentPackage._origin.substr(0, 7) === "file://") {
      var root = fileUri2Path(currentPackage._origin);

      if (root === null) {
        throw new internal.ArangoError({
          errorNum: internal.errors.ERROR_MODULE_BAD_PACKAGE_ORIGIN.code,
          errorMessage: internal.errors.ERROR_MODULE_BAD_PACKAGE_ORIGIN.message
          + " Origin: " + currentPackage._origin
        });
      }

      description = checkModulePathFile(currentPackage, root, path);
    }
    else if (currentPackage._isDbPackage) {
      description = checkModulePathDb(currentPackage._origin, path);
    }
    else if (currentPackage._origin.substr(0, 10) === "system:///") {
      description = null;
    }
    else {
      throw new internal.ArangoError({
        errorNum: internal.errors.ERROR_MODULE_BAD_PACKAGE_ORIGIN.code,
        errorMessage: internal.errors.ERROR_MODULE_BAD_PACKAGE_ORIGIN.message
        + " Origin: " + currentPackage._origin
      });
    }

    if (description === null) {
      return null;
    }

    var localModule = currentPackage.module(description.id, description.type);

    if (localModule !== null) {
      if (currentPackage._isDbPackage) {
        if (localModule._revision === description.revision) {
          return localModule;
        }
        else {
          currentPackage.clearModule(description.id, description.type);
          localModule = null;
        }
      }
      else {
        return localModule;
      }
    }

    if (currentPackage._origin.substr(0, 7) === "file://") {
      var filename = fileUri2Path(description.origin);

      if (filename === null) {
        throw new internal.ArangoError({
          errorNum: internal.errors.ERROR_MODULE_BAD_MODULE_ORIGIN.code,
          errorMessage: internal.errors.ERROR_MODULE_BAD_MODULE_ORIGIN.message
          + " Origin: " + description.origin
        });
      }

      try {
        description.content = fs.read(filename);
      }
      catch (err) {
        if (! fs.exists(filename)) {
          return null;
        }

        throw err;
      }
    }
    else if (!currentPackage._isDbPackage) {
      throw new internal.ArangoError({
        errorNum: internal.errors.ERROR_MODULE_BAD_MODULE_ORIGIN.code,
        errorMessage: internal.errors.ERROR_MODULE_BAD_MODULE_ORIGIN.message
        + " Origin: " + currentPackage._origin
      });
    }

    if (description.type === "js") {
      localModule = createModule(currentModule, currentPackage, description);
    }

    if (description.type === "coffee") {
      var cs = require("coffee-script");
      description.content = cs.compile(description.content, {bare: true});
      localModule = createModule(currentModule, currentPackage, description);
    }

    if (description.type === "json") {
      localModule = { exports: JSON.parse(description.content) };
      localModule = currentPackage.defineModule(description.id, description.type, localModule);
    }

    if (localModule !== null && currentPackage._isDbPackage) {
      localModule._revision = description.revision;
    }

    return localModule;
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief creates a package and a corresponding module
////////////////////////////////////////////////////////////////////////////////

  function createPackageAndModule (currentModule, currentPackage, path, dirname, filename) {
    var desc = JSON.parse(fs.read(filename));
    var mainfile = desc.main || "./index.js";

    // the mainfile is always relative
    if (mainfile.substr(0,2) !== "./" && mainfile.substr(0,3) !== "../") {
      mainfile = "./" + mainfile;
    }

    // locate the mainfile
    var description = checkModulePathFile(currentPackage, dirname, mainfile);

    if (description === null) {
      throw new internal.ArangoError({
        errorNum: internal.errors.ERROR_MODULE_MAIN_NOT_READABLE.code,
        errorMessage: internal.errors.ERROR_MODULE_MAIN_NOT_READABLE.message
        + " Path: " + path
        + " Main File: " + mainfile
      });
    }

    if (description.type !== "js") {
      throw new internal.ArangoError({
        errorNum: internal.errors.ERROR_MODULE_MAIN_NOT_JS.code,
        errorMessage: internal.errors.ERROR_MODULE_MAIN_NOT_JS.message
        + " Path: " + path
        + " Main File: " + mainfile
        + " Type: " + description.type
      });
    }

    var fname = fileUri2Path(description.origin);

    if (fname === null) {
      throw new internal.ArangoError({
        errorNum: internal.errors.ERROR_MODULE_BAD_MODULE_ORIGIN.code,
        errorMessage: internal.errors.ERROR_MODULE_BAD_MODULE_ORIGIN.message
        + " Path: " + path
        + " Origin: " + description.origin
      });
    }

    description.content = fs.read(fname);

    // create a new package and module
    var pkg = new Package(path, desc, currentPackage, path2FileUri(dirname), currentPackage._isSystem);
    pkg._packageModule = createModule(currentModule, pkg, description);

    return pkg;
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief requires a package from a given package
////////////////////////////////////////////////////////////////////////////////

  function requirePackageFrom (currentModule, currentPackage, path) {

    if (currentPackage._origin.substr(0, 10) === "system:///") {
      return null;
    }

    if (currentPackage._origin.substr(0, 5) === "db://") {
      return null;
    }

    var root = fileUri2Path(currentPackage._origin);

    if (root === null) {
      throw new internal.ArangoError({
        errorNum: internal.errors.ERROR_MODULE_BAD_PACKAGE_ORIGIN.code,
        errorMessage: internal.errors.ERROR_MODULE_BAD_PACKAGE_ORIGIN.message
        + " Origin: " + currentPackage._origin
      });
    }

    path = normalizeModuleName(path);

    var dirname = fs.join(root, "node_modules", path);
    var filename = fs.join(dirname, "package.json");

    var pkg = currentPackage.knownPackage(path);

    if (pkg === null) {
      if (fs.exists(filename)) {
        pkg = createPackageAndModule(currentModule, currentPackage, path, dirname, filename);

        if (pkg !== null) {
          currentPackage.definePackage(path, pkg);
        }
      }
    }

    return (pkg === null) ? null : pkg._packageModule;
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief requires a module from a global module or package
////////////////////////////////////////////////////////////////////////////////

  function requirePackage (currentModule, path) {

    var localModule;
    var i;

    // normalize the path
    path = normalizeModuleName(path);

    // check if there is a local module with this name
    var pkg = currentModule._package;

    if (pkg !== undefined && pkg._origin.substr(0,10) !== "system:///") {
      localModule = requireModuleFrom(currentModule, pkg, path);

      if (localModule !== null) {
        return localModule;
      }
    }

    // check if there is a global module with this name, skip db:// ones
    // at first, see below for them
    for (i = 0;  i < globalPackages.length;  ++i) {
      var gpkg = globalPackages[i];

      if (gpkg._origin.substr(0,5) === "db://") {
        continue;
      }

      // use the GLOBAL module as current module
      localModule = requireModuleFrom(global.module, gpkg, path);

      if (localModule !== null) {
        return localModule;
      }
    }

    // check if there is a package relative to the current module or any parent
    while (pkg !== undefined) {
      localModule = requirePackageFrom(currentModule, pkg, path);

      if (localModule !== null) {
        return localModule;
      }

      pkg = pkg._parent;
    }

    // check if there is a global package with this name
    for (i = 0;  i < globalPackages.length;  ++i) {
      // use the GLOBAL module as current module
      localModule = requirePackageFrom(global.module, globalPackages[i], path);

      if (localModule !== null) {
        return localModule;
      }
    }

    // check if there is a global package containing this module
    var origpath = path;
    path = path.substr(1);
    if (path.indexOf('/') !== -1) {
      var p = path.split('/');

      localModule = requirePackage(currentModule, '/' + p.shift());

      if (localModule !== null) {
        localModule = requirePackage(localModule, '/' + p.join('/'));
        return localModule;
      }
    }

    // check if there is a global module with this name, now take the 
    // db:// ones only, the others have been checked above
    for (i = 0;  i < globalPackages.length;  ++i) {
      var gpkg2 = globalPackages[i];

      if (gpkg2._origin.substr(0,5) !== "db://") {
        continue;
      }

      // use the GLOBAL module as current module
      localModule = requireModuleFrom(global.module, gpkg2, origpath);

      if (localModule !== null) {
        return localModule;
      }
    }

    // nothing found
    return null;
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief requires a module from a package with absolute path
////////////////////////////////////////////////////////////////////////////////

  function requireModuleAbsolute (currentModule, path) {
    path = normalizeModuleName(path);

    if (path === "/") {
      var pkg = currentModule._package;

      if (pkg.hasOwnProperty("_packageModule")) {
        return pkg._packageModule;
      }
    }

    return requireModuleFrom(currentModule, currentModule._package, path);
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief requires a module from a package with relative path
////////////////////////////////////////////////////////////////////////////////

  function requireModuleRelative (currentModule, path) {
    return requireModuleAbsolute(
      currentModule,
      normalizeModuleName(currentModule._path, path)
    );
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief executes a file with preprocessor
////////////////////////////////////////////////////////////////////////////////

  global.REGISTER_EXECUTE_FILE((function () {
    var read = global.SYS_READ;
    var execute = global.SYS_EXECUTE;

    return function (filename) {
      var fileContent = read(filename);

      if (/\.coffee$/.test(filename)) {
        var cs = require("coffee-script");

        fileContent = cs.compile(fileContent, {bare: true});
      }

      execute(fileContent, undefined, filename);
    };
  }()));

  delete global.REGISTER_EXECUTE_FILE;

////////////////////////////////////////////////////////////////////////////////
/// @brief cleans up after cancelation
////////////////////////////////////////////////////////////////////////////////

  function cleanupCancelation () {
    var i;

    for (i in inFlight) {
      if (inFlight.hasOwnProperty(i)) {
        var m = inFlight[i];
        var p = m._package;

        p.clearModule(i, "js");
      }
    }

    inFlight = {};
  }

// -----------------------------------------------------------------------------
// --SECTION--                                                           Package
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// --SECTION--                                      constructors and destructors
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief Package constructor
////////////////////////////////////////////////////////////////////////////////

  Package = function (id, description, parent, origin, isSystem) {

    this.id = id;			// name of the package

    this._description = description;    // the package.json file
    this._parent = parent;              // parent package

    this._moduleCache = {};             // module cache
    this._packageCache = {};            // package chache
    this._pathCache = {};               // path cache

    this._origin = origin;              // root of the package
    this._isSystem = isSystem;          // is a system package
    this._isDbPackage = false;
  };

  (function () {

    var i;
    var pkg;

    for (i = 0;  i < modulesPaths.length;  ++i) {
      var path = modulesPaths[i];

      pkg = new Package("/", { name: "ArangoDB root" }, undefined, path2FileUri(path), true);
      globalPackages.push(pkg);
    }

    pkg = new Package("/", {}, undefined, "db://_modules/", false);
    pkg._isDbPackage = true;
    globalPackages.push(pkg);

    systemPackage = new Package("/", { name: "ArangoDB system" }, undefined, "system:///", true);
  }());

  Package.prototype.createAppModule = function (app, path) {
    var libpath = fs.join(app._root, app._path);
    if (app._manifest.hasOwnProperty("lib")) {
      libpath = fs.join(libpath, app._manifest.lib);
    }
    return new Module(
      "/application-module",
      this,
      app._context,
      "/" + (path ? path : ""),
      path2FileUri(libpath),
      false
    );
  };

// -----------------------------------------------------------------------------
// --SECTION--                                                   private methods
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief defines a system module in a package
////////////////////////////////////////////////////////////////////////////////

  Package.prototype.defineSystemModule = function (path) {

    if (path[0] !== '/') {
      throw new internal.ArangoError({
        errorNum: internal.errors.ERROR_MODULE_PATH_MUST_BE_ABSOLUTE.code,
        errorMessage: internal.errors.ERROR_MODULE_PATH_MUST_BE_ABSOLUTE.message
        + " Path: " + path
      });
    }

    return new Module(
      path,
      this,
      undefined,
      path,
      "system://" + path,
      true
    );
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief prints a package
////////////////////////////////////////////////////////////////////////////////

  Package.prototype._PRINT = function (context) {

    var parent = "";

    if (this._parent !== undefined) {
      parent = ', parent "' + this._parent.id + '"';
    }

    context.output += '[package "' + this.id + '"'
                   + ', origin "' + this._origin + '"'
                   + parent
                   + ']';
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief caches a module
////////////////////////////////////////////////////////////////////////////////

  Package.prototype.defineModule = function (id, type, module) {

    var key = id + "." + type;

    this._moduleCache[key] = module;

    return module;
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief removes a module from the cache
////////////////////////////////////////////////////////////////////////////////

  Package.prototype.clearModule = function (id, type) {

    var key = id + "." + type;

    delete this._moduleCache[key];
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief returns a module from the cache
////////////////////////////////////////////////////////////////////////////////

  Package.prototype.module = function (id, type) {

    var key = id + "." + type;

    if (this._moduleCache.hasOwnProperty(key)) {
      return this._moduleCache[key];
    }

    return null;
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief caches a package
////////////////////////////////////////////////////////////////////////////////

  Package.prototype.definePackage = function (id, pkg) {

    this._packageCache[id] = pkg;

    return pkg;
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief returns a package from the cache
////////////////////////////////////////////////////////////////////////////////

  Package.prototype.knownPackage = function (id) {

    if (this._packageCache.hasOwnProperty(id)) {
      return this._packageCache[id];
    }

    return null;
  };

// -----------------------------------------------------------------------------
// --SECTION--                                                            Module
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// --SECTION--                                      constructors and destructors
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief Module constructor
////////////////////////////////////////////////////////////////////////////////

  Module = function (id, pkg, appContext, path, origin, isSystem) {

    this.id = id;                    // commonjs Module/1.1.1
    this.exports = {};               // commonjs Module/1.1.1

    this._path = path;               // normalized path with respect to the package root
    this._origin = origin;           // absolute path with respect to the filesystem

    this._isSystem = isSystem;       // true, if a system module
    this._package = pkg;             // the package to which the module belongs

    this._applicationContext = appContext;

    this.paths = [
      this.appPath ? this.appPath() :'/'
    ];   // node compatibility
  };

// -----------------------------------------------------------------------------
// --SECTION--                                                 private variables
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief module "/"
////////////////////////////////////////////////////////////////////////////////

  global.module = Module.prototype.root = systemPackage.defineSystemModule("/");

////////////////////////////////////////////////////////////////////////////////
/// @brief module "internal"
////////////////////////////////////////////////////////////////////////////////

  internal = systemPackage.defineSystemModule("/internal").exports;

  (function () {
    var key;

    for (key in global.EXPORTS_SLOW_BUFFER) {
      if (global.EXPORTS_SLOW_BUFFER.hasOwnProperty(key)) {
        internal[key] = global.EXPORTS_SLOW_BUFFER[key];
      }
    }

    internal.cleanupCancelation = cleanupCancelation;
  }());

  delete global.EXPORTS_SLOW_BUFFER;

////////////////////////////////////////////////////////////////////////////////
/// @brief module "fs"
////////////////////////////////////////////////////////////////////////////////

  fs = systemPackage.defineSystemModule("/fs").exports;

////////////////////////////////////////////////////////////////////////////////
/// @brief module "console"
////////////////////////////////////////////////////////////////////////////////

  console = systemPackage.defineSystemModule("/console").exports;

// -----------------------------------------------------------------------------
// --SECTION--                                                   private methods
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief prints a module
////////////////////////////////////////////////////////////////////////////////

  Module.prototype._PRINT = function (context) {
    var type = "module";

    if (this._isSystem) {
      type = "system module";
    }

    context.output += '[' + type + ' "' + this.id + '"'
                    + ', package "' + this._package.id + '"'
                    + ', path "' + this._path + '"'
                    + ', origin "' + this._origin + '"'
                    + ']';
  };

// -----------------------------------------------------------------------------
// --SECTION--                                                    public methods
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief require
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.require = function (path) {

    // special modules are returned immediately
    if (path === "internal") {
      return internal;
    }

    if (path === "fs") {
      return fs;
    }

    if (path === "console") {
      return console;
    }

    // the loaded module
    var localModule = null;

    // relative module path
    if (path.substr(0,2) === "./" || path.substr(0,3) === "../") {
      localModule = requireModuleRelative(this, path);
    }

    // absolute module path
    else if (path[0] === '/') {
      localModule = requireModuleAbsolute(this, path);
    }

    // system module or package
    else {
      localModule = requirePackage(this, path);
    }

    // try to generate a suitable error message
    if (localModule === null) {
      throw new internal.ArangoError({
        errorNum: internal.errors.ERROR_MODULE_NOT_FOUND.code,
        errorMessage: internal.errors.ERROR_MODULE_NOT_FOUND.message
        + " Path: " + path
      });
    }

    return localModule.exports;
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief basePaths
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.basePaths = function () {
    if (appPath === undefined && devAppPath === undefined) {
      return undefined;
    }
    return {
      appPath: appPath,
      devAppPath: devAppPath
    };
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief appPath
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.appPath = function () {
    if (appPath === undefined) {
      return undefined;
    }
    return fs.join(appPath, '_db', internal.db._name());
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief oldAppPath
/// Legacy needed for upgrade
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.oldAppPath = function () {
    if (appPath === undefined) {
      return undefined;
    }
    return fs.join(appPath, 'databases', internal.db._name());
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief devAppPath
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.devAppPath = function () {
    if (devAppPath === undefined) {
      return undefined;
    }
    return fs.join(devAppPath, 'databases', internal.db._name());
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief systemAppPath
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.systemAppPath = function () {
    return fs.join(startupPath, 'apps', 'system');
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief startupPath
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.startupPath = function () {
    return startupPath;
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief normalize
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.normalize = function (path) {

    // normalizeModuleName handles absolute and relative paths
    return normalizeModuleName(this._modulePath, path);
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief createTestEnvironment
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.createTestEnvironment = function (path) {
    var pkg = new Package(
      "/test",
      {name: "ArangoDB test"},
      undefined,
      "file:///" + path,
      false
    );

    return new Module(
      "/",
      pkg,
      undefined,
      "/",
      "system:///",
      false
    );
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief createAppPackage, is used to create foxx applications
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.createAppPackage = function (app) {
    var libpath = fs.join(app._root, app._path);
    if (app._manifest.hasOwnProperty("lib")) {
      libpath = fs.join(libpath, app._manifest.lib);
    }
    return new Package(
      "application-package",
      {name: "application '" + app._name + "'"},
      undefined,
      path2FileUri(libpath),
      false
    );
  };

  Module.prototype.normalizeModuleName = normalizeModuleName;

  Module.prototype.run = function(content, context) {
    var filename = fileUri2Path(this._origin);

    if (typeof content !== "string") {
      throw new TypeError('Expected module content to be a string, not ' + typeof content);
    }

    // test for parse errors first and fail early if a parse error detected
    if (!internal.parse(content)) {
      throw new internal.ArangoError({
        errorNum: internal.errors.ERROR_MODULE_SYNTAX_ERROR.code,
        errorMessage: internal.errors.ERROR_MODULE_SYNTAX_ERROR.message
        + " File: " + filename
        + " Content: " + content
      });
    }

    var self = this;
    var args = {
      print: internal.print,
      module: this,
      exports: this.exports,
      require: function (path) {
        return self.require(path);
      }
    };

    if (filename !== null) {
      args.__filename = filename;
      args.__dirname = normalizeModuleName(filename + '/..');
    }

    if (context) {
      Object.keys(context).forEach(function (key) {
        args[key] = context[key];
      });
    }

    var keys = Object.keys(args);
    var script;

    try {
      script = Function.apply(null, keys.concat(content));
    } catch (e) {
      throw extend(new internal.ArangoError({
        errorNum: internal.errors.ERROR_MODULE_BAD_WRAPPER.code,
        errorMessage: internal.errors.ERROR_MODULE_BAD_WRAPPER.message
        + " File: " + filename
        + " Context variables: " + JSON.stringify(Object.keys(args))
      }), {stack: e.stack});
    }

    var fn;

    try {
      fn = internal.executeScript("(" + script + ")", undefined, filename);
    } catch (e) {
      // This should never happen, right?
      throw extend(new internal.ArangoError({
        errorNum: internal.errors.ERROR_SYNTAX_ERROR_IN_SCRIPT.code,
        errorMessage: internal.errors.ERROR_SYNTAX_ERROR_IN_SCRIPT.message
        + " File: " + filename
        + " Content: " + content
      }), {stack: e.stack});
    }

    if (typeof fn !== 'function') {
      throw new TypeError('Expected internal.executeScript to return a function, not ' + typeof fn);
    }

    try {
      fn.apply(null, keys.map(function (key) {
        return args[key];
      }));
    } catch (e) {
      throw extend(new internal.ArangoError({
        errorNum: internal.errors.ERROR_MODULE_FAILURE.code,
        errorMessage: internal.errors.ERROR_MODULE_FAILURE.message
        + " File: " + filename
        + " Content: " + content
      }), {stack: e.stack});
    }

    return this.exports;
  };
}());

// -----------------------------------------------------------------------------
// --SECTION--                                                       END-OF-FILE
// -----------------------------------------------------------------------------

// Local Variables:
// mode: outline-minor
// outline-regexp: "/// @brief\\|/// @addtogroup\\|/// @page\\|// --SECTION--\\|/// @\\}\\|/\\*jslint"
// End:
