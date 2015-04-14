/*jshint browser: true */
/*global Backbone, $, arango */
(function() {
  "use strict";

  var sendRequest = function (foxx, callback, type, part, body) {
    var req = {
      contentType: "application/json",
      processData: false,
      success: function(data) {
        callback(data);
      },
      error: function(err) {
        callback(err);
      }
    };
    req.type = type;
    if (part && part !== "") {
      req.url = "/_admin/aardvark/foxxes/" + part + "?mount=" + foxx.encodedMount();
    } else {
      req.url = "/_admin/aardvark/foxxes?mount=" + foxx.encodedMount();
    }
    if (body !== undefined) {
      req.data = JSON.stringify(body);
    }
    $.ajax(req);
  };

  window.Foxx = Backbone.Model.extend({
    idAttribute: 'mount',

    defaults: {
      "author": "Unknown Author",
      "name": "",
      "version": "Unknown Version",
      "description": "No description",
      "license": "Unknown License",
      "contributors": [],
      "git": "",
      "system": false,
      "development": false
    },

    isNew: function() {
      return false;
    },

    encodedMount: function() {
      return encodeURIComponent(this.get("mount"));
    },

    destroy: function(callback) {
      sendRequest(this, callback, "DELETE");
    },

    getConfiguration: function(callback) {
      sendRequest(this, callback, "GET", "config");
    },

    setConfiguration: function(data, callback) {
      sendRequest(this, callback, "PATCH", "config", data);
    },

    toggleDevelopment: function(activate, callback) {
      $.ajax({
        type: "PATCH",
        url: "/_admin/aardvark/foxxes/devel?mount=" + this.encodedMount(),
        data: JSON.stringify(activate),
        contentType: "application/json",
        processData: false,
        success: function(data) {
          this.set("development", activate);
          callback(data);
        }.bind(this),
        error: function(err) {
          callback(err);
        }
      });
    },

    runScript: function(name, callback) {
      sendRequest(this, callback, "POST", "scripts/" + name);
    },

    runTests: function (options, callback) {
      $.ajax({
        type: "POST",
        url: "/_admin/aardvark/foxxes/tests?mount=" + this.encodedMount(),
        data: JSON.stringify(options),
        contentType: "application/json",
        success: function(data) {
          callback(null, data);
        },
        error: function(xhr) {
          callback(xhr.responseJSON);
        }
      });
    },

    isSystem: function() {
      return this.get("system");
    },

    isDevelopment: function() {
      return this.get("development");
    },

    download: function() {
      window.open(
        "/_db/" + arango.getDatabaseName() + "/_admin/aardvark/foxxes/download/zip?mount=" + this.encodedMount()
      );
    }

  });
}());
