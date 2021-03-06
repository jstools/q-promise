(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global.Parole = factory());
}(this, (function () { 'use strict';

  // from: https://github.com/medikoo/next-tick
  var nextTick = (function () {

    // Node.js
    if( typeof process === 'object' && process && typeof process.nextTick === 'function' ) {
  		return process.nextTick
    }

    // Removed due to issues with touchmove:
    //
    // if( 'Promise' in global && typeof global.Promise.resolve === 'function' ) return (function (resolved) {
    //   return resolved.then.bind(resolved);
    // })( global.Promise.resolve() );
    //
    // https://stackoverflow.com/questions/32446715/why-is-settimeout-game-loop-experiencing-lag-when-touchstart-event-fires/35668492
    // https://bugs.chromium.org/p/chromium/issues/detail?id=567800
      
    // Removed due to issues with webview:
    //
    // from: https://github.com/wesleytodd/browser-next-tick
    // var raf_prefixes = 'oR msR mozR webkitR r'.split(' ')
    // for( var i = raf_prefixes.length - 1 ; i >= 0 ; i-- ) {
    //   if( window[raf_prefixes[i] + 'equestAnimationFrame'] ) return window[raf_prefixes[i] + 'equestAnimationFrame'].bind(window);
    // }
    
    // MutationObserver
    if( 'MutationObserver' in window || 'WebKitMutationObserver' in window ) return (function (Observer, node) {
      var queue = [],
          i = 0;

      function _launchNextTick () {
        node.data = (i = ++i % 2);
      }

      var observer = new Observer(function () {
        var _callback = queue.shift();
        if( queue.length > 0 )  _launchNextTick();
        if( _callback instanceof Function ) _callback();
        // observer.disconnect()
      });
      observer.observe(node, { characterData: true });

      return function (callback) {
        queue.push(callback);
        _launchNextTick();
      }
    })( window.MutationObserver || window.WebKitMutationObserver, document.createTextNode('') )

    var _ensureCallable = function (fn) {
      if (typeof fn !== 'function') throw new TypeError(fn + ' is not a Function')
      return fn
    };

    // W3C Draft
  	// http://dvcs.w3.org/hg/webperf/raw-file/tip/specs/setImmediate/Overview.html
  	if (typeof setImmediate === 'function') {
  		return function (cb) { setImmediate(_ensureCallable(cb)); }
  	}

  	// Wide available standard
  	if ((typeof setTimeout === 'function') || (typeof setTimeout === 'object')) {
  		return function (cb) { setTimeout(_ensureCallable(cb), 0); }
  	}

  })();

  /* global process */

  function once (fn) {
    return function () {
      if( fn ) fn.apply(this, arguments);
      fn = null;
    }
  }

  function isObjectLike (x) {
    return ( typeof x === 'object' || typeof x === 'function' )
  }

  function isThenable (x) {
    return isObjectLike(x) && 'then' in x
  }

  function runThenable (then, xThen, p, x, resolve, reject) {
    try {
      then.call(x, function (value) {
        xThen(p, value, true, resolve, reject);
      }, function (reason) {
        xThen(p, reason, false, resolve, reject);
      });
    } catch(err) {
      xThen(p, err, false, resolve, reject);
    }
  }

  function xThen (p, x, fulfilled, resolve, reject) {
    var then;

    if( x && isObjectLike(x) ) {
      try {
        if( x === p ) throw new TypeError('A promise can not be resolved by itself')
        then = x.then;

        if( fulfilled && typeof then === 'function' ) {
          runThenable(then, once(xThen), p, x, resolve, reject);
        } else {
          (fulfilled ? resolve : reject)(x);
        }
      } catch (reason) {
        reject(reason);
      }
    } else {
      (fulfilled ? resolve : reject)(x);
    }
  }

  var onUncaught = null;

  Parole.onUncaught = function (_onUncaught) {
    onUncaught = _onUncaught;
  };

  function _runQueue (queue, is_uncaught, value) {
    for( var i = 0, n = queue.length ; i < n ; i++ ) queue[i]();
    queue.splice();
    if( is_uncaught && onUncaught ) onUncaught(value);
  }

  function Parole (resolver) {
    if( !(this instanceof Parole) ) return new Parole(resolver)

    var p = this,
        reject = function (reason) {
          if( p.fulfilled || p.rejected ) return
          p.rejected = true;
          p.value = reason;
          nextTick(function () { _runQueue(p.queue, !p.caught, p.value); });
        };

    p.queue = [];

    resolver(function (value) {
      xThen(p, value, true, function (result) {
        if( p.fulfilled || p.rejected ) return
        p.fulfilled = true;
        p.value = result;
        nextTick(function () { _runQueue(p.queue); });
      }, reject);
    }, reject);
  }

  Parole.prototype.then = function (onFulfilled, onRejected) {
    var p = this;

    if( onRejected instanceof Function ) p.caught = true;

    return new Parole(function (resolve, reject) {

      function complete () {
        var then = p.fulfilled ? onFulfilled : onRejected;
        if( typeof then === 'function' ) {
          try {
            resolve( then(p.value) );
          } catch(reason) {
            reject( reason );
          }
        } else if( p.fulfilled ) resolve(p.value);
        else reject(p.value);
      }

      if( !p.fulfilled && !p.rejected ) {
        p.queue.push(complete);
      } else {
        nextTick(complete);
      }

    })
  };

  Parole.prototype.catch = function (onRejected) {
    return this.then(null, onRejected)
  };

  // Promise methods

  Parole.defer = function () {
    var deferred = {};
    deferred.promise = new Parole(function (resolve, reject) {
      deferred.resolve = resolve;
      deferred.reject = reject;
    });
    return deferred
  };

  Parole.when = function (x) { return ( x && x.then ) ? x : Parole.resolve(x) };

  Parole.resolve = function (value) {
    return new Parole(function (resolve) {
      resolve(value);
    })
  };

  Parole.reject = function (value) {
    return new Parole(function (resolve, reject) {
      reject(value);
    })
  };

  Parole.all = function (promises) {
    var waiting_promises = promises.length;
    return new Parole(function (resolve, reject) {
      var results = new Array(waiting_promises);
      promises.forEach(function (promise, i) {
        var addresult = function (result) {
          results[i] = result;
          waiting_promises--;
          if( !waiting_promises ) resolve(results);
        };
        if( isThenable(promise) ) promise.then.call(promise, addresult, reject);
        else addresult(promise);
      });
      if( !results.length ) resolve(results);
    })
  };

  Parole.race = function (promises) {
    return new Parole(function (resolve, reject) {
      promises.forEach(function (promise) {
        if( isThenable(promise) ) promise.then.call(promise, resolve, reject);
        else resolve(promise);
      });
      if( !promises.length ) resolve();
    })
  };

  return Parole;

})));
