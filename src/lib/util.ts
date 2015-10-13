﻿import events = require("events");
import util = require("util");

import EventEmitter = events.EventEmitter;

export interface ILogWriter {
    trace(format: string, ...params: any[]): void;
    trace(obj: Object, format?: string, ...params: any[]): void;
    debug(format: string, ...params: any[]): void;
    debug(obj: Object, format?: string, ...params: any[]): void;
    info(format: string, ...params: any[]): void;
    info(obj: Object, format?: string, ...params: any[]): void;
    warn(format: string, ...params: any[]): void;
    warn(obj: Object, format?: string, ...params: any[]): void;
    error(format: string, ...params: any[]): void;
    error(obj: Object, format?: string, ...params: any[]): void;
    fatal(format: string, ...params: any[]): void;
    fatal(obj: Object, format?: string, ...params: any[]): void;
    level(): string|number;
}

export function toLogWriter(writer?: ILogWriter): ILogWriter {

    function check(names: string[]) {
        if (typeof writer !== "object") return false;

        for (var i = 0; i < names.length; i++) {
            if (typeof writer[names[i]] !== "function") return false;
        }

        return true;
    };

    var levels = ["trace", "debug", "info", "warn", "error", "fatal"];

    if (writer == null || typeof writer === "undefined") {
        // no writer specified, create a dummy writer
        var proxy = <ILogWriter>new Object();

        levels.forEach(level => {
            proxy[level] = (obj?: Object, format?: any, ...params: any[]): void => { };
        });

        proxy["level"] = () => { return 90; }

        return <ILogWriter>proxy;
    }

    if (check(levels)) {
        // looks like bunyan, great!
        return writer;
    }

    // #if NODE
    if (check(["log", "debug", "info", "warn", "error", "query"])) {
        // looks like winston, lets's create a proxy for it
        var proxy = <ILogWriter>new Object();

        levels.forEach(level => {
            proxy[level] = (obj?: Object, format?: any, ...params: any[]): void => {
                // log(level: string, msg: string, meta: any, callback ?: (err: Error, level: string, msg: string, meta: any) => void): LoggerInstance;
                if (typeof obj === "string") {
                    var msg = util.format(obj, format, params);
                    (<any>writer).log(level, msg);
                } else {
                    var msg = util.format(format, params);
                    (<any>writer).log(level, msg, obj);
                }
            };
        });

        proxy["level"] = () => { return (<any>writer).level; }

        return <ILogWriter>proxy;
    }
    // #endif

    if (check(["log", "info", "warn", "error", "dir"])) {
        // looks like console, lets's create a proxy for it
        var proxy = <ILogWriter>new Object();
        var console = <Console><any>writer;

        levels.forEach(level => {
            proxy[level] = function (obj?: Object, format?: any, ...params: any[]): void {

                // force actual console "log levels"
                var func;
                switch (level) {
                    case "trace":
                    case "debug":
                        func = "log";
                        break;
                    case "fatal":
                        func = "error";
                        break;
                    default:
                        func = level;
                        break;
                }

                var array = params;
                if (typeof format !== "undefined") array.unshift(format);
                if (typeof obj === "string") {
                    array.unshift(obj);
                } else {
                    array.push(obj);
                }
                
                array = [level.toUpperCase() + ":", util.format.apply(util, array)]; // WEB: array.push("(" + level.toUpperCase() + ")");

                (<Function>console[func]).apply(console, array);
            };
        });

        proxy["level"] = () => { return "debug"; }

        return <ILogWriter>proxy;
    }

    throw new TypeError("Unsupported log writer");
}

export class Options {

    constructor(options: {}) {
        if (!options) return;

        for (var propertyName in options) {
            if (options.hasOwnProperty(propertyName)) this[propertyName] = options[propertyName];
        }
    }

    merge(options: any): any {
        var result = {};

        for (var propertyName in this) {
            if (this.hasOwnProperty(propertyName)) result[propertyName] = this[propertyName];
        }

        if (options) for (var propertyName in options) {
            if (options.hasOwnProperty(propertyName)) result[propertyName] = options[propertyName];
        }

        return result;
    }

    intersect(options: any): any {
        var result = {};

        for (var propertyName in this) {
            if (!this.hasOwnProperty(propertyName)) continue;

            if (options && options.hasOwnProperty(propertyName)) {
                result[propertyName] = options[propertyName];
            } else {
                result[propertyName] = this[propertyName];
            }
        }

        return result;
    }
}

export class Task<TResult> extends EventEmitter {
    on(event: 'success', listener: (result: TResult) => void): Task<TResult>;
    on(event: 'error', listener: (err: Error) => void): Task<TResult>;
    on(event: 'finish', listener: (err: Error, ...args: any[]) => void): Task<TResult>;
    on(event: string, listener: Function): Task<TResult>;
    on(event: string, listener: Function): Task<TResult> {
        return super.on(event, listener);
    }

    constructor() {
        super();
    }
}

export function wrapCallback(owner: NodeJS.EventEmitter, task: EventEmitter, callback?: (err: Error, ...args: any[]) => void): (err: Error, ...args: any[]) => void {
    return finish;

    function finish(err: Error, ...args: any[]): void {
        var error = arguments[0];
        try {
            if (typeof callback === 'function') {
                callback.apply(owner, arguments);
                error = null;
            } else if (task) {
                if (!error) {
                    switch (arguments.length) {
                        case 0:
                        case 1:
                            task.emit("success");
                            task.emit("finish", error);
                            break;
                        case 2:
                            task.emit("success", arguments[1]);
                            task.emit("finish", error, arguments[1]);
                            break;
                        case 3:
                            task.emit("success", arguments[1], arguments[2]);
                            task.emit("finish", error, arguments[1], arguments[2]);
                            break;
                        default:
                            arguments[0] = "success";
                            task.emit.apply(task, arguments);

                            if (EventEmitter.listenerCount(task, "finish") > 0) {
                                arguments[0] = "finish";
                                Array.prototype.splice.call(arguments, 1, 0, error);
                                task.emit.apply(task, arguments);
                            }
                            break;
                    }

                } else {
                    if (EventEmitter.listenerCount(task, "error")) {
                        task.emit("error", error);
                        error = null;
                    }

                    task.emit("finish", error);
                }
            }
        } catch (err) {
            if (error) owner.emit("error", error);
            error = err;
        }

        if (error) owner.emit("error", error);
    }
}
