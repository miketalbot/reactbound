/**
 * Represents an entry in the event structure with children, handlers and a collection of handlers for all below.
 * @constructor
 */
function EventEntry() {
    this.children = {}
    this.handlers = []
    this.allBelow = []
}

/**
 * Retrieves the child entry for a given key, or creates a new entry if none exists.
 * @param {string} key - The key identifying the child entry.
 * @returns {EventEntry} - The child entry associated with the specified key.
 */
EventEntry.prototype.getChild = function getChild(key) {
    const child = this.children[key]
    if (!child) {
        const result = new EventEntry()
        this.children[key] = result
        return result
    }
    return child
}

/**
 * Retrieves the existing child entry for a given key without creating a new one.
 * @param {string} key - The key identifying the child entry.
 * @returns {EventEntry} - The child entry associated with the specified key, or undefined if none exists.
 */
EventEntry.prototype.getExisting = function getExisting(key) {
    return this.children[key]
}

/**
 * Retrieves or creates a new entry for handling wildcard events.
 * @returns {EventEntry} - The entry for handling wildcard events.
 */
EventEntry.prototype.getAll = function getAll() {
    return (this._all = this._all || new EventEntry())
}

/**
 * @callback HandlePreparer
 *
 * @param {Array<Function>} handlers - the handlers being used
 * @return an updated array or the original array sorted
 */

/**
 * @interface ConstructorParams
 * @property {string} [delimiter=.] - a character which delimits parts of an event pattern
 * @property {string} [wildcard=*] - a wildcard indicator used to handle any parts of a pattern
 * @property {string} [separator=,] - a character to separate multiple events in the same pattern
 * @property {HandlePreparer} [prepareHandlers=v=>v] - a function to modify the handlers just before raising,
 * this is the combined set of all of the handlers that will be raised.
 * @property {HandlePreparer} [storeHandlers=v=>v] - a function to modify or sort the handlers before storing,
 */

/**
 * Event emitter with wild card support and delimited entries.
 */
class Events {
    /**
     * Constructs an event emitter
     * @param {ConstructorParams} [props] - parameters to configure the emitter
     */
    constructor({ delimiter = ".", wildcard = "*", storeHandlers } = {}) {
        this.delimiter = delimiter
        this.wildcard = wildcard = wildcard === true ? "*" : wildcard
        this.cache = new Map()
        this.doubleWild = `${wildcard}${wildcard}`
        this._events = new EventEntry()
        this.storeHandlers = storeHandlers
        this.once = this.once.bind(this)
    }

    /**
     * Adds an event listener with wildcards etc
     * @instance
     * @memberOf Events
     * @param {string|Array<string>} name - the event pattern to handle
     * @param {Function} handler - the handler for the pattern
     */
    on(name, handler) {
        if (!handler) return
        if (Array.isArray(name)) {
            name.forEach((name) => this.on(name, handler))
            return
        }
        const parts = name.split(this.delimiter)
        let scan = this._events

        const { storeHandlers } = this
        const { wildcard } = this
        const { doubleWild } = this
        for (let i = 0, l = parts.length; i < l; i++) {
            const part = parts[i]
            if (part === wildcard) {
                scan = scan.getAll()
            } else if (part === doubleWild) {
                scan.allBelow.push(handler)
                scan.allBelow = storeHandlers
                    ? storeHandlers(scan.allBelow)
                    : scan.allBelow
            } else {
                scan = scan.getChild(part)
            }
        }
        scan.handlers.push(handler)
        scan.handlers = storeHandlers
            ? storeHandlers(scan.handlers)
            : scan.handlers
    }

    /**
     * Add an event listener that will fire only once, if multiple
     * patterns are provided it will only fire on the first one
     * @param {string|Array<string>} name - the event pattern to listen for
     * @param {Function} handler - the function to invoke
     */
    once(name, handler) {
        const self = this
        self.on(name, process)

        function process(...params) {
            self.off(name, process)
            handler(...params)
        }

        return () => {
            self.off(name, process)
        }
    }

    /**
     * Removes all event listeners.
     */
    removeAllListeners() {
        this._events = new EventEntry()
    }

    /**
     * Removes a specified listener from a pattern.
     * @param {string|Array<string>} name- the pattern of the handler to remove
     * @param {Function} [handler] - the handler to remove, or all handlers
     */
    off(name, handler) {
        if (Array.isArray(name)) {
            name.forEach((name) => this.off(name, handler))
            return
        }
        const parts = name.split(this.delimiter)
        let scan = this._events
        const { wildcard } = this
        const { doubleWild } = this
        for (let i = 0, l = parts.length; scan && i < l; i++) {
            const part = parts[i]
            switch (part) {
                case wildcard:
                    scan = scan.getAll()
                    break
                case doubleWild: {
                    if (handler === undefined) {
                        scan.allBelow = []
                        return
                    }
                    const idx = scan.allBelow.indexOf(handler)
                    if (idx === -1) return
                    scan.allBelow.splice(idx, 1)
                    return
                }
                default:
                    scan = scan.getExisting(part)
                    break
            }
        }
        if (!scan) return
        if (handler !== undefined) {
            const idx = scan.handlers.indexOf(handler)
            if (idx === -1) return
            scan.handlers.splice(idx, 1)
        } else {
            scan.handlers.length = 0
        }
    }

    /**
     * Emits an event synchronously
     * @param {string} event - the event to emit
     * @param {...params} params - the parameters to call the event with
     * @returns {Array<any>} - an array of the parameters the event was called with
     */
    emit(event, ...params) {
        this.event = event
        const parts = event.split(this.delimiter)
        _emit(this._events, parts, 0, null, (fn) => {
            fn.apply(this, params)
        })
        return params
    }

    /**
     * Emits events asynchronously, in order, sequentially
     * @param {string} event - the event to emit
     * @param {...params} params - the parameters to call the event with
     * @returns {Array<any>} - an array of the parameters the event was called with
     */
    async emitAsyncSequential(event, ...params) {
        const handlers = []
        this.event = event
        const parts = event.split(this.delimiter)
        _emit(this._events, parts, 0, handlers)
        for (const handler of handlers) {
            // eslint-disable-next-line no-await-in-loop
            await handler.apply(this, params)
        }
        return params
    }

    /**
     * Emits events asynchronously, in parallel
     * @param {string} event - the event to emit
     * @param {...params} params - the parameters to call the event with
     * @returns {Array<any>} - an array of the parameters the event was called with
     */
    async emitAsync(event, ...params) {
        const handlers = []
        this.event = event
        const parts = event.split(this.delimiter)
        _emit(this._events, parts, 0, null, (fn) => {
            handlers.push(Promise.resolve(fn.apply(this, params)))
        })
        await Promise.all(handlers)
        return params
    }
}

/**
 * Internal function to handle event emission.
 * @param {EventEntry} scan - The starting point in the event structure.
 * @param {Array<string>} parts - The parts of the event name.
 * @param {number} index - The current index in the parts array.
 * @param {Array<Function>} [handlers] - An array to collect handlers (for async emission).
 * @param {Function} [call] - A function to call each handler (for sync emission).
 */
function _emit(scan, parts, index, handlers, call) {
    for (; scan && index < parts.length; index++) {
        const { allBelow } = scan
        let i = allBelow.length
        if (call) {
            for (--i; i >= 0; i--) {
                const handler = allBelow[i]
                if (handler) {
                    call(handler)
                }
            }
            if (scan._all) {
                _emit(scan.getAll(), parts, index + 1, handlers, call)
            }
            scan = scan.children[parts[index]]
        } else {
            if (i) Array.prototype.push.apply(handlers, allBelow)
            if (scan._all) {
                _emit(scan.getAll(), parts, index + 1, handlers, call)
            }
            scan = scan.children[parts[index]]
        }
    }
    if (scan) {
        const currentHandlers = scan.handlers
        if (call) {
            for (let i = 0, l = currentHandlers.length; i < l; i++) {
                const currentHandler = currentHandlers[i]
                if (currentHandler) call(currentHandler)
            }
        } else {
            for (let i = 0, l = currentHandlers.length; i < l; i++) {
                handlers.push(currentHandlers[i])
            }
        }
    }
}

Events.prototype.addEventListener = Events.prototype.on
Events.prototype.removeEventListener = Events.prototype.off
Events.prototype.addListener = Events.prototype.on
Events.prototype.removeListener = Events.prototype.off

module.exports = Events
