/**
 * Mechanically ported from the original `legacy/Quản lý Ika Perseus -VN- V2.js`.
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "./jquery";
import { reportBug } from "@core/bug-report";

/**
 * Added (not in the original): each subscriber runs inside its own try.
 *
 * jQuery 2.2.4's `Callbacks.fire` sets `firing = true`, runs the list with no
 * try/finally, and only then clears it. One subscriber that throws leaves
 * `firing` stuck, and every later `fire` on that topic is queued and never
 * run. On `ajaxResponse` that meant the board silently stopped recording
 * anything until the page was reloaded. A throw is now reported and the
 * other subscribers, and every later publish, still run.
 */
function isolatedSubscriber(
  topicId: string,
  handler: (...args: unknown[]) => unknown,
) {
  return function (this: unknown, ...args: unknown[]) {
    try {
      return handler.apply(this, args);
    } catch (e) {
      reportBug("manual", e, { where: "event subscriber", topic: topicId });
      return undefined;
    }
  };
}

export const events: any = (function () {
  var _events = {};
  // Function object that also carries scheduling helpers as properties.
  var retEvents: any = function (id) {
    var callbacks,
      topic = id && _events[id];
    if (!topic) {
      callbacks = $.Callbacks("");
      // The wrapper each handler was subscribed as, so `unsub` can find it.
      const wrappers = new Map<Function, Function>();
      topic = {
        pub: callbacks.fire,
        sub: function (handler) {
          let wrapped = wrappers.get(handler);
          if (!wrapped) {
            wrapped = isolatedSubscriber(String(id), handler);
            wrappers.set(handler, wrapped);
          }
          callbacks.add(wrapped);
        },
        unsub: function (handler) {
          const wrapped = wrappers.get(handler);
          if (!wrapped) return;
          callbacks.remove(wrapped);
          wrappers.delete(handler);
        },
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
