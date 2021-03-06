/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * @license
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

/**
 * define2 a module along with a payload.
 * @param {string} moduleName Name for the payload
 * @param {ignored} deps Ignored. For compatibility with CommonJS AMD Spec
 * @param {function} payload Function with (require2, exports, module) params
 */
function define2(moduleName, deps, payload) {
    if (typeof moduleName != "string") {
        throw new TypeError('Expected string, got: ' + moduleName);
    }

    if (arguments.length == 2) {
        payload = deps;
    }

    if (moduleName in define2.modules) {
        throw new Error("Module already define2d: " + moduleName);
    }
    define2.modules[moduleName] = payload;
};

/**
 * The global store of un-instantiated modules
 */
define2.modules = {};


/**
 * We invoke require2() in the context of a Domain so we can have multiple
 * sets of modules running separate from each other.
 * This contrasts with JSMs which are singletons, Domains allows us to
 * optionally load a CommonJS module twice with separate data each time.
 * Perhaps you want 2 command lines with a different set of commands in each,
 * for example.
 */
function Domain() {
    this.modules = {};
    this._currentModule = null;
}

var sourceMap;

(function () {

    /**
     * Lookup module names and resolve them by calling the definition function if
     * needed.
     * There are 2 ways to call this, either with an array of dependencies and a
     * callback to call when the dependencies are found (which can happen
     * asynchronously in an in-page context) or with a single string an no callback
     * where the dependency is resolved synchronously and returned.
     * The API is designed to be compatible with the CommonJS AMD spec and
     * require2JS.
     * @param {string[]|string} deps A name, or names for the payload
     * @param {function|undefined} callback Function to call when the dependencies
     * are resolved
     * @return {undefined|object} The module require2d or undefined for
     * array/callback method
     */
    Domain.prototype.require2 = function(deps, callback) {
        if (Array.isArray(deps)) {
            var params = deps.map(function(dep) {
                return this.lookup(dep);
            }, this);
            if (callback) {
                callback.apply(null, params);
            }
            return undefined;
        }
        else {
            return this.lookup(deps);
        }
    };

    function normalize(path) {
        var bits = path.split('/');
        var i = 1;
        while (i < bits.length) {
            if (bits[i] === '..') {
                bits.splice(i-1, 1);
            } else if (bits[i] === '.') {
                bits.splice(i, 1);
            } else {
                i++;
            }
        }
        return bits.join('/');
    }

    function join(a, b) {
        a = a.trim();
        b = b.trim();
        if (/^\//.test(b)) {
            return b;
        } else {
            return a.replace(/\/*$/, '/') + b;
        }
    }

    function dirname(path) {
        var bits = path.split('/');
        bits.pop();
        return bits.join('/');
    }

    /**
     * Lookup module names and resolve them by calling the definition function if
     * needed.
     * @param {string} moduleName A name for the payload to lookup
     * @return {object} The module specified by aModuleName or null if not found.
     */
    Domain.prototype.lookup = function(moduleName) {
        if (/^\./.test(moduleName)) {
            moduleName = normalize(join(dirname(this._currentModule), moduleName));
        }

        if (moduleName in this.modules) {
            var module = this.modules[moduleName];
            return module;
        }

        if (!(moduleName in define2.modules)) {
            throw new Error("Module not define2d: " + moduleName);
        }

        var module = define2.modules[moduleName];

        if (typeof module == "function") {
            var exports = {};
            var previousModule = this._currentModule;
            this._currentModule = moduleName;
            module(this.require2.bind(this), exports, { id: moduleName, uri: "" });
            this._currentModule = previousModule;
            module = exports;
        }

        // cache the resulting module object for next time
        this.modules[moduleName] = module;

        return module;
    };

}());

define2.Domain = Domain;
define2.globalDomain = new Domain();
var require2 = define2.globalDomain.require2.bind(define2.globalDomain);
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define2('source-map/source-map-generator', ['require2', 'exports', 'module' ,  'source-map/base64-vlq', 'source-map/util', 'source-map/array-set', 'source-map/mapping-list'], function(require2, exports, module) {

    var base64VLQ = require2('source-map/base64-vlq');
    var util = require2('source-map/util');
    var ArraySet = require2('source-map/array-set').ArraySet;
    var MappingList = require2('source-map/mapping-list').MappingList;

    /**
     * An instance of the SourceMapGenerator represents a source map which is
     * being built incrementally. You may pass an object with the following
     * properties:
     *
     *   - file: The filename of the generated source.
     *   - sourceRoot: A root for all relative URLs in this source map.
     */
    function SourceMapGenerator(aArgs) {
        if (!aArgs) {
            aArgs = {};
        }
        this._file = util.getArg(aArgs, 'file', null);
        this._sourceRoot = util.getArg(aArgs, 'sourceRoot', null);
        this._skipValidation = util.getArg(aArgs, 'skipValidation', false);
        this._sources = new ArraySet();
        this._names = new ArraySet();
        this._mappings = new MappingList();
        this._sourcesContents = null;
    }

    SourceMapGenerator.prototype._version = 3;

    /**
     * Creates a new SourceMapGenerator based on a SourceMapConsumer
     *
     * @param aSourceMapConsumer The SourceMap.
     */
    SourceMapGenerator.fromSourceMap =
        function SourceMapGenerator_fromSourceMap(aSourceMapConsumer) {
            var sourceRoot = aSourceMapConsumer.sourceRoot;
            var generator = new SourceMapGenerator({
                file: aSourceMapConsumer.file,
                sourceRoot: sourceRoot
            });
            aSourceMapConsumer.eachMapping(function (mapping) {
                var newMapping = {
                    generated: {
                        line: mapping.generatedLine,
                        column: mapping.generatedColumn
                    }
                };

                if (mapping.source != null) {
                    newMapping.source = mapping.source;
                    if (sourceRoot != null) {
                        newMapping.source = util.relative(sourceRoot, newMapping.source);
                    }

                    newMapping.original = {
                        line: mapping.originalLine,
                        column: mapping.originalColumn
                    };

                    if (mapping.name != null) {
                        newMapping.name = mapping.name;
                    }
                }

                generator.addMapping(newMapping);
            });
            aSourceMapConsumer.sources.forEach(function (sourceFile) {
                var content = aSourceMapConsumer.sourceContentFor(sourceFile);
                if (content != null) {
                    generator.setSourceContent(sourceFile, content);
                }
            });
            return generator;
        };

    /**
     * Add a single mapping from original source line and column to the generated
     * source's line and column for this source map being created. The mapping
     * object should have the following properties:
     *
     *   - generated: An object with the generated line and column positions.
     *   - original: An object with the original line and column positions.
     *   - source: The original source file (relative to the sourceRoot).
     *   - name: An optional original token name for this mapping.
     */
    SourceMapGenerator.prototype.addMapping =
        function SourceMapGenerator_addMapping(aArgs) {
            var generated = util.getArg(aArgs, 'generated');
            var original = util.getArg(aArgs, 'original', null);
            var source = util.getArg(aArgs, 'source', null);
            var name = util.getArg(aArgs, 'name', null);

            if (!this._skipValidation) {
                this._validateMapping(generated, original, source, name);
            }

            if (source != null && !this._sources.has(source)) {
                this._sources.add(source);
            }

            if (name != null && !this._names.has(name)) {
                this._names.add(name);
            }

            this._mappings.add({
                generatedLine: generated.line,
                generatedColumn: generated.column,
                originalLine: original != null && original.line,
                originalColumn: original != null && original.column,
                source: source,
                name: name
            });
        };

    /**
     * Set the source content for a source file.
     */
    SourceMapGenerator.prototype.setSourceContent =
        function SourceMapGenerator_setSourceContent(aSourceFile, aSourceContent) {
            var source = aSourceFile;
            if (this._sourceRoot != null) {
                source = util.relative(this._sourceRoot, source);
            }

            if (aSourceContent != null) {
                // Add the source content to the _sourcesContents map.
                // Create a new _sourcesContents map if the property is null.
                if (!this._sourcesContents) {
                    this._sourcesContents = {};
                }
                this._sourcesContents[util.toSetString(source)] = aSourceContent;
            } else if (this._sourcesContents) {
                // Remove the source file from the _sourcesContents map.
                // If the _sourcesContents map is empty, set the property to null.
                delete this._sourcesContents[util.toSetString(source)];
                if (Object.keys(this._sourcesContents).length === 0) {
                    this._sourcesContents = null;
                }
            }
        };

    /**
     * Applies the mappings of a sub-source-map for a specific source file to the
     * source map being generated. Each mapping to the supplied source file is
     * rewritten using the supplied source map. Note: The resolution for the
     * resulting mappings is the minimium of this map and the supplied map.
     *
     * @param aSourceMapConsumer The source map to be applied.
     * @param aSourceFile Optional. The filename of the source file.
     *        If omitted, SourceMapConsumer's file property will be used.
     * @param aSourceMapPath Optional. The dirname of the path to the source map
     *        to be applied. If relative, it is relative to the SourceMapConsumer.
     *        This parameter is needed when the two source maps aren't in the same
     *        directory, and the source map to be applied contains relative source
     *        paths. If so, those relative source paths need to be rewritten
     *        relative to the SourceMapGenerator.
     */
    SourceMapGenerator.prototype.applySourceMap =
        function SourceMapGenerator_applySourceMap(aSourceMapConsumer, aSourceFile, aSourceMapPath) {
            var sourceFile = aSourceFile;
            // If aSourceFile is omitted, we will use the file property of the SourceMap
            if (aSourceFile == null) {
                if (aSourceMapConsumer.file == null) {
                    throw new Error(
                            'SourceMapGenerator.prototype.applySourceMap require2s either an explicit source file, ' +
                            'or the source map\'s "file" property. Both were omitted.'
                    );
                }
                sourceFile = aSourceMapConsumer.file;
            }
            var sourceRoot = this._sourceRoot;
            // Make "sourceFile" relative if an absolute Url is passed.
            if (sourceRoot != null) {
                sourceFile = util.relative(sourceRoot, sourceFile);
            }
            // Applying the SourceMap can add and remove items from the sources and
            // the names array.
            var newSources = new ArraySet();
            var newNames = new ArraySet();

            // Find mappings for the "sourceFile"
            this._mappings.unsortedForEach(function (mapping) {
                if (mapping.source === sourceFile && mapping.originalLine != null) {
                    // Check if it can be mapped by the source map, then update the mapping.
                    var original = aSourceMapConsumer.originalPositionFor({
                        line: mapping.originalLine,
                        column: mapping.originalColumn
                    });
                    if (original.source != null) {
                        // Copy mapping
                        mapping.source = original.source;
                        if (aSourceMapPath != null) {
                            mapping.source = util.join(aSourceMapPath, mapping.source)
                        }
                        if (sourceRoot != null) {
                            mapping.source = util.relative(sourceRoot, mapping.source);
                        }
                        mapping.originalLine = original.line;
                        mapping.originalColumn = original.column;
                        if (original.name != null) {
                            mapping.name = original.name;
                        }
                    }
                }

                var source = mapping.source;
                if (source != null && !newSources.has(source)) {
                    newSources.add(source);
                }

                var name = mapping.name;
                if (name != null && !newNames.has(name)) {
                    newNames.add(name);
                }

            }, this);
            this._sources = newSources;
            this._names = newNames;

            // Copy sourcesContents of applied map.
            aSourceMapConsumer.sources.forEach(function (sourceFile) {
                var content = aSourceMapConsumer.sourceContentFor(sourceFile);
                if (content != null) {
                    if (aSourceMapPath != null) {
                        sourceFile = util.join(aSourceMapPath, sourceFile);
                    }
                    if (sourceRoot != null) {
                        sourceFile = util.relative(sourceRoot, sourceFile);
                    }
                    this.setSourceContent(sourceFile, content);
                }
            }, this);
        };

    /**
     * A mapping can have one of the three levels of data:
     *
     *   1. Just the generated position.
     *   2. The Generated position, original position, and original source.
     *   3. Generated and original position, original source, as well as a name
     *      token.
     *
     * To maintain consistency, we validate that any new mapping being added falls
     * in to one of these categories.
     */
    SourceMapGenerator.prototype._validateMapping =
        function SourceMapGenerator_validateMapping(aGenerated, aOriginal, aSource,
                                                    aName) {
            if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
                && aGenerated.line > 0 && aGenerated.column >= 0
                && !aOriginal && !aSource && !aName) {
                // Case 1.
                return;
            }
            else if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
                && aOriginal && 'line' in aOriginal && 'column' in aOriginal
                && aGenerated.line > 0 && aGenerated.column >= 0
                && aOriginal.line > 0 && aOriginal.column >= 0
                && aSource) {
                // Cases 2 and 3.
                return;
            }
            else {
                throw new Error('Invalid mapping: ' + JSON.stringify({
                    generated: aGenerated,
                    source: aSource,
                    original: aOriginal,
                    name: aName
                }));
            }
        };

    /**
     * Serialize the accumulated mappings in to the stream of base 64 VLQs
     * specified by the source map format.
     */
    SourceMapGenerator.prototype._serializeMappings =
        function SourceMapGenerator_serializeMappings() {
            var previousGeneratedColumn = 0;
            var previousGeneratedLine = 1;
            var previousOriginalColumn = 0;
            var previousOriginalLine = 0;
            var previousName = 0;
            var previousSource = 0;
            var result = '';
            var mapping;

            var mappings = this._mappings.toArray();

            for (var i = 0, len = mappings.length; i < len; i++) {
                mapping = mappings[i];

                if (mapping.generatedLine !== previousGeneratedLine) {
                    previousGeneratedColumn = 0;
                    while (mapping.generatedLine !== previousGeneratedLine) {
                        result += ';';
                        previousGeneratedLine++;
                    }
                }
                else {
                    if (i > 0) {
                        if (!util.compareByGeneratedPositions(mapping, mappings[i - 1])) {
                            continue;
                        }
                        result += ',';
                    }
                }

                result += base64VLQ.encode(mapping.generatedColumn
                    - previousGeneratedColumn);
                previousGeneratedColumn = mapping.generatedColumn;

                if (mapping.source != null) {
                    result += base64VLQ.encode(this._sources.indexOf(mapping.source)
                        - previousSource);
                    previousSource = this._sources.indexOf(mapping.source);

                    // lines are stored 0-based in SourceMap spec version 3
                    result += base64VLQ.encode(mapping.originalLine - 1
                        - previousOriginalLine);
                    previousOriginalLine = mapping.originalLine - 1;

                    result += base64VLQ.encode(mapping.originalColumn
                        - previousOriginalColumn);
                    previousOriginalColumn = mapping.originalColumn;

                    if (mapping.name != null) {
                        result += base64VLQ.encode(this._names.indexOf(mapping.name)
                            - previousName);
                        previousName = this._names.indexOf(mapping.name);
                    }
                }
            }

            return result;
        };

    SourceMapGenerator.prototype._generateSourcesContent =
        function SourceMapGenerator_generateSourcesContent(aSources, aSourceRoot) {
            return aSources.map(function (source) {
                if (!this._sourcesContents) {
                    return null;
                }
                if (aSourceRoot != null) {
                    source = util.relative(aSourceRoot, source);
                }
                var key = util.toSetString(source);
                return Object.prototype.hasOwnProperty.call(this._sourcesContents,
                    key)
                    ? this._sourcesContents[key]
                    : null;
            }, this);
        };

    /**
     * Externalize the source map.
     */
    SourceMapGenerator.prototype.toJSON =
        function SourceMapGenerator_toJSON() {
            var map = {
                version: this._version,
                sources: this._sources.toArray(),
                names: this._names.toArray(),
                mappings: this._serializeMappings()
            };
            if (this._file != null) {
                map.file = this._file;
            }
            if (this._sourceRoot != null) {
                map.sourceRoot = this._sourceRoot;
            }
            if (this._sourcesContents) {
                map.sourcesContent = this._generateSourcesContent(map.sources, map.sourceRoot);
            }

            return map;
        };

    /**
     * Render the source map being generated to a string.
     */
    SourceMapGenerator.prototype.toString =
        function SourceMapGenerator_toString() {
            return JSON.stringify(this);
        };

    exports.SourceMapGenerator = SourceMapGenerator;

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Based on the Base 64 VLQ implementation in Closure Compiler:
 * https://code.google.com/p/closure-compiler/source/browse/trunk/src/com/google/debugging/sourcemap/Base64VLQ.java
 *
 * Copyright 2011 The Closure Compiler Authors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *  * Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer in the documentation and/or other materials provided
 *    with the distribution.
 *  * Neither the name of Google Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
define2('source-map/base64-vlq', ['require2', 'exports', 'module' ,  'source-map/base64'], function(require2, exports, module) {

    var base64 = require2('source-map/base64');

    // A single base 64 digit can contain 6 bits of data. For the base 64 variable
    // length quantities we use in the source map spec, the first bit is the sign,
    // the next four bits are the actual value, and the 6th bit is the
    // continuation bit. The continuation bit tells us whether there are more
    // digits in this value following this digit.
    //
    //   Continuation
    //   |    Sign
    //   |    |
    //   V    V
    //   101011

    var VLQ_BASE_SHIFT = 5;

    // binary: 100000
    var VLQ_BASE = 1 << VLQ_BASE_SHIFT;

    // binary: 011111
    var VLQ_BASE_MASK = VLQ_BASE - 1;

    // binary: 100000
    var VLQ_CONTINUATION_BIT = VLQ_BASE;

    /**
     * Converts from a two-complement value to a value where the sign bit is
     * placed in the least significant bit.  For example, as decimals:
     *   1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
     *   2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
     */
    function toVLQSigned(aValue) {
        return aValue < 0
            ? ((-aValue) << 1) + 1
            : (aValue << 1) + 0;
    }

    /**
     * Converts to a two-complement value from a value where the sign bit is
     * placed in the least significant bit.  For example, as decimals:
     *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
     *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
     */
    function fromVLQSigned(aValue) {
        var isNegative = (aValue & 1) === 1;
        var shifted = aValue >> 1;
        return isNegative
            ? -shifted
            : shifted;
    }

    /**
     * Returns the base 64 VLQ encoded value.
     */
    exports.encode = function base64VLQ_encode(aValue) {
        var encoded = "";
        var digit;

        var vlq = toVLQSigned(aValue);

        do {
            digit = vlq & VLQ_BASE_MASK;
            vlq >>>= VLQ_BASE_SHIFT;
            if (vlq > 0) {
                // There are still more digits in this value, so we must make sure the
                // continuation bit is marked.
                digit |= VLQ_CONTINUATION_BIT;
            }
            encoded += base64.encode(digit);
        } while (vlq > 0);

        return encoded;
    };

    /**
     * Decodes the next base 64 VLQ value from the given string and returns the
     * value and the rest of the string via the out parameter.
     */
    exports.decode = function base64VLQ_decode(aStr, aOutParam) {
        var i = 0;
        var strLen = aStr.length;
        var result = 0;
        var shift = 0;
        var continuation, digit;

        do {
            if (i >= strLen) {
                throw new Error("Expected more digits in base 64 VLQ value.");
            }
            digit = base64.decode(aStr.charAt(i++));
            continuation = !!(digit & VLQ_CONTINUATION_BIT);
            digit &= VLQ_BASE_MASK;
            result = result + (digit << shift);
            shift += VLQ_BASE_SHIFT;
        } while (continuation);

        aOutParam.value = fromVLQSigned(result);
        aOutParam.rest = aStr.slice(i);
    };

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define2('source-map/base64', ['require2', 'exports', 'module' , ], function(require2, exports, module) {

    var charToIntMap = {};
    var intToCharMap = {};

    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
        .split('')
        .forEach(function (ch, index) {
            charToIntMap[ch] = index;
            intToCharMap[index] = ch;
        });

    /**
     * Encode an integer in the range of 0 to 63 to a single base 64 digit.
     */
    exports.encode = function base64_encode(aNumber) {
        if (aNumber in intToCharMap) {
            return intToCharMap[aNumber];
        }
        throw new TypeError("Must be between 0 and 63: " + aNumber);
    };

    /**
     * Decode a single base 64 digit to an integer.
     */
    exports.decode = function base64_decode(aChar) {
        if (aChar in charToIntMap) {
            return charToIntMap[aChar];
        }
        throw new TypeError("Not a valid base 64 digit: " + aChar);
    };

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define2('source-map/util', ['require2', 'exports', 'module' , ], function(require2, exports, module) {

    /**
     * This is a helper function for getting values from parameter/options
     * objects.
     *
     * @param args The object we are extracting values from
     * @param name The name of the property we are getting.
     * @param defaultValue An optional value to return if the property is missing
     * from the object. If this is not specified and the property is missing, an
     * error will be thrown.
     */
    function getArg(aArgs, aName, aDefaultValue) {
        if (aName in aArgs) {
            return aArgs[aName];
        } else if (arguments.length === 3) {
            return aDefaultValue;
        } else {
            throw new Error('"' + aName + '" is a require2d argument.');
        }
    }
    exports.getArg = getArg;

    var urlRegexp = /^(?:([\w+\-.]+):)?\/\/(?:(\w+:\w+)@)?([\w.]*)(?::(\d+))?(\S*)$/;
    var dataUrlRegexp = /^data:.+\,.+$/;

    function urlParse(aUrl) {
        var match = aUrl.match(urlRegexp);
        if (!match) {
            return null;
        }
        return {
            scheme: match[1],
            auth: match[2],
            host: match[3],
            port: match[4],
            path: match[5]
        };
    }
    exports.urlParse = urlParse;

    function urlGenerate(aParsedUrl) {
        var url = '';
        if (aParsedUrl.scheme) {
            url += aParsedUrl.scheme + ':';
        }
        url += '//';
        if (aParsedUrl.auth) {
            url += aParsedUrl.auth + '@';
        }
        if (aParsedUrl.host) {
            url += aParsedUrl.host;
        }
        if (aParsedUrl.port) {
            url += ":" + aParsedUrl.port
        }
        if (aParsedUrl.path) {
            url += aParsedUrl.path;
        }
        return url;
    }
    exports.urlGenerate = urlGenerate;

    /**
     * Normalizes a path, or the path portion of a URL:
     *
     * - Replaces consequtive slashes with one slash.
     * - Removes unnecessary '.' parts.
     * - Removes unnecessary '<dir>/..' parts.
     *
     * Based on code in the Node.js 'path' core module.
     *
     * @param aPath The path or url to normalize.
     */
    function normalize(aPath) {
        var path = aPath;
        var url = urlParse(aPath);
        if (url) {
            if (!url.path) {
                return aPath;
            }
            path = url.path;
        }
        var isAbsolute = (path.charAt(0) === '/');

        var parts = path.split(/\/+/);
        for (var part, up = 0, i = parts.length - 1; i >= 0; i--) {
            part = parts[i];
            if (part === '.') {
                parts.splice(i, 1);
            } else if (part === '..') {
                up++;
            } else if (up > 0) {
                if (part === '') {
                    // The first part is blank if the path is absolute. Trying to go
                    // above the root is a no-op. Therefore we can remove all '..' parts
                    // directly after the root.
                    parts.splice(i + 1, up);
                    up = 0;
                } else {
                    parts.splice(i, 2);
                    up--;
                }
            }
        }
        path = parts.join('/');

        if (path === '') {
            path = isAbsolute ? '/' : '.';
        }

        if (url) {
            url.path = path;
            return urlGenerate(url);
        }
        return path;
    }
    exports.normalize = normalize;

    /**
     * Joins two paths/URLs.
     *
     * @param aRoot The root path or URL.
     * @param aPath The path or URL to be joined with the root.
     *
     * - If aPath is a URL or a data URI, aPath is returned, unless aPath is a
     *   scheme-relative URL: Then the scheme of aRoot, if any, is prepended
     *   first.
     * - Otherwise aPath is a path. If aRoot is a URL, then its path portion
     *   is updated with the result and aRoot is returned. Otherwise the result
     *   is returned.
     *   - If aPath is absolute, the result is aPath.
     *   - Otherwise the two paths are joined with a slash.
     * - Joining for example 'http://' and 'www.example.com' is also supported.
     */
    function join(aRoot, aPath) {
        if (aRoot === "") {
            aRoot = ".";
        }
        if (aPath === "") {
            aPath = ".";
        }
        var aPathUrl = urlParse(aPath);
        var aRootUrl = urlParse(aRoot);
        if (aRootUrl) {
            aRoot = aRootUrl.path || '/';
        }

        // `join(foo, '//www.example.org')`
        if (aPathUrl && !aPathUrl.scheme) {
            if (aRootUrl) {
                aPathUrl.scheme = aRootUrl.scheme;
            }
            return urlGenerate(aPathUrl);
        }

        if (aPathUrl || aPath.match(dataUrlRegexp)) {
            return aPath;
        }

        // `join('http://', 'www.example.com')`
        if (aRootUrl && !aRootUrl.host && !aRootUrl.path) {
            aRootUrl.host = aPath;
            return urlGenerate(aRootUrl);
        }

        var joined = aPath.charAt(0) === '/'
            ? aPath
            : normalize(aRoot.replace(/\/+$/, '') + '/' + aPath);

        if (aRootUrl) {
            aRootUrl.path = joined;
            return urlGenerate(aRootUrl);
        }
        return joined;
    }
    exports.join = join;

    /**
     * Make a path relative to a URL or another path.
     *
     * @param aRoot The root path or URL.
     * @param aPath The path or URL to be made relative to aRoot.
     */
    function relative(aRoot, aPath) {
        if (aRoot === "") {
            aRoot = ".";
        }

        aRoot = aRoot.replace(/\/$/, '');

        // XXX: It is possible to remove this block, and the tests still pass!
        var url = urlParse(aRoot);
        if (aPath.charAt(0) == "/" && url && url.path == "/") {
            return aPath.slice(1);
        }

        return aPath.indexOf(aRoot + '/') === 0
            ? aPath.substr(aRoot.length + 1)
            : aPath;
    }
    exports.relative = relative;

    /**
     * Because behavior goes wacky when you set `__proto__` on objects, we
     * have to prefix all the strings in our set with an arbitrary character.
     *
     * See https://github.com/mozilla/source-map/pull/31 and
     * https://github.com/mozilla/source-map/issues/30
     *
     * @param String aStr
     */
    function toSetString(aStr) {
        return '$' + aStr;
    }
    exports.toSetString = toSetString;

    function fromSetString(aStr) {
        return aStr.substr(1);
    }
    exports.fromSetString = fromSetString;

    function strcmp(aStr1, aStr2) {
        var s1 = aStr1 || "";
        var s2 = aStr2 || "";
        return (s1 > s2) - (s1 < s2);
    }

    /**
     * Comparator between two mappings where the original positions are compared.
     *
     * Optionally pass in `true` as `onlyCompareGenerated` to consider two
     * mappings with the same original source/line/column, but different generated
     * line and column the same. Useful when searching for a mapping with a
     * stubbed out mapping.
     */
    function compareByOriginalPositions(mappingA, mappingB, onlyCompareOriginal) {
        var cmp;

        cmp = strcmp(mappingA.source, mappingB.source);
        if (cmp) {
            return cmp;
        }

        cmp = mappingA.originalLine - mappingB.originalLine;
        if (cmp) {
            return cmp;
        }

        cmp = mappingA.originalColumn - mappingB.originalColumn;
        if (cmp || onlyCompareOriginal) {
            return cmp;
        }

        cmp = strcmp(mappingA.name, mappingB.name);
        if (cmp) {
            return cmp;
        }

        cmp = mappingA.generatedLine - mappingB.generatedLine;
        if (cmp) {
            return cmp;
        }

        return mappingA.generatedColumn - mappingB.generatedColumn;
    };
    exports.compareByOriginalPositions = compareByOriginalPositions;

    /**
     * Comparator between two mappings where the generated positions are
     * compared.
     *
     * Optionally pass in `true` as `onlyCompareGenerated` to consider two
     * mappings with the same generated line and column, but different
     * source/name/original line and column the same. Useful when searching for a
     * mapping with a stubbed out mapping.
     */
    function compareByGeneratedPositions(mappingA, mappingB, onlyCompareGenerated) {
        var cmp;

        cmp = mappingA.generatedLine - mappingB.generatedLine;
        if (cmp) {
            return cmp;
        }

        cmp = mappingA.generatedColumn - mappingB.generatedColumn;
        if (cmp || onlyCompareGenerated) {
            return cmp;
        }

        cmp = strcmp(mappingA.source, mappingB.source);
        if (cmp) {
            return cmp;
        }

        cmp = mappingA.originalLine - mappingB.originalLine;
        if (cmp) {
            return cmp;
        }

        cmp = mappingA.originalColumn - mappingB.originalColumn;
        if (cmp) {
            return cmp;
        }

        return strcmp(mappingA.name, mappingB.name);
    };
    exports.compareByGeneratedPositions = compareByGeneratedPositions;

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define2('source-map/array-set', ['require2', 'exports', 'module' ,  'source-map/util'], function(require2, exports, module) {

    var util = require2('source-map/util');

    /**
     * A data structure which is a combination of an array and a set. Adding a new
     * member is O(1), testing for membership is O(1), and finding the index of an
     * element is O(1). Removing elements from the set is not supported. Only
     * strings are supported for membership.
     */
    function ArraySet() {
        this._array = [];
        this._set = {};
    }

    /**
     * Static method for creating ArraySet instances from an existing array.
     */
    ArraySet.fromArray = function ArraySet_fromArray(aArray, aAllowDuplicates) {
        var set = new ArraySet();
        for (var i = 0, len = aArray.length; i < len; i++) {
            set.add(aArray[i], aAllowDuplicates);
        }
        return set;
    };

    /**
     * Add the given string to this set.
     *
     * @param String aStr
     */
    ArraySet.prototype.add = function ArraySet_add(aStr, aAllowDuplicates) {
        var isDuplicate = this.has(aStr);
        var idx = this._array.length;
        if (!isDuplicate || aAllowDuplicates) {
            this._array.push(aStr);
        }
        if (!isDuplicate) {
            this._set[util.toSetString(aStr)] = idx;
        }
    };

    /**
     * Is the given string a member of this set?
     *
     * @param String aStr
     */
    ArraySet.prototype.has = function ArraySet_has(aStr) {
        return Object.prototype.hasOwnProperty.call(this._set,
            util.toSetString(aStr));
    };

    /**
     * What is the index of the given string in the array?
     *
     * @param String aStr
     */
    ArraySet.prototype.indexOf = function ArraySet_indexOf(aStr) {
        if (this.has(aStr)) {
            return this._set[util.toSetString(aStr)];
        }
        throw new Error('"' + aStr + '" is not in the set.');
    };

    /**
     * What is the element at the given index?
     *
     * @param Number aIdx
     */
    ArraySet.prototype.at = function ArraySet_at(aIdx) {
        if (aIdx >= 0 && aIdx < this._array.length) {
            return this._array[aIdx];
        }
        throw new Error('No element indexed by ' + aIdx);
    };

    /**
     * Returns the array representation of this set (which has the proper indices
     * indicated by indexOf). Note that this is a copy of the internal array used
     * for storing the members so that no one can mess with internal state.
     */
    ArraySet.prototype.toArray = function ArraySet_toArray() {
        return this._array.slice();
    };

    exports.ArraySet = ArraySet;

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2014 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define2('source-map/mapping-list', ['require2', 'exports', 'module' ,  'source-map/util'], function(require2, exports, module) {

    var util = require2('source-map/util');

    /**
     * Determine whether mappingB is after mappingA with respect to generated
     * position.
     */
    function generatedPositionAfter(mappingA, mappingB) {
        // Optimized for most common case
        var lineA = mappingA.generatedLine;
        var lineB = mappingB.generatedLine;
        var columnA = mappingA.generatedColumn;
        var columnB = mappingB.generatedColumn;
        return lineB > lineA || lineB == lineA && columnB >= columnA ||
            util.compareByGeneratedPositions(mappingA, mappingB) <= 0;
    }

    /**
     * A data structure to provide a sorted view of accumulated mappings in a
     * performance conscious manner. It trades a neglibable overhead in general
     * case for a large speedup in case of mappings being added in order.
     */
    function MappingList() {
        this._array = [];
        this._sorted = true;
        // Serves as infimum
        this._last = {generatedLine: -1, generatedColumn: 0};
    }

    /**
     * Iterate through internal items. This method takes the same arguments that
     * `Array.prototype.forEach` takes.
     *
     * NOTE: The order of the mappings is NOT guaranteed.
     */
    MappingList.prototype.unsortedForEach =
        function MappingList_forEach(aCallback, aThisArg) {
            this._array.forEach(aCallback, aThisArg);
        };

    /**
     * Add the given source mapping.
     *
     * @param Object aMapping
     */
    MappingList.prototype.add = function MappingList_add(aMapping) {
        var mapping;
        if (generatedPositionAfter(this._last, aMapping)) {
            this._last = aMapping;
            this._array.push(aMapping);
        } else {
            this._sorted = false;
            this._array.push(aMapping);
        }
    };

    /**
     * Returns the flat, sorted array of mappings. The mappings are sorted by
     * generated position.
     *
     * WARNING: This method returns internal data without copying, for
     * performance. The return value must NOT be mutated, and should be treated as
     * an immutable borrow. If you want to take ownership, you must make your own
     * copy.
     */
    MappingList.prototype.toArray = function MappingList_toArray() {
        if (!this._sorted) {
            this._array.sort(util.compareByGeneratedPositions);
            this._sorted = true;
        }
        return this._array;
    };

    exports.MappingList = MappingList;

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define2('source-map/source-map-consumer', ['require2', 'exports', 'module' ,  'source-map/util', 'source-map/indexed-source-map-consumer', 'source-map/basic-source-map-consumer'], function(require2, exports, module) {

    var util = require2('source-map/util');

    function SourceMapConsumer(aSourceMap) {
        var sourceMap = aSourceMap;
        if (typeof aSourceMap === 'string') {
            sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
        }

        // We do late require2s because the subclasses require2() this file.
        if (sourceMap.sections != null) {
            var indexedSourceMapConsumer = require2('source-map/indexed-source-map-consumer');
            return new indexedSourceMapConsumer.IndexedSourceMapConsumer(sourceMap);
        } else {
            var basicSourceMapConsumer = require2('source-map/basic-source-map-consumer');
            return new basicSourceMapConsumer.BasicSourceMapConsumer(sourceMap);
        }
    }

    SourceMapConsumer.fromSourceMap = function(aSourceMap) {
        var basicSourceMapConsumer = require2('source-map/basic-source-map-consumer');
        return basicSourceMapConsumer.BasicSourceMapConsumer
            .fromSourceMap(aSourceMap);
    }

    /**
     * The version of the source mapping spec that we are consuming.
     */
    SourceMapConsumer.prototype._version = 3;


    // `__generatedMappings` and `__originalMappings` are arrays that hold the
    // parsed mapping coordinates from the source map's "mappings" attribute. They
    // are lazily instantiated, accessed via the `_generatedMappings` and
    // `_originalMappings` getters respectively, and we only parse the mappings
    // and create these arrays once queried for a source location. We jump through
    // these hoops because there can be many thousands of mappings, and parsing
    // them is expensive, so we only want to do it if we must.
    //
    // Each object in the arrays is of the form:
    //
    //     {
    //       generatedLine: The line number in the generated code,
    //       generatedColumn: The column number in the generated code,
    //       source: The path to the original source file that generated this
    //               chunk of code,
    //       originalLine: The line number in the original source that
    //                     corresponds to this chunk of generated code,
    //       originalColumn: The column number in the original source that
    //                       corresponds to this chunk of generated code,
    //       name: The name of the original symbol which generated this chunk of
    //             code.
    //     }
    //
    // All properties except for `generatedLine` and `generatedColumn` can be
    // `null`.
    //
    // `_generatedMappings` is ordered by the generated positions.
    //
    // `_originalMappings` is ordered by the original positions.

    SourceMapConsumer.prototype.__generatedMappings = null;
    Object.defineProperty(SourceMapConsumer.prototype, '_generatedMappings', {
        get: function () {
            if (!this.__generatedMappings) {
                this.__generatedMappings = [];
                this.__originalMappings = [];
                this._parseMappings(this._mappings, this.sourceRoot);
            }

            return this.__generatedMappings;
        }
    });

    SourceMapConsumer.prototype.__originalMappings = null;
    Object.defineProperty(SourceMapConsumer.prototype, '_originalMappings', {
        get: function () {
            if (!this.__originalMappings) {
                this.__generatedMappings = [];
                this.__originalMappings = [];
                this._parseMappings(this._mappings, this.sourceRoot);
            }

            return this.__originalMappings;
        }
    });

    SourceMapConsumer.prototype._nextCharIsMappingSeparator =
        function SourceMapConsumer_nextCharIsMappingSeparator(aStr) {
            var c = aStr.charAt(0);
            return c === ";" || c === ",";
        };

    /**
     * Parse the mappings in a string in to a data structure which we can easily
     * query (the ordered arrays in the `this.__generatedMappings` and
     * `this.__originalMappings` properties).
     */
    SourceMapConsumer.prototype._parseMappings =
        function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
            throw new Error("Subclasses must implement _parseMappings");
        };

    SourceMapConsumer.GENERATED_ORDER = 1;
    SourceMapConsumer.ORIGINAL_ORDER = 2;

    /**
     * Iterate over each mapping between an original source/line/column and a
     * generated line/column in this source map.
     *
     * @param Function aCallback
     *        The function that is called with each mapping.
     * @param Object aContext
     *        Optional. If specified, this object will be the value of `this` every
     *        time that `aCallback` is called.
     * @param aOrder
     *        Either `SourceMapConsumer.GENERATED_ORDER` or
     *        `SourceMapConsumer.ORIGINAL_ORDER`. Specifies whether you want to
     *        iterate over the mappings sorted by the generated file's line/column
     *        order or the original's source/line/column order, respectively. Defaults to
     *        `SourceMapConsumer.GENERATED_ORDER`.
     */
    SourceMapConsumer.prototype.eachMapping =
        function SourceMapConsumer_eachMapping(aCallback, aContext, aOrder) {
            var context = aContext || null;
            var order = aOrder || SourceMapConsumer.GENERATED_ORDER;

            var mappings;
            switch (order) {
                case SourceMapConsumer.GENERATED_ORDER:
                    mappings = this._generatedMappings;
                    break;
                case SourceMapConsumer.ORIGINAL_ORDER:
                    mappings = this._originalMappings;
                    break;
                default:
                    throw new Error("Unknown order of iteration.");
            }

            var sourceRoot = this.sourceRoot;
            mappings.map(function (mapping) {
                var source = mapping.source;
                if (source != null && sourceRoot != null) {
                    source = util.join(sourceRoot, source);
                }
                return {
                    source: source,
                    generatedLine: mapping.generatedLine,
                    generatedColumn: mapping.generatedColumn,
                    originalLine: mapping.originalLine,
                    originalColumn: mapping.originalColumn,
                    name: mapping.name
                };
            }).forEach(aCallback, context);
        };

    /**
     * Returns all generated line and column information for the original source
     * and line provided. The only argument is an object with the following
     * properties:
     *
     *   - source: The filename of the original source.
     *   - line: The line number in the original source.
     *
     * and an array of objects is returned, each with the following properties:
     *
     *   - line: The line number in the generated source, or null.
     *   - column: The column number in the generated source, or null.
     */
    SourceMapConsumer.prototype.allGeneratedPositionsFor =
        function SourceMapConsumer_allGeneratedPositionsFor(aArgs) {
            // When there is no exact match, BasicSourceMapConsumer.prototype._findMapping
            // returns the index of the closest mapping less than the needle. By
            // setting needle.originalColumn to Infinity, we thus find the last
            // mapping for the given line, provided such a mapping exists.
            var needle = {
                source: util.getArg(aArgs, 'source'),
                originalLine: util.getArg(aArgs, 'line'),
                originalColumn: Infinity
            };

            if (this.sourceRoot != null) {
                needle.source = util.relative(this.sourceRoot, needle.source);
            }

            var mappings = [];

            var index = this._findMapping(needle,
                this._originalMappings,
                "originalLine",
                "originalColumn",
                util.compareByOriginalPositions);
            if (index >= 0) {
                var mapping = this._originalMappings[index];

                while (mapping && mapping.originalLine === needle.originalLine) {
                    mappings.push({
                        line: util.getArg(mapping, 'generatedLine', null),
                        column: util.getArg(mapping, 'generatedColumn', null),
                        lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
                    });

                    mapping = this._originalMappings[--index];
                }
            }

            return mappings.reverse();
        };

    exports.SourceMapConsumer = SourceMapConsumer;

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define2('source-map/indexed-source-map-consumer', ['require2', 'exports', 'module' ,  'source-map/util', 'source-map/binary-search', 'source-map/source-map-consumer', 'source-map/basic-source-map-consumer'], function(require2, exports, module) {

    var util = require2('source-map/util');
    var binarySearch = require2('source-map/binary-search');
    var SourceMapConsumer = require2('source-map/source-map-consumer').SourceMapConsumer;
    var BasicSourceMapConsumer = require2('source-map/basic-source-map-consumer').BasicSourceMapConsumer;

    /**
     * An IndexedSourceMapConsumer instance represents a parsed source map which
     * we can query for information. It differs from BasicSourceMapConsumer in
     * that it takes "indexed" source maps (i.e. ones with a "sections" field) as
     * input.
     *
     * The only parameter is a raw source map (either as a JSON string, or already
     * parsed to an object). According to the spec for indexed source maps, they
     * have the following attributes:
     *
     *   - version: Which version of the source map spec this map is following.
     *   - file: Optional. The generated file this source map is associated with.
     *   - sections: A list of section definitions.
     *
     * Each value under the "sections" field has two fields:
     *   - offset: The offset into the original specified at which this section
     *       begins to apply, define2d as an object with a "line" and "column"
     *       field.
     *   - map: A source map definition. This source map could also be indexed,
     *       but doesn't have to be.
     *
     * Instead of the "map" field, it's also possible to have a "url" field
     * specifying a URL to retrieve a source map from, but that's currently
     * unsupported.
     *
     * Here's an example source map, taken from the source map spec[0], but
     * modified to omit a section which uses the "url" field.
     *
     *  {
   *    version : 3,
   *    file: "app.js",
   *    sections: [{
   *      offset: {line:100, column:10},
   *      map: {
   *        version : 3,
   *        file: "section.js",
   *        sources: ["foo.js", "bar.js"],
   *        names: ["src", "maps", "are", "fun"],
   *        mappings: "AAAA,E;;ABCDE;"
   *      }
   *    }],
   *  }
     *
     * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit#heading=h.535es3xeprgt
     */
    function IndexedSourceMapConsumer(aSourceMap) {
        var sourceMap = aSourceMap;
        if (typeof aSourceMap === 'string') {
            sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
        }

        var version = util.getArg(sourceMap, 'version');
        var sections = util.getArg(sourceMap, 'sections');

        if (version != this._version) {
            throw new Error('Unsupported version: ' + version);
        }

        var lastOffset = {
            line: -1,
            column: 0
        };
        this._sections = sections.map(function (s) {
            if (s.url) {
                // The url field will require2 support for asynchronicity.
                // See https://github.com/mozilla/source-map/issues/16
                throw new Error('Support for url field in sections not implemented.');
            }
            var offset = util.getArg(s, 'offset');
            var offsetLine = util.getArg(offset, 'line');
            var offsetColumn = util.getArg(offset, 'column');

            if (offsetLine < lastOffset.line ||
                (offsetLine === lastOffset.line && offsetColumn < lastOffset.column)) {
                throw new Error('Section offsets must be ordered and non-overlapping.');
            }
            lastOffset = offset;

            return {
                generatedOffset: {
                    // The offset fields are 0-based, but we use 1-based indices when
                    // encoding/decoding from VLQ.
                    generatedLine: offsetLine + 1,
                    generatedColumn: offsetColumn + 1
                },
                consumer: new SourceMapConsumer(util.getArg(s, 'map'))
            }
        });
    }

    IndexedSourceMapConsumer.prototype = Object.create(SourceMapConsumer.prototype);
    IndexedSourceMapConsumer.prototype.constructor = SourceMapConsumer;

    /**
     * The version of the source mapping spec that we are consuming.
     */
    IndexedSourceMapConsumer.prototype._version = 3;

    /**
     * The list of original sources.
     */
    Object.defineProperty(IndexedSourceMapConsumer.prototype, 'sources', {
        get: function () {
            var sources = [];
            for (var i = 0; i < this._sections.length; i++) {
                for (var j = 0; j < this._sections[i].consumer.sources.length; j++) {
                    sources.push(this._sections[i].consumer.sources[j]);
                }
            };
            return sources;
        }
    });

    /**
     * Returns the original source, line, and column information for the generated
     * source's line and column positions provided. The only argument is an object
     * with the following properties:
     *
     *   - line: The line number in the generated source.
     *   - column: The column number in the generated source.
     *
     * and an object is returned with the following properties:
     *
     *   - source: The original source file, or null.
     *   - line: The line number in the original source, or null.
     *   - column: The column number in the original source, or null.
     *   - name: The original identifier, or null.
     */
    IndexedSourceMapConsumer.prototype.originalPositionFor =
        function IndexedSourceMapConsumer_originalPositionFor(aArgs) {
            var needle = {
                generatedLine: util.getArg(aArgs, 'line'),
                generatedColumn: util.getArg(aArgs, 'column')
            };

            // Find the section containing the generated position we're trying to map
            // to an original position.
            var sectionIndex = binarySearch.search(needle, this._sections,
                function(needle, section) {
                    var cmp = needle.generatedLine - section.generatedOffset.generatedLine;
                    if (cmp) {
                        return cmp;
                    }

                    return (needle.generatedColumn -
                        section.generatedOffset.generatedColumn);
                });
            var section = this._sections[sectionIndex];

            if (!section) {
                return {
                    source: null,
                    line: null,
                    column: null,
                    name: null
                };
            }

            return section.consumer.originalPositionFor({
                line: needle.generatedLine -
                    (section.generatedOffset.generatedLine - 1),
                column: needle.generatedColumn -
                    (section.generatedOffset.generatedLine === needle.generatedLine
                        ? section.generatedOffset.generatedColumn - 1
                        : 0)
            });
        };

    /**
     * Returns the original source content. The only argument is the url of the
     * original source file. Returns null if no original source content is
     * available.
     */
    IndexedSourceMapConsumer.prototype.sourceContentFor =
        function IndexedSourceMapConsumer_sourceContentFor(aSource, nullOnMissing) {
            for (var i = 0; i < this._sections.length; i++) {
                var section = this._sections[i];

                var content = section.consumer.sourceContentFor(aSource, true);
                if (content) {
                    return content;
                }
            }
            if (nullOnMissing) {
                return null;
            }
            else {
                throw new Error('"' + aSource + '" is not in the SourceMap.');
            }
        };

    /**
     * Returns the generated line and column information for the original source,
     * line, and column positions provided. The only argument is an object with
     * the following properties:
     *
     *   - source: The filename of the original source.
     *   - line: The line number in the original source.
     *   - column: The column number in the original source.
     *
     * and an object is returned with the following properties:
     *
     *   - line: The line number in the generated source, or null.
     *   - column: The column number in the generated source, or null.
     */
    IndexedSourceMapConsumer.prototype.generatedPositionFor =
        function IndexedSourceMapConsumer_generatedPositionFor(aArgs) {
            for (var i = 0; i < this._sections.length; i++) {
                var section = this._sections[i];

                // Only consider this section if the requested source is in the list of
                // sources of the consumer.
                if (section.consumer.sources.indexOf(util.getArg(aArgs, 'source')) === -1) {
                    continue;
                }
                var generatedPosition = section.consumer.generatedPositionFor(aArgs);
                if (generatedPosition) {
                    var ret = {
                        line: generatedPosition.line +
                            (section.generatedOffset.generatedLine - 1),
                        column: generatedPosition.column +
                            (section.generatedOffset.generatedLine === generatedPosition.line
                                ? section.generatedOffset.generatedColumn - 1
                                : 0)
                    };
                    return ret;
                }
            }

            return {
                line: null,
                column: null
            };
        };

    /**
     * Parse the mappings in a string in to a data structure which we can easily
     * query (the ordered arrays in the `this.__generatedMappings` and
     * `this.__originalMappings` properties).
     */
    IndexedSourceMapConsumer.prototype._parseMappings =
        function IndexedSourceMapConsumer_parseMappings(aStr, aSourceRoot) {
            this.__generatedMappings = [];
            this.__originalMappings = [];
            for (var i = 0; i < this._sections.length; i++) {
                var section = this._sections[i];
                var sectionMappings = section.consumer._generatedMappings;
                for (var j = 0; j < sectionMappings.length; j++) {
                    var mapping = sectionMappings[i];

                    var source = mapping.source;
                    var sourceRoot = section.consumer.sourceRoot;

                    if (source != null && sourceRoot != null) {
                        source = util.join(sourceRoot, source);
                    }

                    // The mappings coming from the consumer for the section have
                    // generated positions relative to the start of the section, so we
                    // need to offset them to be relative to the start of the concatenated
                    // generated file.
                    var adjustedMapping = {
                        source: source,
                        generatedLine: mapping.generatedLine +
                            (section.generatedOffset.generatedLine - 1),
                        generatedColumn: mapping.column +
                            (section.generatedOffset.generatedLine === mapping.generatedLine)
                            ? section.generatedOffset.generatedColumn - 1
                            : 0,
                        originalLine: mapping.originalLine,
                        originalColumn: mapping.originalColumn,
                        name: mapping.name
                    };

                    this.__generatedMappings.push(adjustedMapping);
                    if (typeof adjustedMapping.originalLine === 'number') {
                        this.__originalMappings.push(adjustedMapping);
                    }
                };
            };

            this.__generatedMappings.sort(util.compareByGeneratedPositions);
            this.__originalMappings.sort(util.compareByOriginalPositions);
        };

    exports.IndexedSourceMapConsumer = IndexedSourceMapConsumer;
});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define2('source-map/binary-search', ['require2', 'exports', 'module' , ], function(require2, exports, module) {

    /**
     * Recursive implementation of binary search.
     *
     * @param aLow Indices here and lower do not contain the needle.
     * @param aHigh Indices here and higher do not contain the needle.
     * @param aNeedle The element being searched for.
     * @param aHaystack The non-empty array being searched.
     * @param aCompare Function which takes two elements and returns -1, 0, or 1.
     */
    function recursiveSearch(aLow, aHigh, aNeedle, aHaystack, aCompare) {
        // This function terminates when one of the following is true:
        //
        //   1. We find the exact element we are looking for.
        //
        //   2. We did not find the exact element, but we can return the index of
        //      the next closest element that is less than that element.
        //
        //   3. We did not find the exact element, and there is no next-closest
        //      element which is less than the one we are searching for, so we
        //      return -1.
        var mid = Math.floor((aHigh - aLow) / 2) + aLow;
        var cmp = aCompare(aNeedle, aHaystack[mid], true);
        if (cmp === 0) {
            // Found the element we are looking for.
            return mid;
        }
        else if (cmp > 0) {
            // aHaystack[mid] is greater than our needle.
            if (aHigh - mid > 1) {
                // The element is in the upper half.
                return recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare);
            }
            // We did not find an exact match, return the next closest one
            // (termination case 2).
            return mid;
        }
        else {
            // aHaystack[mid] is less than our needle.
            if (mid - aLow > 1) {
                // The element is in the lower half.
                return recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare);
            }
            // The exact needle element was not found in this haystack. Determine if
            // we are in termination case (2) or (3) and return the appropriate thing.
            return aLow < 0 ? -1 : aLow;
        }
    }

    /**
     * This is an implementation of binary search which will always try and return
     * the index of next lowest value checked if there is no exact hit. This is
     * because mappings between original and generated line/col pairs are single
     * points, and there is an implicit region between each of them, so a miss
     * just means that you aren't on the very start of a region.
     *
     * @param aNeedle The element you are looking for.
     * @param aHaystack The array that is being searched.
     * @param aCompare A function which takes the needle and an element in the
     *     array and returns -1, 0, or 1 depending on whether the needle is less
     *     than, equal to, or greater than the element, respectively.
     */
    exports.search = function search(aNeedle, aHaystack, aCompare) {
        if (aHaystack.length === 0) {
            return -1;
        }
        return recursiveSearch(-1, aHaystack.length, aNeedle, aHaystack, aCompare)
    };

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define2('source-map/basic-source-map-consumer', ['require2', 'exports', 'module' ,  'source-map/util', 'source-map/binary-search', 'source-map/array-set', 'source-map/base64-vlq', 'source-map/source-map-consumer'], function(require2, exports, module) {

    var util = require2('source-map/util');
    var binarySearch = require2('source-map/binary-search');
    var ArraySet = require2('source-map/array-set').ArraySet;
    var base64VLQ = require2('source-map/base64-vlq');
    var SourceMapConsumer = require2('source-map/source-map-consumer').SourceMapConsumer;

    /**
     * A BasicSourceMapConsumer instance represents a parsed source map which we can
     * query for information about the original file positions by giving it a file
     * position in the generated source.
     *
     * The only parameter is the raw source map (either as a JSON string, or
     * already parsed to an object). According to the spec, source maps have the
     * following attributes:
     *
     *   - version: Which version of the source map spec this map is following.
     *   - sources: An array of URLs to the original source files.
     *   - names: An array of identifiers which can be referrenced by individual mappings.
     *   - sourceRoot: Optional. The URL root from which all sources are relative.
     *   - sourcesContent: Optional. An array of contents of the original source files.
     *   - mappings: A string of base64 VLQs which contain the actual mappings.
     *   - file: Optional. The generated file this source map is associated with.
     *
     * Here is an example source map, taken from the source map spec[0]:
     *
     *     {
   *       version : 3,
   *       file: "out.js",
   *       sourceRoot : "",
   *       sources: ["foo.js", "bar.js"],
   *       names: ["src", "maps", "are", "fun"],
   *       mappings: "AA,AB;;ABCDE;"
   *     }
     *
     * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit?pli=1#
     */
    function BasicSourceMapConsumer(aSourceMap) {
        var sourceMap = aSourceMap;
        if (typeof aSourceMap === 'string') {
            sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
        }

        var version = util.getArg(sourceMap, 'version');
        var sources = util.getArg(sourceMap, 'sources');
        // Sass 3.3 leaves out the 'names' array, so we deviate from the spec (which
        // require2s the array) to play nice here.
        var names = util.getArg(sourceMap, 'names', []);
        var sourceRoot = util.getArg(sourceMap, 'sourceRoot', null);
        var sourcesContent = util.getArg(sourceMap, 'sourcesContent', null);
        var mappings = util.getArg(sourceMap, 'mappings');
        var file = util.getArg(sourceMap, 'file', null);

        // Once again, Sass deviates from the spec and supplies the version as a
        // string rather than a number, so we use loose equality checking here.
        if (version != this._version) {
            throw new Error('Unsupported version: ' + version);
        }

        // Some source maps produce relative source paths like "./foo.js" instead of
        // "foo.js".  Normalize these first so that future comparisons will succeed.
        // See bugzil.la/1090768.
        sources = sources.map(util.normalize);

        // Pass `true` below to allow duplicate names and sources. While source maps
        // are intended to be compressed and deduplicated, the TypeScript compiler
        // sometimes generates source maps with duplicates in them. See Github issue
        // #72 and bugzil.la/889492.
        this._names = ArraySet.fromArray(names, true);
        this._sources = ArraySet.fromArray(sources, true);

        this.sourceRoot = sourceRoot;
        this.sourcesContent = sourcesContent;
        this._mappings = mappings;
        this.file = file;
    }

    BasicSourceMapConsumer.prototype = Object.create(SourceMapConsumer.prototype);
    BasicSourceMapConsumer.prototype.consumer = SourceMapConsumer;

    /**
     * Create a BasicSourceMapConsumer from a SourceMapGenerator.
     *
     * @param SourceMapGenerator aSourceMap
     *        The source map that will be consumed.
     * @returns BasicSourceMapConsumer
     */
    BasicSourceMapConsumer.fromSourceMap =
        function SourceMapConsumer_fromSourceMap(aSourceMap) {
            var smc = Object.create(BasicSourceMapConsumer.prototype);

            smc._names = ArraySet.fromArray(aSourceMap._names.toArray(), true);
            smc._sources = ArraySet.fromArray(aSourceMap._sources.toArray(), true);
            smc.sourceRoot = aSourceMap._sourceRoot;
            smc.sourcesContent = aSourceMap._generateSourcesContent(smc._sources.toArray(),
                smc.sourceRoot);
            smc.file = aSourceMap._file;

            smc.__generatedMappings = aSourceMap._mappings.toArray().slice();
            smc.__originalMappings = aSourceMap._mappings.toArray().slice()
                .sort(util.compareByOriginalPositions);

            return smc;
        };

    /**
     * The version of the source mapping spec that we are consuming.
     */
    BasicSourceMapConsumer.prototype._version = 3;

    /**
     * The list of original sources.
     */
    Object.defineProperty(BasicSourceMapConsumer.prototype, 'sources', {
        get: function () {
            return this._sources.toArray().map(function (s) {
                return this.sourceRoot != null ? util.join(this.sourceRoot, s) : s;
            }, this);
        }
    });

    /**
     * Parse the mappings in a string in to a data structure which we can easily
     * query (the ordered arrays in the `this.__generatedMappings` and
     * `this.__originalMappings` properties).
     */
    BasicSourceMapConsumer.prototype._parseMappings =
        function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
            var generatedLine = 1;
            var previousGeneratedColumn = 0;
            var previousOriginalLine = 0;
            var previousOriginalColumn = 0;
            var previousSource = 0;
            var previousName = 0;
            var str = aStr;
            var temp = {};
            var mapping;

            while (str.length > 0) {
                if (str.charAt(0) === ';') {
                    generatedLine++;
                    str = str.slice(1);
                    previousGeneratedColumn = 0;
                }
                else if (str.charAt(0) === ',') {
                    str = str.slice(1);
                }
                else {
                    mapping = {};
                    mapping.generatedLine = generatedLine;

                    // Generated column.
                    base64VLQ.decode(str, temp);
                    mapping.generatedColumn = previousGeneratedColumn + temp.value;
                    previousGeneratedColumn = mapping.generatedColumn;
                    str = temp.rest;

                    if (str.length > 0 && !this._nextCharIsMappingSeparator(str)) {
                        // Original source.
                        base64VLQ.decode(str, temp);
                        mapping.source = this._sources.at(previousSource + temp.value);
                        previousSource += temp.value;
                        str = temp.rest;
                        if (str.length === 0 || this._nextCharIsMappingSeparator(str)) {
                            throw new Error('Found a source, but no line and column');
                        }

                        // Original line.
                        base64VLQ.decode(str, temp);
                        mapping.originalLine = previousOriginalLine + temp.value;
                        previousOriginalLine = mapping.originalLine;
                        // Lines are stored 0-based
                        mapping.originalLine += 1;
                        str = temp.rest;
                        if (str.length === 0 || this._nextCharIsMappingSeparator(str)) {
                            throw new Error('Found a source and line, but no column');
                        }

                        // Original column.
                        base64VLQ.decode(str, temp);
                        mapping.originalColumn = previousOriginalColumn + temp.value;
                        previousOriginalColumn = mapping.originalColumn;
                        str = temp.rest;

                        if (str.length > 0 && !this._nextCharIsMappingSeparator(str)) {
                            // Original name.
                            base64VLQ.decode(str, temp);
                            mapping.name = this._names.at(previousName + temp.value);
                            previousName += temp.value;
                            str = temp.rest;
                        }
                    }

                    this.__generatedMappings.push(mapping);
                    if (typeof mapping.originalLine === 'number') {
                        this.__originalMappings.push(mapping);
                    }
                }
            }

            this.__generatedMappings.sort(util.compareByGeneratedPositions);
            this.__originalMappings.sort(util.compareByOriginalPositions);
        };

    /**
     * Find the mapping that best matches the hypothetical "needle" mapping that
     * we are searching for in the given "haystack" of mappings.
     */
    BasicSourceMapConsumer.prototype._findMapping =
        function SourceMapConsumer_findMapping(aNeedle, aMappings, aLineName,
                                               aColumnName, aComparator) {
            // To return the position we are searching for, we must first find the
            // mapping for the given position and then return the opposite position it
            // points to. Because the mappings are sorted, we can use binary search to
            // find the best mapping.

            if (aNeedle[aLineName] <= 0) {
                throw new TypeError('Line must be greater than or equal to 1, got '
                    + aNeedle[aLineName]);
            }
            if (aNeedle[aColumnName] < 0) {
                throw new TypeError('Column must be greater than or equal to 0, got '
                    + aNeedle[aColumnName]);
            }

            return binarySearch.search(aNeedle, aMappings, aComparator);
        };

    /**
     * Compute the last column for each generated mapping. The last column is
     * inclusive.
     */
    BasicSourceMapConsumer.prototype.computeColumnSpans =
        function SourceMapConsumer_computeColumnSpans() {
            for (var index = 0; index < this._generatedMappings.length; ++index) {
                var mapping = this._generatedMappings[index];

                // Mappings do not contain a field for the last generated columnt. We
                // can come up with an optimistic estimate, however, by assuming that
                // mappings are contiguous (i.e. given two consecutive mappings, the
                // first mapping ends where the second one starts).
                if (index + 1 < this._generatedMappings.length) {
                    var nextMapping = this._generatedMappings[index + 1];

                    if (mapping.generatedLine === nextMapping.generatedLine) {
                        mapping.lastGeneratedColumn = nextMapping.generatedColumn - 1;
                        continue;
                    }
                }

                // The last mapping for each line spans the entire line.
                mapping.lastGeneratedColumn = Infinity;
            }
        };

    /**
     * Returns the original source, line, and column information for the generated
     * source's line and column positions provided. The only argument is an object
     * with the following properties:
     *
     *   - line: The line number in the generated source.
     *   - column: The column number in the generated source.
     *
     * and an object is returned with the following properties:
     *
     *   - source: The original source file, or null.
     *   - line: The line number in the original source, or null.
     *   - column: The column number in the original source, or null.
     *   - name: The original identifier, or null.
     */
    BasicSourceMapConsumer.prototype.originalPositionFor =
        function SourceMapConsumer_originalPositionFor(aArgs) {
            var needle = {
                generatedLine: util.getArg(aArgs, 'line'),
                generatedColumn: util.getArg(aArgs, 'column')
            };

            var index = this._findMapping(needle,
                this._generatedMappings,
                "generatedLine",
                "generatedColumn",
                util.compareByGeneratedPositions);

            if (index >= 0) {
                var mapping = this._generatedMappings[index];

                if (mapping.generatedLine === needle.generatedLine) {
                    var source = util.getArg(mapping, 'source', null);
                    if (source != null && this.sourceRoot != null) {
                        source = util.join(this.sourceRoot, source);
                    }
                    return {
                        source: source,
                        line: util.getArg(mapping, 'originalLine', null),
                        column: util.getArg(mapping, 'originalColumn', null),
                        name: util.getArg(mapping, 'name', null)
                    };
                }
            }

            return {
                source: null,
                line: null,
                column: null,
                name: null
            };
        };

    /**
     * Returns the original source content. The only argument is the url of the
     * original source file. Returns null if no original source content is
     * availible.
     */
    BasicSourceMapConsumer.prototype.sourceContentFor =
        function SourceMapConsumer_sourceContentFor(aSource, nullOnMissing) {
            if (!this.sourcesContent) {
                return null;
            }

            if (this.sourceRoot != null) {
                aSource = util.relative(this.sourceRoot, aSource);
            }

            if (this._sources.has(aSource)) {
                return this.sourcesContent[this._sources.indexOf(aSource)];
            }

            var url;
            if (this.sourceRoot != null
                && (url = util.urlParse(this.sourceRoot))) {
                // XXX: file:// URIs and absolute paths lead to unexpected behavior for
                // many users. We can help them out when they expect file:// URIs to
                // behave like it would if they were running a local HTTP server. See
                // https://bugzilla.mozilla.org/show_bug.cgi?id=885597.
                var fileUriAbsPath = aSource.replace(/^file:\/\//, "");
                if (url.scheme == "file"
                    && this._sources.has(fileUriAbsPath)) {
                    return this.sourcesContent[this._sources.indexOf(fileUriAbsPath)]
                }

                if ((!url.path || url.path == "/")
                    && this._sources.has("/" + aSource)) {
                    return this.sourcesContent[this._sources.indexOf("/" + aSource)];
                }
            }

            // This function is used recursively from
            // IndexedSourceMapConsumer.prototype.sourceContentFor. In that case, we
            // don't want to throw if we can't find the source - we just want to
            // return null, so we provide a flag to exit gracefully.
            if (nullOnMissing) {
                return null;
            }
            else {
                throw new Error('"' + aSource + '" is not in the SourceMap.');
            }
        };

    /**
     * Returns the generated line and column information for the original source,
     * line, and column positions provided. The only argument is an object with
     * the following properties:
     *
     *   - source: The filename of the original source.
     *   - line: The line number in the original source.
     *   - column: The column number in the original source.
     *
     * and an object is returned with the following properties:
     *
     *   - line: The line number in the generated source, or null.
     *   - column: The column number in the generated source, or null.
     */
    BasicSourceMapConsumer.prototype.generatedPositionFor =
        function SourceMapConsumer_generatedPositionFor(aArgs) {
            var needle = {
                source: util.getArg(aArgs, 'source'),
                originalLine: util.getArg(aArgs, 'line'),
                originalColumn: util.getArg(aArgs, 'column')
            };

            if (this.sourceRoot != null) {
                needle.source = util.relative(this.sourceRoot, needle.source);
            }

            var index = this._findMapping(needle,
                this._originalMappings,
                "originalLine",
                "originalColumn",
                util.compareByOriginalPositions);

            if (index >= 0) {
                var mapping = this._originalMappings[index];

                return {
                    line: util.getArg(mapping, 'generatedLine', null),
                    column: util.getArg(mapping, 'generatedColumn', null),
                    lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
                };
            }

            return {
                line: null,
                column: null,
                lastColumn: null
            };
        };

    exports.BasicSourceMapConsumer = BasicSourceMapConsumer;

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define2('source-map/source-node', ['require2', 'exports', 'module' ,  'source-map/source-map-generator', 'source-map/util'], function(require2, exports, module) {

    var SourceMapGenerator = require2('source-map/source-map-generator').SourceMapGenerator;
    var util = require2('source-map/util');

    // Matches a Windows-style `\r\n` newline or a `\n` newline used by all other
    // operating systems these days (capturing the result).
    var REGEX_NEWLINE = /(\r?\n)/;

    // Newline character code for charCodeAt() comparisons
    var NEWLINE_CODE = 10;

    // Private symbol for identifying `SourceNode`s when multiple versions of
    // the source-map library are loaded. This MUST NOT CHANGE across
    // versions!
    var isSourceNode = "$$$isSourceNode$$$";

    /**
     * SourceNodes provide a way to abstract over interpolating/concatenating
     * snippets of generated JavaScript source code while maintaining the line and
     * column information associated with the original source code.
     *
     * @param aLine The original line number.
     * @param aColumn The original column number.
     * @param aSource The original source's filename.
     * @param aChunks Optional. An array of strings which are snippets of
     *        generated JS, or other SourceNodes.
     * @param aName The original identifier.
     */
    function SourceNode(aLine, aColumn, aSource, aChunks, aName) {
        this.children = [];
        this.sourceContents = {};
        this.line = aLine == null ? null : aLine;
        this.column = aColumn == null ? null : aColumn;
        this.source = aSource == null ? null : aSource;
        this.name = aName == null ? null : aName;
        this[isSourceNode] = true;
        if (aChunks != null) this.add(aChunks);
    }

    /**
     * Creates a SourceNode from generated code and a SourceMapConsumer.
     *
     * @param aGeneratedCode The generated code
     * @param aSourceMapConsumer The SourceMap for the generated code
     * @param aRelativePath Optional. The path that relative sources in the
     *        SourceMapConsumer should be relative to.
     */
    SourceNode.fromStringWithSourceMap =
        function SourceNode_fromStringWithSourceMap(aGeneratedCode, aSourceMapConsumer, aRelativePath) {
            // The SourceNode we want to fill with the generated code
            // and the SourceMap
            var node = new SourceNode();

            // All even indices of this array are one line of the generated code,
            // while all odd indices are the newlines between two adjacent lines
            // (since `REGEX_NEWLINE` captures its match).
            // Processed fragments are removed from this array, by calling `shiftNextLine`.
            var remainingLines = aGeneratedCode.split(REGEX_NEWLINE);
            var shiftNextLine = function() {
                var lineContents = remainingLines.shift();
                // The last line of a file might not have a newline.
                var newLine = remainingLines.shift() || "";
                return lineContents + newLine;
            };

            // We need to remember the position of "remainingLines"
            var lastGeneratedLine = 1, lastGeneratedColumn = 0;

            // The generate SourceNodes we need a code range.
            // To extract it current and last mapping is used.
            // Here we store the last mapping.
            var lastMapping = null;

            aSourceMapConsumer.eachMapping(function (mapping) {
                if (lastMapping !== null) {
                    // We add the code from "lastMapping" to "mapping":
                    // First check if there is a new line in between.
                    if (lastGeneratedLine < mapping.generatedLine) {
                        var code = "";
                        // Associate first line with "lastMapping"
                        addMappingWithCode(lastMapping, shiftNextLine());
                        lastGeneratedLine++;
                        lastGeneratedColumn = 0;
                        // The remaining code is added without mapping
                    } else {
                        // There is no new line in between.
                        // Associate the code between "lastGeneratedColumn" and
                        // "mapping.generatedColumn" with "lastMapping"
                        var nextLine = remainingLines[0];
                        var code = nextLine.substr(0, mapping.generatedColumn -
                            lastGeneratedColumn);
                        remainingLines[0] = nextLine.substr(mapping.generatedColumn -
                            lastGeneratedColumn);
                        lastGeneratedColumn = mapping.generatedColumn;
                        addMappingWithCode(lastMapping, code);
                        // No more remaining code, continue
                        lastMapping = mapping;
                        return;
                    }
                }
                // We add the generated code until the first mapping
                // to the SourceNode without any mapping.
                // Each line is added as separate string.
                while (lastGeneratedLine < mapping.generatedLine) {
                    node.add(shiftNextLine());
                    lastGeneratedLine++;
                }
                if (lastGeneratedColumn < mapping.generatedColumn) {
                    var nextLine = remainingLines[0];
                    node.add(nextLine.substr(0, mapping.generatedColumn));
                    remainingLines[0] = nextLine.substr(mapping.generatedColumn);
                    lastGeneratedColumn = mapping.generatedColumn;
                }
                lastMapping = mapping;
            }, this);
            // We have processed all mappings.
            if (remainingLines.length > 0) {
                if (lastMapping) {
                    // Associate the remaining code in the current line with "lastMapping"
                    addMappingWithCode(lastMapping, shiftNextLine());
                }
                // and add the remaining lines without any mapping
                node.add(remainingLines.join(""));
            }

            // Copy sourcesContent into SourceNode
            aSourceMapConsumer.sources.forEach(function (sourceFile) {
                var content = aSourceMapConsumer.sourceContentFor(sourceFile);
                if (content != null) {
                    if (aRelativePath != null) {
                        sourceFile = util.join(aRelativePath, sourceFile);
                    }
                    node.setSourceContent(sourceFile, content);
                }
            });

            return node;

            function addMappingWithCode(mapping, code) {
                if (mapping === null || mapping.source === undefined) {
                    node.add(code);
                } else {
                    var source = aRelativePath
                        ? util.join(aRelativePath, mapping.source)
                        : mapping.source;
                    node.add(new SourceNode(mapping.originalLine,
                        mapping.originalColumn,
                        source,
                        code,
                        mapping.name));
                }
            }
        };

    /**
     * Add a chunk of generated JS to this source node.
     *
     * @param aChunk A string snippet of generated JS code, another instance of
     *        SourceNode, or an array where each member is one of those things.
     */
    SourceNode.prototype.add = function SourceNode_add(aChunk) {
        if (Array.isArray(aChunk)) {
            aChunk.forEach(function (chunk) {
                this.add(chunk);
            }, this);
        }
        else if (aChunk[isSourceNode] || typeof aChunk === "string") {
            if (aChunk) {
                this.children.push(aChunk);
            }
        }
        else {
            throw new TypeError(
                    "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
            );
        }
        return this;
    };

    /**
     * Add a chunk of generated JS to the beginning of this source node.
     *
     * @param aChunk A string snippet of generated JS code, another instance of
     *        SourceNode, or an array where each member is one of those things.
     */
    SourceNode.prototype.prepend = function SourceNode_prepend(aChunk) {
        if (Array.isArray(aChunk)) {
            for (var i = aChunk.length-1; i >= 0; i--) {
                this.prepend(aChunk[i]);
            }
        }
        else if (aChunk[isSourceNode] || typeof aChunk === "string") {
            this.children.unshift(aChunk);
        }
        else {
            throw new TypeError(
                    "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
            );
        }
        return this;
    };

    /**
     * Walk over the tree of JS snippets in this node and its children. The
     * walking function is called once for each snippet of JS and is passed that
     * snippet and the its original associated source's line/column location.
     *
     * @param aFn The traversal function.
     */
    SourceNode.prototype.walk = function SourceNode_walk(aFn) {
        var chunk;
        for (var i = 0, len = this.children.length; i < len; i++) {
            chunk = this.children[i];
            if (chunk[isSourceNode]) {
                chunk.walk(aFn);
            }
            else {
                if (chunk !== '') {
                    aFn(chunk, { source: this.source,
                        line: this.line,
                        column: this.column,
                        name: this.name });
                }
            }
        }
    };

    /**
     * Like `String.prototype.join` except for SourceNodes. Inserts `aStr` between
     * each of `this.children`.
     *
     * @param aSep The separator.
     */
    SourceNode.prototype.join = function SourceNode_join(aSep) {
        var newChildren;
        var i;
        var len = this.children.length;
        if (len > 0) {
            newChildren = [];
            for (i = 0; i < len-1; i++) {
                newChildren.push(this.children[i]);
                newChildren.push(aSep);
            }
            newChildren.push(this.children[i]);
            this.children = newChildren;
        }
        return this;
    };

    /**
     * Call String.prototype.replace on the very right-most source snippet. Useful
     * for trimming whitespace from the end of a source node, etc.
     *
     * @param aPattern The pattern to replace.
     * @param aReplacement The thing to replace the pattern with.
     */
    SourceNode.prototype.replaceRight = function SourceNode_replaceRight(aPattern, aReplacement) {
        var lastChild = this.children[this.children.length - 1];
        if (lastChild[isSourceNode]) {
            lastChild.replaceRight(aPattern, aReplacement);
        }
        else if (typeof lastChild === 'string') {
            this.children[this.children.length - 1] = lastChild.replace(aPattern, aReplacement);
        }
        else {
            this.children.push(''.replace(aPattern, aReplacement));
        }
        return this;
    };

    /**
     * Set the source content for a source file. This will be added to the SourceMapGenerator
     * in the sourcesContent field.
     *
     * @param aSourceFile The filename of the source file
     * @param aSourceContent The content of the source file
     */
    SourceNode.prototype.setSourceContent =
        function SourceNode_setSourceContent(aSourceFile, aSourceContent) {
            this.sourceContents[util.toSetString(aSourceFile)] = aSourceContent;
        };

    /**
     * Walk over the tree of SourceNodes. The walking function is called for each
     * source file content and is passed the filename and source content.
     *
     * @param aFn The traversal function.
     */
    SourceNode.prototype.walkSourceContents =
        function SourceNode_walkSourceContents(aFn) {
            for (var i = 0, len = this.children.length; i < len; i++) {
                if (this.children[i][isSourceNode]) {
                    this.children[i].walkSourceContents(aFn);
                }
            }

            var sources = Object.keys(this.sourceContents);
            for (var i = 0, len = sources.length; i < len; i++) {
                aFn(util.fromSetString(sources[i]), this.sourceContents[sources[i]]);
            }
        };

    /**
     * Return the string representation of this source node. Walks over the tree
     * and concatenates all the various snippets together to one string.
     */
    SourceNode.prototype.toString = function SourceNode_toString() {
        var str = "";
        this.walk(function (chunk) {
            str += chunk;
        });
        return str;
    };

    /**
     * Returns the string representation of this source node along with a source
     * map.
     */
    SourceNode.prototype.toStringWithSourceMap = function SourceNode_toStringWithSourceMap(aArgs) {
        var generated = {
            code: "",
            line: 1,
            column: 0
        };
        var map = new SourceMapGenerator(aArgs);
        var sourceMappingActive = false;
        var lastOriginalSource = null;
        var lastOriginalLine = null;
        var lastOriginalColumn = null;
        var lastOriginalName = null;
        this.walk(function (chunk, original) {
            generated.code += chunk;
            if (original.source !== null
                && original.line !== null
                && original.column !== null) {
                if(lastOriginalSource !== original.source
                    || lastOriginalLine !== original.line
                    || lastOriginalColumn !== original.column
                    || lastOriginalName !== original.name) {
                    map.addMapping({
                        source: original.source,
                        original: {
                            line: original.line,
                            column: original.column
                        },
                        generated: {
                            line: generated.line,
                            column: generated.column
                        },
                        name: original.name
                    });
                }
                lastOriginalSource = original.source;
                lastOriginalLine = original.line;
                lastOriginalColumn = original.column;
                lastOriginalName = original.name;
                sourceMappingActive = true;
            } else if (sourceMappingActive) {
                map.addMapping({
                    generated: {
                        line: generated.line,
                        column: generated.column
                    }
                });
                lastOriginalSource = null;
                sourceMappingActive = false;
            }
            for (var idx = 0, length = chunk.length; idx < length; idx++) {
                if (chunk.charCodeAt(idx) === NEWLINE_CODE) {
                    generated.line++;
                    generated.column = 0;
                    // Mappings end at eol
                    if (idx + 1 === length) {
                        lastOriginalSource = null;
                        sourceMappingActive = false;
                    } else if (sourceMappingActive) {
                        map.addMapping({
                            source: original.source,
                            original: {
                                line: original.line,
                                column: original.column
                            },
                            generated: {
                                line: generated.line,
                                column: generated.column
                            },
                            name: original.name
                        });
                    }
                } else {
                    generated.column++;
                }
            }
        });
        this.walkSourceContents(function (sourceFile, sourceContent) {
            map.setSourceContent(sourceFile, sourceContent);
        });

        return { code: generated.code, map: map };
    };

    exports.SourceNode = SourceNode;

});
/* -*- Mode: js; js-indent-level: 2; -*- */
///////////////////////////////////////////////////////////////////////////////

sourceMap = {
    SourceMapConsumer: require2('source-map/source-map-consumer').SourceMapConsumer,
    SourceMapGenerator: require2('source-map/source-map-generator').SourceMapGenerator,
    SourceNode: require2('source-map/source-node').SourceNode
};

// In order to allow this module to be used as a requirejs module,
// we define it here as so.
if (typeof define === 'function' && define.amd) {
    define('sourceMap', sourceMap);
}
/**
 * @license
 * Domain Public by Eric Wendelin http://www.eriwen.com/ (2008)
 *                   Luke Smith http://lucassmith.name/ (2008)
 *                  Loic Dachary <loic@dachary.org> (2008)
 *                  Johan Euphrosine <proppy@aminche.com> (2008)
 *                  Oyvind Sean Kinsey http://kinsey.no/blog (2010)
 *                  Victor Homyakov <victor-homyakov@users.sourceforge.net> (2010)
 *
 */
/*global module, exports, define, ActiveXObject*/
printStackTrace = (function() {
    /**
     * Main function giving a function stack trace with a forced or passed in Error
     *
     * @cfg {Error} e The error to create a stacktrace from (optional)
     * @cfg {Boolean} guess If we should try to resolve the names of anonymous functions
     * @return {Array} of Strings with functions, lines, files, and arguments where possible
     */
    function printStackTrace(options) {
        options = options || {guess: true};
        var ex = options.e || null, guess = !!options.guess, mode = options.mode || null;
        var p = new printStackTrace.implementation(), result = p.run(ex, mode);
        return (guess) ? p.guessAnonymousFunctions(result) : result;
    }

    printStackTrace.implementation = function() {
    };

    printStackTrace.implementation.prototype = {
        /**
         * @param {Error} [ex] The error to create a stacktrace from (optional)
         * @param {String} [mode] Forced mode (optional, mostly for unit tests)
         */
        run: function(ex, mode) {
            ex = ex || this.createException();
            mode = mode || this.mode(ex);
            if (mode === 'other') {
                return this.other(arguments.callee);
            } else {
                return this[mode](ex);
            }
        },

        createException: function() {
            try {
                this.undef();
            } catch (e) {
                return e;
            }
        },

        /**
         * Mode could differ for different exception, e.g.
         * exceptions in Chrome may or may not have arguments or stack.
         *
         * @return {String} mode of operation for the exception
         */
        mode: function(e) {
            if (typeof window !== 'undefined' && window.navigator.userAgent.indexOf('PhantomJS') > -1) {
                return 'phantomjs';
            }

            if (e['arguments'] && e.stack) {
                return 'chrome';
            }

            if (e.stack && e.sourceURL) {
                return 'safari';
            }

            if (e.stack && e.number) {
                return 'ie';
            }

            if (e.stack && e.fileName) {
                return 'firefox';
            }

            if (e.message && e['opera#sourceloc']) {
                // e.message.indexOf("Backtrace:") > -1 -> opera9
                // 'opera#sourceloc' in e -> opera9, opera10a
                // !e.stacktrace -> opera9
                if (!e.stacktrace) {
                    return 'opera9'; // use e.message
                }
                if (e.message.indexOf('\n') > -1 && e.message.split('\n').length > e.stacktrace.split('\n').length) {
                    // e.message may have more stack entries than e.stacktrace
                    return 'opera9'; // use e.message
                }
                return 'opera10a'; // use e.stacktrace
            }

            if (e.message && e.stack && e.stacktrace) {
                // e.stacktrace && e.stack -> opera10b
                if (e.stacktrace.indexOf("called from line") < 0) {
                    return 'opera10b'; // use e.stacktrace, format differs from 'opera10a'
                }
                // e.stacktrace && e.stack -> opera11
                return 'opera11'; // use e.stacktrace, format differs from 'opera10a', 'opera10b'
            }

            if (e.stack && !e.fileName) {
                // Chrome 27 does not have e.arguments as earlier versions,
                // but still does not have e.fileName as Firefox
                return 'chrome';
            }

            return 'other';
        },

        /**
         * Given a context, function name, and callback function, overwrite it so that it calls
         * printStackTrace() first with a callback and then runs the rest of the body.
         *
         * @param {Object} context of execution (e.g. window)
         * @param {String} functionName to instrument
         * @param {Function} callback function to call with a stack trace on invocation
         */
        instrumentFunction: function(context, functionName, callback) {
            context = context || window;
            var original = context[functionName];
            context[functionName] = function instrumented() {
                callback.call(this, printStackTrace().slice(4));
                return context[functionName]._instrumented.apply(this, arguments);
            };
            context[functionName]._instrumented = original;
        },

        /**
         * Given a context and function name of a function that has been
         * instrumented, revert the function to it's original (non-instrumented)
         * state.
         *
         * @param {Object} context of execution (e.g. window)
         * @param {String} functionName to de-instrument
         */
        deinstrumentFunction: function(context, functionName) {
            if (context[functionName].constructor === Function &&
                context[functionName]._instrumented &&
                context[functionName]._instrumented.constructor === Function) {
                context[functionName] = context[functionName]._instrumented;
            }
        },

        /**
         * Given an Error object, return a formatted Array based on Chrome's stack string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        chrome: function(e) {
            return (e.stack + '\n')
                .replace(/^[\s\S]+?\s+at\s+/, ' at ') // remove message
                .replace(/^\s+(at eval )?at\s+/gm, '') // remove 'at' and indentation
                .replace(/^([^\(]+?)([\n$])/gm, '{anonymous}() ($1)$2')
                .replace(/^Object.<anonymous>\s*\(([^\)]+)\)/gm, '{anonymous}() ($1)')
                .replace(/^(.+) \((.+)\)$/gm, '$1@$2')
                .split('\n')
                .slice(0, -1);
        },

        /**
         * Given an Error object, return a formatted Array based on Safari's stack string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        safari: function(e) {
            return e.stack.replace(/\[native code\]\n/m, '')
                .replace(/^(?=\w+Error\:).*$\n/m, '')
                .replace(/^@/gm, '{anonymous}()@')
                .split('\n');
        },

        /**
         * Given an Error object, return a formatted Array based on IE's stack string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        ie: function(e) {
            return e.stack
                .replace(/^\s*at\s+(.*)$/gm, '$1')
                .replace(/^Anonymous function\s+/gm, '{anonymous}() ')
                .replace(/^(.+)\s+\((.+)\)$/gm, '$1@$2')
                .split('\n')
                .slice(1);
        },

        /**
         * Given an Error object, return a formatted Array based on Firefox's stack string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        firefox: function(e) {
            return e.stack.replace(/(?:\n@:0)?\s+$/m, '')
                .replace(/^(?:\((\S*)\))?@/gm, '{anonymous}($1)@')
                .split('\n');
        },

        opera11: function(e) {
            var ANON = '{anonymous}', lineRE = /^.*line (\d+), column (\d+)(?: in (.+))? in (\S+):$/;
            var lines = e.stacktrace.split('\n'), result = [];

            for (var i = 0, len = lines.length; i < len; i += 2) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    var location = match[4] + ':' + match[1] + ':' + match[2];
                    var fnName = match[3] || "global code";
                    fnName = fnName.replace(/<anonymous function: (\S+)>/, "$1").replace(/<anonymous function>/, ANON);
                    result.push(fnName + '@' + location + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
                }
            }

            return result;
        },

        opera10b: function(e) {
            // "<anonymous function: run>([arguments not available])@file://localhost/G:/js/stacktrace.js:27\n" +
            // "printStackTrace([arguments not available])@file://localhost/G:/js/stacktrace.js:18\n" +
            // "@file://localhost/G:/js/test/functional/testcase1.html:15"
            var lineRE = /^(.*)@(.+):(\d+)$/;
            var lines = e.stacktrace.split('\n'), result = [];

            for (var i = 0, len = lines.length; i < len; i++) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    var fnName = match[1] ? (match[1] + '()') : "global code";
                    result.push(fnName + '@' + match[2] + ':' + match[3]);
                }
            }

            return result;
        },

        /**
         * Given an Error object, return a formatted Array based on Opera 10's stacktrace string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        opera10a: function(e) {
            // "  Line 27 of linked script file://localhost/G:/js/stacktrace.js\n"
            // "  Line 11 of inline#1 script in file://localhost/G:/js/test/functional/testcase1.html: In function foo\n"
            var ANON = '{anonymous}', lineRE = /Line (\d+).*script (?:in )?(\S+)(?:: In function (\S+))?$/i;
            var lines = e.stacktrace.split('\n'), result = [];

            for (var i = 0, len = lines.length; i < len; i += 2) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    var fnName = match[3] || ANON;
                    result.push(fnName + '()@' + match[2] + ':' + match[1] + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
                }
            }

            return result;
        },

        // Opera 7.x-9.2x only!
        opera9: function(e) {
            // "  Line 43 of linked script file://localhost/G:/js/stacktrace.js\n"
            // "  Line 7 of inline#1 script in file://localhost/G:/js/test/functional/testcase1.html\n"
            var ANON = '{anonymous}', lineRE = /Line (\d+).*script (?:in )?(\S+)/i;
            var lines = e.message.split('\n'), result = [];

            for (var i = 2, len = lines.length; i < len; i += 2) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    result.push(ANON + '()@' + match[2] + ':' + match[1] + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
                }
            }

            return result;
        },

        phantomjs: function(e) {
            var ANON = '{anonymous}', lineRE = /(\S+) \((\S+)\)/i;
            var lines = e.stack.split('\n'), result = [];

            for (var i = 1, len = lines.length; i < len; i++) {
                lines[i] = lines[i].replace(/^\s+at\s+/gm, '');
                var match = lineRE.exec(lines[i]);
                if (match) {
                    result.push(match[1] + '()@' + match[2]);
                }
                else {
                    result.push(ANON + '()@' + lines[i]);
                }
            }

            return result;
        },

        // Safari 5-, IE 9-, and others
        other: function(curr) {
            var ANON = '{anonymous}', fnRE = /function(?:\s+([\w$]+))?\s*\(/, stack = [], fn, args, maxStackSize = 10;
            var slice = Array.prototype.slice;
            while (curr && stack.length < maxStackSize) {
                fn = fnRE.test(curr.toString()) ? RegExp.$1 || ANON : ANON;
                try {
                    args = slice.call(curr['arguments'] || []);
                } catch (e) {
                    args = ['Cannot access arguments: ' + e];
                }
                stack[stack.length] = fn + '(' + this.stringifyArguments(args) + ')';
                try {
                    curr = curr.caller;
                } catch (e) {
                    stack[stack.length] = 'Cannot access caller: ' + e;
                    break;
                }
            }
            return stack;
        },

        /**
         * Given arguments array as a String, substituting type names for non-string types.
         *
         * @param {Arguments,Array} args
         * @return {String} stringified arguments
         */
        stringifyArguments: function(args) {
            var result = [];
            var slice = Array.prototype.slice;
            for (var i = 0; i < args.length; ++i) {
                var arg = args[i];
                if (arg === undefined) {
                    result[i] = 'undefined';
                } else if (arg === null) {
                    result[i] = 'null';
                } else if (arg.constructor) {
                    // TODO constructor comparison does not work for iframes
                    if (arg.constructor === Array) {
                        if (arg.length < 3) {
                            result[i] = '[' + this.stringifyArguments(arg) + ']';
                        } else {
                            result[i] = '[' + this.stringifyArguments(slice.call(arg, 0, 1)) + '...' + this.stringifyArguments(slice.call(arg, -1)) + ']';
                        }
                    } else if (arg.constructor === Object) {
                        result[i] = '#object';
                    } else if (arg.constructor === Function) {
                        result[i] = '#function';
                    } else if (arg.constructor === String) {
                        result[i] = '"' + arg + '"';
                    } else if (arg.constructor === Number) {
                        result[i] = arg;
                    } else {
                        result[i] = '?';
                    }
                }
            }
            return result.join(',');
        },

        sourceCache: {},

        /**
         * @return {String} the text from a given URL
         */
        ajax: function(url) {
            var req = this.createXMLHTTPObject();
            if (req) {
                try {
                    req.open('GET', url, false);
                    //req.overrideMimeType('text/plain');
                    //req.overrideMimeType('text/javascript');
                    req.send(null);
                    //return req.status == 200 ? req.responseText : '';
                    return req.responseText;
                } catch (e) {
                }
            }
            return '';
        },

        /**
         * Try XHR methods in order and store XHR factory.
         *
         * @return {XMLHttpRequest} XHR function or equivalent
         */
        createXMLHTTPObject: function() {
            var xmlhttp, XMLHttpFactories = [
                function() {
                    return new XMLHttpRequest();
                }, function() {
                    return new ActiveXObject('Msxml2.XMLHTTP');
                }, function() {
                    return new ActiveXObject('Msxml3.XMLHTTP');
                }, function() {
                    return new ActiveXObject('Microsoft.XMLHTTP');
                }
            ];
            for (var i = 0; i < XMLHttpFactories.length; i++) {
                try {
                    xmlhttp = XMLHttpFactories[i]();
                    // Use memoization to cache the factory
                    this.createXMLHTTPObject = XMLHttpFactories[i];
                    return xmlhttp;
                } catch (e) {
                }
            }
        },

        /**
         * Given a URL, check if it is in the same domain (so we can get the source
         * via Ajax).
         *
         * @param url {String} source url
         * @return {Boolean} False if we need a cross-domain request
         */
        isSameDomain: function(url) {
            return typeof location !== "undefined" && url.indexOf(location.hostname) !== -1; // location may not be defined, e.g. when running from nodejs.
        },

        /**
         * Get source code from given URL if in the same domain.
         *
         * @param url {String} JS source URL
         * @return {Array} Array of source code lines
         */
        getSource: function(url) {
            // TODO reuse source from script tags?
            if (!(url in this.sourceCache)) {
                this.sourceCache[url] = this.ajax(url).split('\n');
            }
            return this.sourceCache[url];
        },

        guessAnonymousFunctions: function(stack) {
            for (var i = 0; i < stack.length; ++i) {
                var reStack = /\{anonymous\}\(.*\)@(.*)/,
                    reRef = /^(.*?)(?::(\d+))(?::(\d+))?(?: -- .+)?$/,
                    frame = stack[i], ref = reStack.exec(frame);

                if (ref) {
                    var m = reRef.exec(ref[1]);
                    if (m) { // If falsey, we did not get any file/line information
                        var file = m[1], lineno = m[2], charno = m[3] || 0;
                        if (file && this.isSameDomain(file) && lineno) {
                            var functionName = this.guessAnonymousFunction(file, lineno, charno);
                            stack[i] = frame.replace('{anonymous}', functionName);
                        }
                    }
                }
            }
            return stack;
        },

        guessAnonymousFunction: function(url, lineNo, charNo) {
            var ret;
            try {
                ret = this.findFunctionName(this.getSource(url), lineNo);
            } catch (e) {
                ret = 'getSource failed with url: ' + url + ', exception: ' + e.toString();
            }
            return ret;
        },

        findFunctionName: function(source, lineNo) {
            // FIXME findFunctionName fails for compressed source
            // (more than one function on the same line)
            // function {name}({args}) m[1]=name m[2]=args
            var reFunctionDeclaration = /function\s+([^(]*?)\s*\(([^)]*)\)/;
            // {name} = function ({args}) TODO args capture
            // /['"]?([0-9A-Za-z_]+)['"]?\s*[:=]\s*function(?:[^(]*)/
            var reFunctionExpression = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*function\b/;
            // {name} = eval()
            var reFunctionEvaluation = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*(?:eval|new Function)\b/;
            // Walk backwards in the source lines until we find
            // the line which matches one of the patterns above
            var code = "", line, maxLines = Math.min(lineNo, 20), m, commentPos;
            for (var i = 0; i < maxLines; ++i) {
                // lineNo is 1-based, source[] is 0-based
                line = source[lineNo - i - 1];
                commentPos = line.indexOf('//');
                if (commentPos >= 0) {
                    line = line.substr(0, commentPos);
                }
                // TODO check other types of comments? Commented code may lead to false positive
                if (line) {
                    code = line + code;
                    m = reFunctionExpression.exec(code);
                    if (m && m[1]) {
                        return m[1];
                    }
                    m = reFunctionDeclaration.exec(code);
                    if (m && m[1]) {
                        //return m[1] + "(" + (m[2] || "") + ")";
                        return m[1];
                    }
                    m = reFunctionEvaluation.exec(code);
                    if (m && m[1]) {
                        return m[1];
                    }
                }
            }
            return '(?)';
        }
    };

    // In order to allow this module to be used as a requirejs module,
    // we define it here as so.
    if (typeof define === 'function' && define.amd) {
        define('stacktrace', printStackTrace);
    }

    return printStackTrace;
}());
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */ /*global sinon, module, require, XDomainRequest, SourceMapConsumer, _*/


/*
 * Copyright (c) 2012-2015 Citrix Systems, Inc.
 * All Rights Reserved Worldwide.
 *
 * THIS PROGRAM IS CONFIDENTIAL AND PROPRIETARY TO CITRIX SYSTEMS, INC.
 * AND CONSTITUTES A VALUABLE TRADE SECRET.  Any unauthorized use,
 * reproduction, modification, or disclosure of this program is
 * strictly prohibited.  Any use of this program by an authorized
 * licensee is strictly subject to the terms and conditions,
 * including confidentiality obligations, set forth in the applicable
 * License and Co-Branding Agreement between Citrix Systems, Inc. and
 * the licensee.
 */

window.ErrorTelemetry = (function () {
    "use strict";

    /**
     * ErrorTelemetry
     * ~Helps you find the errors you never knew existed!~
     *
     * @param loggingUrl The logging url of the service we want to send the data to. Ex: https://logging.citrixonline.com
     * @param maxTelemtries The maximum # of telemetries we want to send per page. Pass null for default 5. Note: SPA's might need to handle this differently.
     * @param serviceName The name of your service, ex: ext-admin. Pass null for default "error-telemetry.js"
     * @param location The window.location object. Leave empty for default definition.
     * @param history The window.History object. Leave empty for default definition.
     * @param sourceMap The sourceMap object. Leave null or undefined.
     * @param printStackTrace The stacktrace object. Leave null or undefined.
     * @constructor
     */
    /*jshint validthis: true */
    function ErrorTelemetry(loggingUrl, maxTelemetries, serviceName, loc, hist, sm, pst) {
        // local initializations for the error telemetry object
        var console = window.console || {
                log: function () {
                },
                error: function () {
                }
            },
            augmentedData = {},
            errorLoopCounter = 0,
            sourceMapCache = {},
            self = this, // Needed for onClick hook.
            isStrictModeEnabled = (function () { // http://stackoverflow.com/questions/10480108/is-there-any-way-to-check-if-strict-mode-is-enforced
                return !this;
            })(),
            MAX_TELEMETRIES_TO_SEND = maxTelemetries || 5,
            SERVICE_NAME = serviceName || "error-telemetry.js",
            LOGGING_SVC_URL = loggingUrl || "",
            printStackTrace = pst || window.printStackTrace,
            location = loc || window.location,
            sourceMap = sm || window.sourceMap,
            history = hist || window.history;

        /**
         * Creates a HTTPRequest by iterating through options until a supported option
         * is available for transferring the data. This allows us to support possibly outdated browsers.
         *
         * @param method The method to use: 'PUT', 'GET', 'POST', etc.
         * @param url The URL to send the request to.
         * @returns XMLHttpRequest or (IE 8-9 => XDomainRequest) or (IE 5-7 => ActiveXObject)
         */
        function createCORSRequest(method, url) {
            var xhr;

            if (typeof XMLHttpRequest !== "undefined") {
                xhr = new XMLHttpRequest();
                xhr.open(method, url, true);

            } else if (typeof XDomainRequest !== "undefined") {

                // Otherwise, check if XDomainRequest.
                // XDomainRequest only exists in IE, and is IE's way of making CORS requests.
                xhr = new XDomainRequest();
                xhr.open(method, url);
            }

            if (xhr === undefined) {
                // Otherwise, CORS is not supported by the browser.
                xhr = null;
            }
            return xhr;
        }
        this.createCORSRequest = createCORSRequest;

        /**
         * Sets the augmented data to be included with the errors, if set it overwrites the previous
         * augmented data.
         * @param data The data used to augment the error. Ex: { "userKey" : 12345, "accountKey" : 12345}
         */
        function setAugmentedData(data) {
            if (data) {
                augmentedData = data;
            }
        }
        this.setAugmentedData = setAugmentedData;

        /**
         * Augments the existing augmentedData with JSON data provided in data.
         * @param data The data used to augment the error. Ex: { "userKey" : 12345, "accountKey" : 12345}
         */
        function updateAugmentedData(data) {
            if (data) {
                augmentedData = augment(data);
            }
        }
        this.updateAugmentedData = updateAugmentedData;

        /**
         * Error filtering allows you to decide which errors you want to send and which you want to reject.
         * Must be redefined to be useful!
         * @param error The error object.
         * @returns Boolean true if you want to allow the error, false if you want to reject the error.
         */
        function allow(error) {
            return true;
        }
        this.allow = allow;

        /**
         * Converts the object to a string representation.
         * @param object
         * @returns {*|boolean|string|string}
         */
        function toString(object) {
            return (object && typeof (object.toString) === 'function' && object.toString()) || "";
        }

        /**
         * Copies all fields from augmentedData into obj, if they don't exist in obj yet and then returns the object.
         * @param obj The data to augment the object with.
         * @returns Object The augmented object
         */
        function augment(obj) {
            var key;
            obj = obj || {};
            for (key in augmentedData) {
                if (Object.prototype.hasOwnProperty.call(augmentedData, key) && !Object.prototype.hasOwnProperty.call(obj, key)) {
                    obj[key] = augmentedData[key];
                }
            }
            return obj;
        }

        /**
         * Send the telemetry data to the telemetry service.
         * @param error The error object containing information about the javascript error.
         */
        function sendTelemetry(error) {
            //let's be extremely paranoid here
            var windowProtocol = location.protocol,
                windowHost = location.host;

            if (!(windowProtocol && windowHost)) {
                return;
            }

            try {
                var url = LOGGING_SVC_URL,
                    postRequest = self.createCORSRequest("POST", url),
                    newObj = { "service": SERVICE_NAME, "type": "js_error", "entries": [error] };


                if (!postRequest) {
                    throw new Error('CORS not supported');
                } else {
                    postRequest.setRequestHeader("Content-Type", "application/json");
                    postRequest.send(JSON.stringify(newObj));
                }
            } catch (e) {
                console.error(SERVICE_NAME + ": ERROR: Sending telemetry: ", e);
            }
        }
        this.sendTelemetry = sendTelemetry;

        /**
         * Removes the start of the string if it contains this value.
         * @param s The string we are removing the start of the string from.
         * @param start The string we are matching.
         * @returns A subset of the string s after removing the start value.
         */
            // removes 'start' from string 's', if 's' starts with 'start'
        function removeStartOfString(s, start) {
            //paranoid programming: coerce to string
            s = toString(s);
            if (s.indexOf(start) === 0) {
                return s.substring(start.length);
            }
            return s;
        }

        /**
         * Tries to generate a stack trace from Error e (if present) and provide
         * source mapped errors, mapping stacktrace values to their unminified counterparts.
         *
         * @param e The javascript error we are handling.
         * @param sourceMapFile The sourcemap associated with the javascript file the error originated from.
         * @returns The generated stacktrace from the error.
         */
        function getStackTrace(e, sourceMapFile) {
            if (!e) {
                return e;
            } else if (!e.stack && !isStrictModeEnabled) {
                var generatedStack = printStackTrace();
                // try to generate a stack trace
                if (generatedStack && generatedStack.length > 0) {
                    e.stack = generatedStack;
                } else {
                    return e.stack;
                }
            }
            var stack = e.stack;

            try {
                // Remove the type name and message if it appears in front of the stack trace as we log that already anyways
                stack = removeStartOfString(stack, e.name);
                stack = removeStartOfString(stack, ": ");
                stack = removeStartOfString(stack, e.message);
                //trim each line then split
                var split = stack.replace(/^\s+|\s+$/gm, '').split("\n");

                // Add information about the sourcemap and replace the minified columns and lines with the unminified
                // columns and lines as provided by the map file.
                if (sourceMapFile !== null && sourceMapFile !== undefined && sourceMap !== undefined) {
                    var sourceMapConsumer = sourceMap.SourceMapConsumer(sourceMapFile),
                        index;

                    for (index = 0; index < split.length; index++) {
                        var errorNumberSplit = split[index].split(":"),
                            errorNumberLength = errorNumberSplit.length,
                            lineNumber = 0, columnNumber = 0;

                        // The stacktrace only has the line, so use it and default to column 0.
                        if (errorNumberLength == 2) {
                            lineNumber = parseInt(errorNumberSplit.pop(), 10);

                        } else if (errorNumberLength > 2) {
                            columnNumber = parseInt(errorNumberSplit.pop(), 10);
                            lineNumber = parseInt(errorNumberSplit.pop(), 10);
                        }

                        // dont bother to search for original position if it is invalid
                        if (lineNumber !== 0) {
                            var originalLocation = sourceMapConsumer.originalPositionFor({
                                line: lineNumber,
                                column: columnNumber
                            });

                            if (errorNumberLength == 2) {
                                errorNumberSplit.push(originalLocation.line);
                            } else if (errorNumberLength > 2) {
                                errorNumberSplit.push(originalLocation.line);
                                errorNumberSplit.push(originalLocation.column);
                            }
                        }

                        // Join the split values back together
                        split[index] = errorNumberSplit.join(":");
                    }
                }
                // Reassemble the stack lines into a concatenated stack.
                stack = split.join(" ");
            } catch (ex) {
                // Log to the console that we failed to generate a log. Who will read this though?
                console.error(SERVICE_NAME + ": ERROR: getStackTrace ", ex);
            }
            return toString(stack);
        }
        this.getStackTrace = getStackTrace;

        /**
         * Separates and returns on the last part of a fileName where the error occurred. Allows us to shorten the parameter
         * and usually the fileName only exists once.
         * @param path The path to the javascript file that returned the error.
         * @returns The filename that generated the error.
         */
        function lastPart(path) {
            return path && toString(path).split('/').pop();
        }

        /**
         * Finds the url associated with the js script file.
         * @param jsFile The jsFile that returned the error.
         * @returns The script url of the jsFile or null if it does not exist.
         */
        function getScriptUrl(jsFile) {
            var scripts = document.getElementsByTagName('script'), scriptUrl = null, index, url;

            for (index = 0; index < scripts.length; index++) {
                url = scripts[index].src;

                if (url.indexOf(jsFile) > -1) {
                    scriptUrl = scripts[index].src;
                    break;
                }
            }

            if (scriptUrl === undefined) {
                scriptUrl = null;
            }

            return scriptUrl;
        }
        this.getScriptUrl = getScriptUrl;

        /**
         * Updates the error with source map information if it is provided, which allows you to
         * directly reference your .src file when debugging.
         *
         * @param data The current error object.
         * @param response The source map data.
         * @param jsFile The javascript file name that we are getting the source map data about. 'ex: blah.js'
         */
        function addSourceMapData(data, response, jsFile) {
            var generatedNumbers, sourceMapConsumer = new sourceMap.SourceMapConsumer(response);

            // Add source map response to cache
            sourceMapCache[jsFile] = response || null;

            // Enhance the data quality with source map info
            data.stack = self.getStackTrace(data.e, response).replace(/.js/ig, '.js.src');

            generatedNumbers = sourceMapConsumer.originalPositionFor({
                line: data.line,
                column: data.column
            });

            data.line = generatedNumbers.line;
            data.column = generatedNumbers.column;

            data.fileName = data.fileName + ".src";
            data.e = undefined;
        }

        /**
         * Adds additional information about the users browser, the users identity and
         * sends the error after trying to add source map data.
         * @param data The error object to send.
         */
        function sendDataForError(data) {
            var getRequest, jsFileUrl, jsFile;

            // Determines whether or not we want to reject the error
            if (!self.allow(data)) {
                return;
            }

            // Assign variables
            jsFileUrl = self.getScriptUrl(data.fileName);
            jsFile = jsFileUrl !== null ? jsFileUrl.split("/").pop() : {};

            // Add additional information about the users browser
            data.browser = navigator.userAgent;
            data.url = window.location.pathname + window.location.search + window.location.hash;

            /**
             * Try to enhance the data by parsing the stack trace and mapping it to the resulting *fileName*.js.src file
             * so that we can have a better idea of what caused the error. If it fails, just send the basic stacktrace
             * and we can manually decode it.
             */
            try {
                // If there is no js file, there should be no resulting map. Also,
                // if there is no source mapper, no point in getting the mapping information.
                    try {
                        // cannot enhance the data, so just send what we have
                        data.stack = self.getStackTrace(data.e, null);
                        data.e = undefined;
                        self.sendTelemetry(data);
                    } catch (ex3) {
                    }
            } catch (ex) {
                // exception while trying to enhance the data, just send the data
                try {
                    data.e = undefined;
                    self.sendTelemetry(data);
                } catch (ex2) {
                }
            }
        }
        this.sendDataForError = sendDataForError;

        /**
         * Sends a manual error handled by the developer. Allows the developer to intentionally send an error.
         * @param e The error that was generated.
         * @param type The type of error that is being sent.
         * @param data Additional information to augment the error.
         */
        function sendError(e, type, data) {
            try {
                e = e || {};
                data = augment(data);
                data.type = type || 'exception';
                data.name = e.name;
                data.line = e.lineNumber;
                data.column = e.columnNumber;
                data.message = e.message;
                data.fileName = lastPart(e.fileName);
                data.e = e;
            } catch (ex) {
                console.error(SERVICE_NAME + ": ERROR: sendError ", ex);
            }

            self.sendDataForError(data);
        }
        this.sendError = sendError;

        /**
         * The initial error handler that captures errors on the frontend onWindowError and then prepares
         * the error to be sent to the logging server.
         *
         * @param message The message provided by the error.
         * @param fileName The file that caused the error.
         * @param line The line associated with the error.
         * @param column The column associated with the error.
         * @param e The actual error object itself.
         */
        function onWindowError(message, fileName, line, column, e) {
            var data = {};

            e = e || {};

            errorLoopCounter++;

            if (errorLoopCounter <= MAX_TELEMETRIES_TO_SEND) {
                try {
                    data = augment({});
                    data.type = 'onWindowError';
                    data.name = e.name;
                    data.line = line;
                    data.column = column;
                    data.message = message;
                    data.fileName = lastPart(fileName);
                    data.e = e;
                } catch (ex) {
                    //Sorry about this level of paranoia. If the onError function throws, the on shouldn't invoke
                    //onError again. But still, I don't know how to otherwise explain some very strange behaviour as observed
                    //on live @Kosta
                    try {
                        console.error(SERVICE_NAME + ": ERROR: onWindowError ", ex);
                    } catch (ex2) {
                        //do nothing
                    }
                }

                self.sendDataForError(data);
            }
        }
        this.onWindowError = onWindowError;

        /**
         * Sends error telemetry for all requirejs errors when bound to
         * requirejs.onError using error-telemetry.onRequireJSError
         *
         * @param e The error object from the requireJs error.
         */
        function onRequireJSError(e) {

            e = e || {};
            var data = {};

            errorLoopCounter++;

            if (errorLoopCounter <= MAX_TELEMETRIES_TO_SEND) {
                try {
                    //deal with null or undefined error
                    data = augment({});
                    data.type = 'requirejs';
                    data.requireType = e.requireType;
                    data.message = e.message;
                    data.module = e.requireMap && e.requireMap.id;
                    data.e = e;
                } catch (ex) {
                    console.error(SERVICE_NAME + ": ERROR: onRequireJSError ", ex);
                }

                self.sendDataForError(data);
            }
        }
        this.onRequireJSError = onRequireJSError;

        /**
         * Resets the error count so that we can send more errors if we reach the limit.
         */
        function resetErrorCount() {
            errorLoopCounter = 0;
        }
        this.resetErrorCount = resetErrorCount;

        /**
         * Resets the source map cache to empty.
         */
        function resetSourceMapCache() {
            sourceMapCache = {};
        }
        this.resetSourceMapCache = resetSourceMapCache;
    }

    // In order to allow this module to be used as a requirejs module,
    // we define it here as so.
    if (typeof define === 'function' && define.amd) {
        define('errorTelemetry', ErrorTelemetry);
    }

    return ErrorTelemetry;
}());
