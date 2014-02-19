/*jslint indent: 2, nomen: true, maxlen: 100, sloppy: true, vars: true, white: true, plusplus: true */
/*global Backbone, $, window */

window.Users = Backbone.Model.extend({
  defaults: {
  },

  idAttribute : "user",

  url: function () {
    if (this.get("user") !== "") {
      return "/_api/user/" + this.get("user");
    }
    return "/_api/user";
  },

  initialize: function () {
  },

  isAuthorized: function () {
    //return Boolean(this.get("sessionId");
    return true;
  },

  isNotAuthorized: function () {
    return false;
  }

});
