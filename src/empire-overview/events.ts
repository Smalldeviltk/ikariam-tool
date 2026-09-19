/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "./jquery";

export const events: any = (function () {
  var _events = {};
  // Function object that also carries scheduling helpers as properties.
  var retEvents: any = function (id) {
    var callbacks,
      topic = id && _events[id];
    if (!topic) {
      callbacks = $.Callbacks("");
      topic = {
        pub: callbacks.fire,
        sub: callbacks.add,
        unsub: callbacks.remove,
      };
      if (id) {
        _events[id] = topic;
      }
    }
    return topic;
  };

  retEvents.scheduleAction = function (callback, time) {
    return clearTimeout.bind(undefined, setTimeout(callback, time || 0));
  };

  retEvents.scheduleActionAtTime = function (callback, time) {
    return retEvents.scheduleAction(
      callback,
      time - $.now() > 0 ? time - $.now() : 0,
    );
  };

  retEvents.scheduleActionAtInterval = function (callback, time) {
    return clearInterval.bind(undefined, setInterval(callback, time));
  };
  return retEvents;
})();

/***********************************************************************************************************************
 * Globals
 **********************************************************************************************************************/
